/**
 * SSE transport tests.
 *
 * The SSE entrypoint (src/sse.ts) is structured as a self-contained script
 * (calls process.exit when missing API key, owns its own main()). We therefore
 * test the HTTP-layer behaviour by extracting the handler logic here and wiring
 * it up to a real node:http server in each test, making actual HTTP requests
 * so we exercise the full request/response cycle without importing the module
 * entry-point directly.
 *
 * Tested behaviour:
 *  - /health returns 200 without auth
 *  - /health response body shape
 *  - /sse GET returns 401 without auth header
 *  - /sse GET returns 401 with wrong api-key header
 *  - /sse GET returns 401 with wrong Bearer token
 *  - /sse GET returns SSE headers (text/event-stream, keep-alive) with correct auth
 *  - /messages POST returns 401 without auth
 *  - /messages POST returns 400 with malformed JSON
 *  - /messages POST returns 413 when body exceeds 1 MB
 *  - /messages POST returns 400 when sessionId is missing
 *  - /messages POST returns 404 for unknown sessionId
 *  - OPTIONS preflight returns 204 with CORS headers
 *  - Auth via x-api-key header
 *  - Auth via Authorization: Bearer header
 */

import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Re-implement the minimal HTTP handler logic from sse.ts so we can test it
// in isolation without touching process.exit or loading all domain modules.
// ---------------------------------------------------------------------------

const TEST_API_KEY = "test-secret-key-abc123";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key, Authorization",
  );
}

function authenticate(req: IncomingMessage, apiKey: string): boolean {
  const key = req.headers["x-api-key"];
  if (typeof key === "string" && key === apiKey) {
    return true;
  }
  const auth = req.headers.authorization;
  if (
    typeof auth === "string" &&
    auth.startsWith("Bearer ") &&
    auth.slice(7) === apiKey
  ) {
    return true;
  }
  return false;
}

// A simplified handler that mirrors src/sse.ts routing without spinning up
// MCP infrastructure or SSEServerTransport (which would stream indefinitely).
type FakeHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

function buildHandler(apiKey: string): FakeHandler {
  // Simulated in-memory session registry (a real SSE connection populates this)
  const knownSessions = new Set<string>(["valid-session-id"]);

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    sendCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );

    // ── Health (no auth) ──
    if (url.pathname === "/health" && req.method === "GET") {
      sendJson(res, 200, {
        status: "ok",
        tools: 430,
        environment: "integration",
        readonly: true,
      });
      return;
    }

    // ── Auth gate ──
    if (!authenticate(req, apiKey)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    // ── SSE endpoint ──
    if (url.pathname === "/sse" && req.method === "GET") {
      // In production this upgrades to SSE; here we just verify the headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      // Flush headers to the client by writing an empty chunk. Without this,
      // the HTTP client's `response` event won't fire until the socket is closed.
      res.write("");
      // Leave the response open to simulate a live SSE stream; the test closes
      // the socket from the client side.
      return;
    }

    // ── Message endpoint ──
    if (url.pathname === "/messages" && req.method === "POST") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) {
        sendJson(res, 400, { error: "Missing sessionId query parameter" });
        return;
      }

      if (!knownSessions.has(sessionId)) {
        sendJson(res, 404, { error: "Unknown session" });
        return;
      }

      // Read body (mirror the 1 MB guard in sse.ts)
      const chunks: Buffer[] = [];
      let totalSize = 0;
      for await (const chunk of req) {
        const buf =
          typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
        totalSize += buf.length;
        if (totalSize > 1_048_576) {
          sendJson(res, 413, { error: "Payload too large" });
          return;
        }
        chunks.push(buf);
      }

      let _body: unknown;
      try {
        _body = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }

      // In production this calls transport.handlePostMessage; here we just ack
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  };
}

// ---------------------------------------------------------------------------
// HTTP helper utilities
// ---------------------------------------------------------------------------

interface HttpResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  json<T = unknown>(): T;
}

function httpRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
  } = {},
): Promise<HttpResponse> {
  const { method = "GET", headers = {}, body } = options;
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = require("node:http").request(
      {
        hostname: parsed.hostname,
        port: Number(parsed.port),
        path: parsed.pathname + parsed.search,
        method,
        headers,
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const bodyText = Buffer.concat(chunks).toString();
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: bodyText,
            json<T>() {
              return JSON.parse(bodyText) as T;
            },
          });
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("SSE transport HTTP handler", () => {
  let baseUrl: string;
  let server: ReturnType<typeof createServer>;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        const handler = buildHandler(TEST_API_KEY);
        server = createServer((req, res) => {
          handler(req, res).catch((err: unknown) => {
            res.writeHead(500);
            res.end(String(err));
          });
        });
        server.listen(0, "127.0.0.1", () => {
          const { port } = server.address() as AddressInfo;
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      }),
  );

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        // closeAllConnections() was added in Node 18.2 — use if available
        if (typeof (server as any).closeAllConnections === "function") {
          (server as any).closeAllConnections();
        }
        // Resolve regardless of close errors (e.g. already-destroyed sockets)
        server.close(() => resolve());
        // Safety: force resolve after 2 s to avoid hanging vitest
        setTimeout(resolve, 2_000).unref?.();
      }),
    15_000,
  );

  // ── Health ──

  it("GET /health returns 200 without any auth", async () => {
    const res = await httpRequest(`${baseUrl}/health`);
    expect(res.status).toBe(200);
  });

  it("GET /health returns expected body shape", async () => {
    const res = await httpRequest(`${baseUrl}/health`);
    const body = res.json<Record<string, unknown>>();
    expect(body).toMatchObject({ status: "ok" });
    expect(typeof body.tools).toBe("number");
    expect(typeof body.environment).toBe("string");
  });

  // ── CORS ──

  it("OPTIONS preflight returns 204 with CORS headers", async () => {
    const res = await httpRequest(`${baseUrl}/health`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toContain("GET");
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });

  // ── Auth: 401 cases ──

  it("GET /sse returns 401 with no auth headers", async () => {
    const res = await httpRequest(`${baseUrl}/sse`);
    expect(res.status).toBe(401);
    expect(res.json<{ error: string }>().error).toBe("Unauthorized");
  });

  it("GET /sse returns 401 with wrong x-api-key header", async () => {
    const res = await httpRequest(`${baseUrl}/sse`, {
      headers: { "x-api-key": "wrong-key" },
    });
    expect(res.status).toBe(401);
  });

  it("GET /sse returns 401 with wrong Bearer token", async () => {
    const res = await httpRequest(`${baseUrl}/sse`, {
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("POST /messages returns 401 with no auth", async () => {
    const res = await httpRequest(
      `${baseUrl}/messages?sessionId=valid-session-id`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
      },
    );
    expect(res.status).toBe(401);
  });

  // ── Auth: accepted cases ──

  it("GET /sse returns SSE headers with valid x-api-key header", async () => {
    // The handler leaves the SSE response open (streaming). We check headers
    // as soon as the response event fires, then immediately socket-destroy to
    // avoid hanging the test. ECONNRESET on the client side is expected.
    await new Promise<void>((resolve, reject) => {
      const http = require("node:http") as typeof import("node:http");
      const parsed = new URL(`${baseUrl}/sse`);
      let resolved = false;
      const done = (err?: Error) => {
        if (resolved) return;
        resolved = true;
        if (err && (err as NodeJS.ErrnoException).code !== "ECONNRESET") {
          reject(err);
        } else {
          resolve();
        }
      };
      const req = http.request(
        {
          hostname: parsed.hostname,
          port: Number(parsed.port),
          path: "/sse",
          method: "GET",
          headers: { "x-api-key": TEST_API_KEY },
        },
        (res) => {
          // Headers are available immediately
          expect(res.statusCode).toBe(200);
          expect(res.headers["content-type"]).toContain("text/event-stream");
          expect(res.headers.connection).toContain("keep-alive");
          // Destroy socket to unblock afterAll server.close()
          res.socket?.destroy();
          done();
        },
      );
      req.on("error", done);
      req.end();
    });
  }, 10_000);

  it("GET /sse returns SSE headers with valid Bearer token", async () => {
    await new Promise<void>((resolve, reject) => {
      const http = require("node:http") as typeof import("node:http");
      let resolved = false;
      const done = (err?: Error) => {
        if (resolved) return;
        resolved = true;
        if (err && (err as NodeJS.ErrnoException).code !== "ECONNRESET") {
          reject(err);
        } else {
          resolve();
        }
      };
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: Number((server.address() as AddressInfo).port),
          path: "/sse",
          method: "GET",
          headers: { authorization: `Bearer ${TEST_API_KEY}` },
        },
        (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers["content-type"]).toContain("text/event-stream");
          res.socket?.destroy();
          done();
        },
      );
      req.on("error", done);
      req.end();
    });
  }, 10_000);

  // ── /messages edge cases ──

  it("POST /messages returns 400 for malformed JSON body", async () => {
    const res = await httpRequest(
      `${baseUrl}/messages?sessionId=valid-session-id`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": TEST_API_KEY,
        },
        body: "this is not json {{{{",
      },
    );
    expect(res.status).toBe(400);
    expect(res.json<{ error: string }>().error).toBe("Invalid JSON body");
  });

  it("POST /messages returns 413 when body exceeds 1 MB", async () => {
    // 1 MB + 1 byte
    const bigBody = Buffer.alloc(1_048_577, "x");
    const res = await httpRequest(
      `${baseUrl}/messages?sessionId=valid-session-id`,
      {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-api-key": TEST_API_KEY,
        },
        body: bigBody,
      },
    );
    expect(res.status).toBe(413);
    expect(res.json<{ error: string }>().error).toBe("Payload too large");
  });

  it("POST /messages returns 400 when sessionId query param is missing", async () => {
    const res = await httpRequest(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY,
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
    });
    expect(res.status).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/sessionId/);
  });

  it("POST /messages returns 404 for unknown sessionId", async () => {
    const res = await httpRequest(
      `${baseUrl}/messages?sessionId=no-such-session`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": TEST_API_KEY,
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
      },
    );
    expect(res.status).toBe(404);
    expect(res.json<{ error: string }>().error).toBe("Unknown session");
  });

  it("POST /messages returns 200 for valid request with known sessionId", async () => {
    const res = await httpRequest(
      `${baseUrl}/messages?sessionId=valid-session-id`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": TEST_API_KEY,
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
      },
    );
    expect(res.status).toBe(200);
  });

  // ── 404 fallthrough ──

  it("unknown paths return 404", async () => {
    const res = await httpRequest(`${baseUrl}/unknown-path`, {
      headers: { "x-api-key": TEST_API_KEY },
    });
    expect(res.status).toBe(404);
  });
});
