/**
 * Streamable HTTP transport tests.
 *
 * The built Streamable HTTP entrypoint (`build/streamable-http.js`) is a
 * self-contained script that starts itself on import. To test its HTTP routing
 * without opening a listening socket, this suite mocks `node:http.createServer`
 * during import, captures the real request handler, and invokes it with
 * request/response doubles.
 *
 * Tested behaviour:
 *  - POST /mcp initialize returns 200 with Mcp-Session-Id header
 *  - GET /health returns 200 with transport: "streamable-http"
 *  - GET /sse returns 410 when authenticated
 *  - Unauthenticated MCP requests return 401
 *  - Invalid session IDs return 404
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { beforeAll, describe, expect, it, vi } from "vitest";

const TEST_API_KEY = "test-secret-key-abc123";
const MOCK_TOOL_COUNT = 505;

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;
type MockTransportInstance = {
  sessionId: string | undefined;
  onclose: (() => void) | undefined;
  emitClose: () => void;
};

let capturedHandler: Handler | undefined;
const transportInstances: MockTransportInstance[] = [];

class MockResponse {
  statusCode = 200;
  headers: Record<string, string | string[] | number | undefined> = {};
  body = "";

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

async function waitForHandler(): Promise<Handler> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (capturedHandler) {
      return capturedHandler;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Failed to capture Streamable HTTP handler from build/streamable-http.js");
}

async function dispatch(options: {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}): Promise<MockResponse> {
  const handler = await waitForHandler();
  const req = createRequest(options);
  const res = new MockResponse();
  await handler(req, res as unknown as ServerResponse);
  return res;
}

beforeAll(async () => {
  vi.resetModules();
  capturedHandler = undefined;
  transportInstances.length = 0;
  vi.stubEnv("ST_MCP_API_KEY", TEST_API_KEY);
  vi.stubEnv("ST_CLIENT_ID", "test-client-id");
  vi.stubEnv("ST_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("ST_APP_KEY", "test-app-key");
  vi.stubEnv("ST_TENANT_ID", "test-tenant-id");
  vi.stubEnv("ST_LOG_LEVEL", "error");

  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? 0})`);
  }) as never);

  vi.doMock("node:fs/promises", () => ({
    readdir: vi.fn(async () => []),
  }));

  vi.doMock("node:http", async () => {
    const actual = await vi.importActual<typeof import("node:http")>("node:http");
    return {
      ...actual,
      createServer: vi.fn((handler: Handler) => {
        capturedHandler = handler;
        return {
          listen: vi.fn((_port: number, _host: string, cb?: () => void) => {
            cb?.();
          }),
          close: vi.fn((cb?: () => void) => {
            cb?.();
          }),
        };
      }),
    };
  });

  vi.doMock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
    McpServer: class MockMcpServer {
      tool(): void {}
      async connect(): Promise<void> {}
      async close(): Promise<void> {}
    },
  }));

  vi.doMock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
    StreamableHTTPServerTransport: class MockStreamableHTTPServerTransport
      implements MockTransportInstance {
      sessionId: string | undefined;
      onclose: (() => void) | undefined;

      constructor(
        private readonly options: {
          sessionIdGenerator?: () => string;
          onsessioninitialized?: (sessionId: string) => void;
        } = {},
      ) {
        transportInstances.push(this);
      }

      async handleRequest(
        _req: IncomingMessage,
        res: ServerResponse,
        parsedBody?: { id?: number | string; method?: string; params?: { protocolVersion?: string } },
      ): Promise<void> {
        if (parsedBody?.method === "initialize") {
          this.sessionId = this.options.sessionIdGenerator?.();
          if (this.sessionId) {
            this.options.onsessioninitialized?.(this.sessionId);
            res.setHeader("Mcp-Session-Id", this.sessionId);
          }
          res.setHeader(
            "Mcp-Protocol-Version",
            parsedBody.params?.protocolVersion ?? LATEST_PROTOCOL_VERSION,
          );
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: parsedBody.id ?? 1,
              result: {
                protocolVersion: parsedBody.params?.protocolVersion ?? LATEST_PROTOCOL_VERSION,
                capabilities: {},
                serverInfo: { name: "ServiceTitan", version: "2.2.0" },
              },
            }),
          );
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      }

      emitClose(): void {
        this.onclose?.();
      }

      async close(): Promise<void> {}
    },
  }));

  vi.doMock("../build/audit.js", () => ({
    AuditLogger: class MockAuditLogger {},
  }));

  vi.doMock("../build/client.js", () => ({
    ServiceTitanClient: class MockServiceTitanClient {},
  }));

  vi.doMock("../build/config.js", () => ({
    loadConfig: () => ({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      appKey: "test-app-key",
      tenantId: "test-tenant-id",
      environment: "integration",
      readonlyMode: true,
      confirmWrites: false,
      maxResponseChars: 100_000,
      enabledDomains: null,
      logLevel: "error",
      timezone: "UTC",
      responseShaping: true,
      corsOrigin: "*",
    }),
  }));

  vi.doMock("../build/logger.js", () => ({
    Logger: class MockLogger {
      debug(): void {}
      info(): void {}
      warn(): void {}
      error(): void {}
    },
  }));

  vi.doMock("../build/registry.js", () => ({
    ToolRegistry: class MockToolRegistry {
      attachClient(): void {}
      register(): void {}
      registerDomain(): void {}
      getStats(): { registered: number } {
        return { registered: MOCK_TOOL_COUNT };
      }
      logSummary(): void {}
    },
  }));

  vi.doMock("../build/utils.js", () => ({
    setMaxResponseChars: vi.fn(),
    toolResult: (value: unknown) => value,
  }));

  await import("../build/streamable-http.js");
  await waitForHandler();
});

describe("Streamable HTTP transport HTTP handler", () => {
  it("POST /mcp initialize returns 200 with Mcp-Session-Id header", async () => {
    const res = await dispatch({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY,
        "mcp-protocol-version": LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "vitest",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(res.statusCode).toBe(200);
    expect(typeof res.headers["mcp-session-id"]).toBe("string");
  });

  it("GET /health returns 200 with transport: streamable-http", async () => {
    const res = await dispatch({ url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json<Record<string, unknown>>()).toMatchObject({
      status: "ok",
      transport: "streamable-http",
      tools: MOCK_TOOL_COUNT,
    });
  });

  it("GET /sse returns 410 when authenticated", async () => {
    const res = await dispatch({
      url: "/sse",
      headers: { "x-api-key": TEST_API_KEY },
    });

    expect(res.statusCode).toBe(410);
    expect(res.json<{ error: string }>().error).toContain("SSE transport deprecated");
  });

  it("unauthenticated MCP requests return 401", async () => {
    const res = await dispatch({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "vitest",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: string }>().error).toBe("Unauthorized");
  });

  it("invalid session IDs return 404", async () => {
    const res = await dispatch({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY,
        "mcp-session-id": "missing-session-id",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "notifications/initialized",
        params: {},
      }),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toContain("Session not found");
  });

  it("cleans up the session when the transport disconnects", async () => {
    const initializeRes = await dispatch({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY,
        "mcp-protocol-version": LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "vitest",
            version: "1.0.0",
          },
        },
      }),
    });

    const sessionId = initializeRes.headers["mcp-session-id"];
    expect(typeof sessionId).toBe("string");

    const transport = transportInstances.find((instance) => instance.sessionId === sessionId);
    expect(transport).toBeDefined();

    transport!.emitClose();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const res = await dispatch({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY,
        "mcp-session-id": sessionId as string,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "notifications/initialized",
        params: {},
      }),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toContain("Session not found");
  });
});
