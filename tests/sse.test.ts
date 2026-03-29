import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";

const TEST_API_KEY = "test-secret-key-abc123";
const MOCK_TOOL_COUNT = 505;

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;
type MockRequest = IncomingMessage & {
  socket: {
    destroyed: boolean;
    setNoDelay: ReturnType<typeof vi.fn>;
  };
};

let capturedHandler: Handler | undefined;
let nextSessionId = 1;
let connectError: Error | undefined;
let postMessageError: Error | undefined;

const transportInstances: MockSSEServerTransport[] = [];
const serverInstances: MockMcpServer[] = [];
const loggerInstances: MockLogger[] = [];

class MockMcpServer {
  connect = vi.fn(async () => {
    if (connectError) {
      throw connectError;
    }
  });

  close = vi.fn(async () => {});

  constructor() {
    serverInstances.push(this);
  }

  tool(): void {}
}

class MockLogger {
  debug = vi.fn();
  info = vi.fn();
  warn = vi.fn();
  error = vi.fn();

  constructor() {
    loggerInstances.push(this);
  }
}

class MockSSEServerTransport {
  sessionId = `session-${nextSessionId++}`;
  onclose: (() => void) | undefined;

  handlePostMessage = vi.fn(async (_req: IncomingMessage, res: ServerResponse, body: unknown) => {
    if (postMessageError) {
      throw postMessageError;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, body }));
  });

  close = vi.fn(async () => {});

  constructor(_endpoint: string, _res: ServerResponse) {
    transportInstances.push(this);
  }

  emitClose(): void {
    this.onclose?.();
  }
}

class MockResponse extends EventEmitter {
  statusCode = 200;
  headers: Record<string, string | string[] | number | undefined> = {};
  body = "";
  headersSent = false;
  writableEnded = false;
  socket = {
    destroyed: false,
    uncork: vi.fn(),
  };

  setHeader(name: string, value: string | string[] | number): void {
    this.headers[name.toLowerCase()] = value;
  }

  writeHead(
    statusCode: number,
    headers?: Record<string, string | string[] | number>,
  ): MockResponse {
    this.statusCode = statusCode;
    this.headersSent = true;
    for (const [name, value] of Object.entries(headers ?? {})) {
      this.setHeader(name, value);
    }
    return this;
  }

  write(chunk?: string | Buffer): boolean {
    this.headersSent = true;
    if (chunk !== undefined) {
      this.body += chunk.toString();
    }
    return true;
  }

  end(chunk?: string | Buffer): MockResponse {
    this.headersSent = true;
    this.writableEnded = true;
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
}): MockRequest {
  const { method = "GET", url, headers = {}, body } = options;

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
    socket: {
      destroyed: false,
      setNoDelay: vi.fn(),
    },
    async *[Symbol.asyncIterator](): AsyncIterableIterator<Buffer> {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  } as MockRequest;
}

async function waitForHandler(): Promise<Handler> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (capturedHandler) {
      return capturedHandler;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Failed to capture SSE handler from src/sse.ts");
}

async function dispatch(options: {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}): Promise<{ req: MockRequest; res: MockResponse }> {
  const handler = await waitForHandler();
  const req = createRequest(options);
  const res = new MockResponse();
  await handler(req, res as unknown as ServerResponse);
  return { req, res };
}

