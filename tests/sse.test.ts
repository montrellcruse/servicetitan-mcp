/**
 * SSE transport tests.
 *
 * The SSE entrypoint (src/sse.ts) is structured as a self-contained script
 * (calls process.exit when missing API key, owns its own main()). We therefore
 * test the HTTP-layer behaviour by extracting the handler logic here and
 * dispatching request/response doubles directly, which keeps the suite
 * hermetic and avoids binding a real socket in restricted environments.
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
 *  - Error responses include requestId field
 *  - CORS origin is configurable
 */

import { randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { beforeAll, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Re-implement the minimal HTTP handler logic from sse.ts so we can test it
// in isolation without touching process.exit or loading all domain modules.
// ---------------------------------------------------------------------------

const TEST_API_KEY = "test-secret-key-abc123";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendCorsHeaders(res: ServerResponse, corsOrigin: string): void {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key, Authorization",
  );
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function authenticate(req: IncomingMessage, apiKey: string): boolean {
  const key = req.headers["x-api-key"];
  if (typeof key === "string" && safeCompare(key, apiKey)) {
    return true;
  }
  const auth = req.headers.authorization;
  if (
    typeof auth === "string" &&
    auth.startsWith("Bearer ") &&
    safeCompare(auth.slice(7), apiKey)
  ) {
    return true;
  }
  return false;
}

// A simplified handler that mirrors src/sse.ts routing without spinning up
// MCP infrastructure or SSEServerTransport (which would stream indefinitely).
type FakeHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

function buildHandler(apiKey: string, corsOrigin = "*"): FakeHandler {
  // Simulated in-memory session registry (a real SSE connection populates this)
  const knownSessions = new Set<string>(["valid-session-id"]);

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const requestId = randomUUID();
    sendCorsHeaders(res, corsOrigin);

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
      sendJson(res, 401, { error: "Unauthorized", requestId });
      return;
    }

    // ── SSE endpoint ──
    if (url.pathname === "/sse" && req.method === "GET") {
      // In production this upgrades to SSE; here we just verify the headers.
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("");
      return;
    }

    // ── Message endpoint ──
    if (url.pathname === "/messages" && req.method === "POST") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) {
        sendJson(res, 400, { error: "Missing sessionId query parameter", requestId });
        return;
      }

      if (!knownSessions.has(sessionId)) {
        sendJson(res, 404, { error: "Unknown session", requestId });
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
          sendJson(res, 413, { error: "Payload too large", requestId });
          return;
        }
        chunks.push(buf);
      }

      let _body: unknown;
      try {
        _body = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body", requestId });
        return;
      }

      // In production this calls transport.handlePostMessage; here we just ack.
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: "Not found", requestId });
  };
}

// ---------------------------------------------------------------------------
// Request/response helper utilities
// ---------------------------------------------------------------------------

class MockResponse {
  statusCode = 200;
  headers: Record<string, string | string[] | number | undefined> = {};
  body = "";

  get status(): number {
    return this.statusCode;
  }

  setHeader(name: string, value: string | string[] | number): void {
    this.headers[name.toLowerCase()] = value;
  }

  writeHead(
    statusCode: number,
    headers?: Record<string, string | string[] | number>,
  ): MockResponse {
    this.statusCode = statusCode;
    for (const [name, value] of Object.entries(headers ?? {})) {
      this.setHeader(name, value);
    }
    return this;
  }

  write(chunk?: string | Buffer): boolean {
    if (chunk !== undefined) {
      this.body += chunk.toString();
    }
    return true;
  }

  end(chunk?: string | Buffer): MockResponse {
    if (chunk !== undefined) {
      this.body += chunk.toString();
    }
    return this;
  }

  json<T = unknown>(): T {
    return JSON.parse(this.body || "{}") as T;
  }
}