beforeAll(async () => {
  vi.resetModules();
  capturedHandler = undefined;
  nextSessionId = 1;
  transportInstances.length = 0;
  serverInstances.length = 0;
  loggerInstances.length = 0;

  vi.stubEnv("ST_MCP_API_KEY", TEST_API_KEY);
  vi.stubEnv("ST_CLIENT_ID", "test-client-id");
  vi.stubEnv("ST_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("ST_APP_KEY", "test-app-key");
  vi.stubEnv("ST_TENANT_ID", "test-tenant-id");
  vi.stubEnv("ST_LOG_LEVEL", "error");

  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? 0})`);
  }) as never);

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
    McpServer: MockMcpServer,
  }));

  vi.doMock("@modelcontextprotocol/sdk/server/sse.js", () => ({
    SSEServerTransport: MockSSEServerTransport,
  }));

  vi.doMock("../src/audit.js", () => ({
    AuditLogger: class MockAuditLogger {},
  }));

  vi.doMock("../src/client.js", () => ({
    ServiceTitanClient: class MockServiceTitanClient {},
  }));

  vi.doMock("../src/config.js", () => ({
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
      corsOrigin: "*",
    }),
  }));

  vi.doMock("../src/domains/loader.js", () => ({
    loadDomainModules: vi.fn(async () => {}),
  }));

  vi.doMock("../src/logger.js", () => ({
    Logger: MockLogger,
  }));

  vi.doMock("../src/registry.js", () => ({
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

  vi.doMock("../src/utils.js", () => ({
    setDisplayTimezone: vi.fn(),
    setMaxResponseChars: vi.fn(),
    toolResult: (value: unknown) => value,
  }));

  await import("../src/sse.ts");
  await waitForHandler();
});

afterEach(() => {
  connectError = undefined;
  postMessageError = undefined;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SSE transport HTTP handler", () => {
  it("GET /sse creates a transport and sets SSE headers", async () => {
    const { req, res } = await dispatch({
      method: "GET",
      url: "/sse",
      headers: { "x-api-key": TEST_API_KEY },
    });

    const transport = transportInstances.at(-1);

    expect(transport).toBeDefined();
    expect(req.socket.setNoDelay).toHaveBeenCalledWith(true);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/event-stream");
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.headers["x-accel-buffering"]).toBe("no");
    expect(serverInstances[0]?.connect).toHaveBeenCalledWith(transport);
  });

  it("POST /messages routes to transport.handlePostMessage", async () => {
    await dispatch({
      method: "GET",
      url: "/sse",
      headers: { "x-api-key": TEST_API_KEY },
    });

    const transport = transportInstances.at(-1);
    expect(transport).toBeDefined();

    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "ping",
      params: { value: "ok" },
    };

    const { res } = await dispatch({
      method: "POST",
      url: `/messages?sessionId=${transport!.sessionId}`,
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY,
      },
      body: JSON.stringify(body),
    });

    expect(transport?.handlePostMessage).toHaveBeenCalledTimes(1);
    expect(transport?.handlePostMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      body,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json<{ ok: boolean; body: unknown }>()).toEqual({ ok: true, body });
  });

  it("client disconnect removes the transport and stops the heartbeat", async () => {
    vi.useFakeTimers();

    const { res: sseRes } = await dispatch({
      method: "GET",
      url: "/sse",
      headers: { "x-api-key": TEST_API_KEY },
    });

    const transport = transportInstances.at(-1);
    expect(transport).toBeDefined();

    vi.advanceTimersByTime(30_000);
    expect(sseRes.body).toContain(": keepalive\n\n");

    const bodyAtDisconnect = sseRes.body;
    sseRes.emit("close");
    await Promise.resolve();

    const { res } = await dispatch({
      method: "POST",
      url: `/messages?sessionId=${transport!.sessionId}`,
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toBe("Unknown session");

    vi.advanceTimersByTime(30_000);
    expect(sseRes.body).toBe(bodyAtDisconnect);
  });

  it("heartbeat interval sends keep-alive pings", async () => {
    vi.useFakeTimers();

    const { res } = await dispatch({
      method: "GET",
      url: "/sse",
      headers: { "x-api-key": TEST_API_KEY },
    });

    expect(res.body).toBe("");

    vi.advanceTimersByTime(60_000);
    const keepAliveCount = res.body.match(/: keepalive\n\n/g)?.length ?? 0;

    expect(keepAliveCount).toBe(2);
  });

  it("returns 500 when server.connect fails", async () => {
    connectError = new Error("connect failed");

    const { res } = await dispatch({
      method: "GET",
      url: "/sse",
      headers: { "x-api-key": TEST_API_KEY },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json<{ error: string }>().error).toBe("Internal server error");
    expect(loggerInstances[0]?.error).toHaveBeenCalledWith(
      "Unhandled SSE request error",
      expect.objectContaining({
        error: "connect failed",
      }),
    );
  });

  it("returns 500 when transport.handlePostMessage fails", async () => {
    await dispatch({
      method: "GET",
      url: "/sse",
      headers: { "x-api-key": TEST_API_KEY },
    });

    const transport = transportInstances.at(-1);
    expect(transport).toBeDefined();

    postMessageError = new Error("post failed");

    const { res } = await dispatch({
      method: "POST",
      url: `/messages?sessionId=${transport!.sessionId}`,
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping" }),
    });

    expect(res.statusCode).toBe(500);
    expect(res.json<{ error: string }>().error).toBe("Internal server error");
    expect(loggerInstances[0]?.error).toHaveBeenCalledWith(
      "Unhandled /messages request error",
      expect.objectContaining({
        sessionId: transport!.sessionId,
        error: "post failed",
      }),
    );
  });

  it("ignores a stale disconnect from the previously active transport", async () => {
    await dispatch({
      method: "GET",
      url: "/sse",
      headers: { "x-api-key": TEST_API_KEY },
    });

    const firstTransport = transportInstances.at(-1);
    expect(firstTransport).toBeDefined();

    await dispatch({
      method: "GET",
      url: "/sse",
      headers: { "x-api-key": TEST_API_KEY },
    });

    const secondTransport = transportInstances.at(-1);
    expect(secondTransport).toBeDefined();
    expect(secondTransport?.sessionId).not.toBe(firstTransport?.sessionId);

    const closeCallsBefore = serverInstances[0]?.close.mock.calls.length ?? 0;
    firstTransport!.emitClose();
    await Promise.resolve();

    expect(serverInstances[0]?.close.mock.calls.length).toBe(closeCallsBefore);

    const { res } = await dispatch({
      method: "POST",
      url: `/messages?sessionId=${secondTransport!.sessionId}`,
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "ping" }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ ok: boolean }>().ok).toBe(true);
  });
});