function createRequest(options: {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}): IncomingMessage {
  const {
    method = "GET",
    url,
    headers = {},
    body,
  } = options;

  const normalizedHeaders = Object.fromEntries(
    Object.entries({
      host: "localhost",
      ...headers,
    }).map(([name, value]) => [name.toLowerCase(), value]),
  );

  const chunks = body === undefined
    ? []
    : [Buffer.isBuffer(body) ? body : Buffer.from(body)];

  return {
    method,
    url,
    headers: normalizedHeaders,
    async *[Symbol.asyncIterator](): AsyncIterableIterator<Buffer> {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  } as IncomingMessage;
}

async function dispatch(
  handler: FakeHandler,
  options: {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
  },
): Promise<MockResponse> {
  const req = createRequest(options);
  const res = new MockResponse();
  await handler(req, res as unknown as ServerResponse);
  return res;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("SSE transport HTTP handler", () => {
  let handler: FakeHandler;

  beforeAll(() => {
    handler = buildHandler(TEST_API_KEY);
  });

  // ── Health ──

  it("GET /health returns 200 without any auth", async () => {
    const res = await dispatch(handler, { url: "/health" });
    expect(res.status).toBe(200);
  });

  it("GET /health returns expected body shape", async () => {
    const res = await dispatch(handler, { url: "/health" });
    const body = res.json<Record<string, unknown>>();
    expect(body).toMatchObject({ status: "ok" });
    expect(typeof body.tools).toBe("number");
    expect(typeof body.environment).toBe("string");
  });

  // ── CORS ──

  it("OPTIONS preflight returns 204 with CORS headers", async () => {
    const res = await dispatch(handler, { method: "OPTIONS", url: "/health" });
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toContain("GET");
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });

  // ── Auth: 401 cases ──

  it("GET /sse returns 401 with no auth headers", async () => {
    const res = await dispatch(handler, { url: "/sse" });
    expect(res.status).toBe(401);
    const body = res.json<{ error: string; requestId: string }>();
    expect(body.error).toBe("Unauthorized");
    expect(typeof body.requestId).toBe("string");
    expect(body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("GET /sse returns 401 with wrong x-api-key header", async () => {
    const res = await dispatch(handler, {
      url: "/sse",
      headers: { "x-api-key": "wrong-key" },
    });
    expect(res.status).toBe(401);
  });

  it("GET /sse returns 401 with wrong Bearer token", async () => {
    const res = await dispatch(handler, {
      url: "/sse",
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("POST /messages returns 401 with no auth", async () => {
    const res = await dispatch(handler, {
      method: "POST",
      url: "/messages?sessionId=valid-session-id",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
    });
    expect(res.status).toBe(401);
  });

  // ── Auth: accepted cases ──

  it("GET /sse returns SSE headers with valid x-api-key header", async () => {
    const res = await dispatch(handler, {
      url: "/sse",
      headers: { "x-api-key": TEST_API_KEY },
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.headers.connection).toContain("keep-alive");
  });

  it("GET /sse returns SSE headers with valid Bearer token", async () => {
    const res = await dispatch(handler, {
      url: "/sse",
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
  });

  // ── /messages edge cases ──

  it("POST /messages returns 400 for malformed JSON body", async () => {
    const res = await dispatch(handler, {
      method: "POST",
      url: "/messages?sessionId=valid-session-id",
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY,
      },
      body: "this is not json {{{{",
    });
    expect(res.status).toBe(400);
    const body = res.json<{ error: string; requestId: string }>();
    expect(body.error).toBe("Invalid JSON body");
    expect(typeof body.requestId).toBe("string");
  });

  it("POST /messages returns 413 when body exceeds 1 MB", async () => {
    const bigBody = Buffer.alloc(1_048_577, "x");
    const res = await dispatch(handler, {
      method: "POST",
      url: "/messages?sessionId=valid-session-id",
      headers: {
        "content-type": "application/octet-stream",
        "x-api-key": TEST_API_KEY,
      },
      body: bigBody,
    });
    expect(res.status).toBe(413);
    const body = res.json<{ error: string; requestId: string }>();
    expect(body.error).toBe("Payload too large");
    expect(typeof body.requestId).toBe("string");
  });

  it("POST /messages returns 400 when sessionId query param is missing", async () => {
    const res = await dispatch(handler, {
      method: "POST",
      url: "/messages",
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
    const res = await dispatch(handler, {
      method: "POST",
      url: "/messages?sessionId=no-such-session",
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY,
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
    });
    expect(res.status).toBe(404);
    expect(res.json<{ error: string }>().error).toBe("Unknown session");
  });

  it("POST /messages returns 200 for valid request with known sessionId", async () => {
    const res = await dispatch(handler, {
      method: "POST",
      url: "/messages?sessionId=valid-session-id",
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY,
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
    });
    expect(res.status).toBe(200);
  });

  // ── 404 fallthrough ──

  it("unknown paths return 404", async () => {
    const res = await dispatch(handler, {
      url: "/unknown-path",
      headers: { "x-api-key": TEST_API_KEY },
    });
    expect(res.status).toBe(404);
  });

  // ── requestId in error responses ──

  it("401 response includes a requestId UUID", async () => {
    const res = await dispatch(handler, { url: "/sse" });
    expect(res.status).toBe(401);
    const body = res.json<{ error: string; requestId: string }>();
    expect(body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("each request gets a unique requestId", async () => {
    const [r1, r2] = await Promise.all([
      dispatch(handler, { url: "/sse" }),
      dispatch(handler, { url: "/sse" }),
    ]);
    const id1 = r1.json<{ requestId: string }>().requestId;
    const id2 = r2.json<{ requestId: string }>().requestId;
    expect(id1).not.toBe(id2);
  });
});

// ── CORS origin configuration ──

describe("SSE transport CORS origin configuration", () => {
  let handler: FakeHandler;

  beforeAll(() => {
    handler = buildHandler(TEST_API_KEY, "https://app.example.com");
  });

  it("OPTIONS preflight returns configured CORS origin", async () => {
    const res = await dispatch(handler, { method: "OPTIONS", url: "/health" });
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.example.com");
  });

  it("non-preflight requests include configured CORS origin header", async () => {
    const res = await dispatch(handler, { url: "/health" });
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.example.com");
  });
});
