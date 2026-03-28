/**
 * Streamable HTTP transport entrypoint for remote MCP access.
 *
 * Replaces the SSE transport with the newer Streamable HTTP protocol.
 * Uses standard HTTP request/response — no proxy buffering issues.
 *
 * Authentication: requires x-api-key header matching ST_MCP_API_KEY env var.
 *
 * Usage:
 *   ST_MCP_API_KEY=<secret> node build/streamable-http.js
 *
 * Endpoints:
 *   POST /mcp         → MCP Streamable HTTP endpoint (tool calls, initialization)
 *   GET  /mcp         → SSE stream for server-initiated notifications
 *   DELETE /mcp       → Close session
 *   GET  /health      → Health check (no auth required)
 *   GET  /sse         → Legacy SSE endpoint (returns 410 Gone with deprecation notice)
 */
import { timingSafeEqual, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";


import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { AuditLogger } from "./audit.js";
import { ServiceTitanClient } from "./client.js";
import { loadConfig } from "./config.js";
import { loadDomainModules } from "./domains/loader.js";
import { Logger } from "./logger.js";
import { ToolRegistry } from "./registry.js";
import { setMaxResponseChars, toolResult } from "./utils.js";

const SESSION_IDLE_TTL_MS = 30 * 60 * 1000;
const SESSION_REAP_INTERVAL_MS = 60 * 1000;

// Catch crashes
process.on("uncaughtException", (err) => {
  process.stderr.write(`UNCAUGHT EXCEPTION: ${err.stack ?? err.message}\n`);
});
process.on("unhandledRejection", (reason) => {
  process.stderr.write(`UNHANDLED REJECTION: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}\n`);
});

const PORT = Number(process.env.PORT ?? process.env.ST_MCP_PORT ?? 3100);
const API_KEY = process.env.ST_MCP_API_KEY ?? "";

if (!API_KEY) {
  process.stderr.write("Fatal: ST_MCP_API_KEY is required for remote access.\n");
  process.exit(1);
}

// ── Constant-time string comparison ──

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ── Auth middleware ──

function authenticate(req: IncomingMessage): boolean {
  const key = req.headers["x-api-key"];
  if (typeof key === "string" && safeCompare(key, API_KEY)) {
    return true;
  }
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ") && safeCompare(auth.slice(7), API_KEY)) {
    return true;
  }
  return false;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(json);
}

function sendCorsHeaders(res: ServerResponse, corsOrigin: string): void {
  if (corsOrigin.length > 0) {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, x-api-key, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
    );
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, Mcp-Protocol-Version");
  }
  res.setHeader("X-Accel-Buffering", "no");
}

function isInitializeRequest(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }

  return (body as { method?: unknown }).method === "initialize";
}

// ── Main ──

async function main(): Promise<void> {
  const config = loadConfig();
  setMaxResponseChars(config.maxResponseChars);

  const logger = new Logger(config.logLevel);
  const client = new ServiceTitanClient(config);
  const auditLogger = new AuditLogger(logger);

  // Create a "template" McpServer + registry to register tools once, then log stats
  const templateServer = new McpServer({ name: "ServiceTitan", version: "2.3.0" });
  const templateRegistry = new ToolRegistry(templateServer, config, logger, auditLogger);
  templateRegistry.attachClient(client);

  templateRegistry.register({
    name: "st_health_check",
    domain: "_system",
    operation: "read",
    description:
      "Verify ServiceTitan API connectivity, authentication, tenant access, and server config",
    schema: {},
    handler: async () => {
      const checks: Record<string, string> = {};
      try {
        await client.ensureToken();
        checks.authentication = "OK";
      } catch (error: unknown) {
        checks.authentication = "FAILED";
      }
      try {
        await client.get("/settings/v2/tenant/{tenant}/business-units", { pageSize: 1 });
        checks.tenant_access = "OK";
      } catch (error: unknown) {
        checks.tenant_access = "FAILED";
      }
      return toolResult(checks);
    },
  });

  await loadDomainModules(templateRegistry, logger);
  templateRegistry.logSummary();
  const stats = templateRegistry.getStats();

  const _require = createRequire(import.meta.url);
  const pkg = _require("../package.json") as { version: string };
  const version = pkg.version;

  /** Create a fresh McpServer + ToolRegistry per session */
  async function createSessionServer(): Promise<McpServer> {
    const sessionMcpServer = new McpServer({ name: "ServiceTitan", version: "2.3.0" });
    const sessionRegistry = new ToolRegistry(sessionMcpServer, config, logger, auditLogger);
    sessionRegistry.attachClient(client);

    sessionRegistry.register({
      name: "st_health_check",
      domain: "_system",
      operation: "read",
      description:
        "Verify ServiceTitan API connectivity, authentication, tenant access, and server config",
      schema: {},
      handler: async () => {
        const checks: Record<string, string> = {};
        try {
          await client.ensureToken();
          checks.authentication = "OK";
        } catch (error: unknown) {
          checks.authentication = "FAILED";
        }
        try {
          await client.get("/settings/v2/tenant/{tenant}/business-units", { pageSize: 1 });
          checks.tenant_access = "OK";
        } catch (error: unknown) {
          checks.tenant_access = "FAILED";
        }
        return toolResult(checks);
      },
    });

    await loadDomainModules(sessionRegistry, logger);
    return sessionMcpServer;
  }

  type Session = {
    transport: StreamableHTTPServerTransport;
    server: McpServer;
    lastSeen: number;
    closing: boolean;
  };

  // Track active sessions: transport + server
  const sessions = new Map<string, Session>();

  async function closeSession(sessionId: string, session: Session, reason: string): Promise<void> {
    if (session.closing) {
      return;
    }

    session.closing = true;
    logger.info("Closing session", { sessionId, reason });

    try {
      await session.transport.close();
    } catch (error: unknown) {
      logger.warn("Failed to close session transport", {
        sessionId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    sessions.delete(sessionId);

    try {
      await session.server.close();
    } catch (error: unknown) {
      logger.warn("Failed to close session server", {
        sessionId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const sessionReaper = setInterval(() => {
    const now = Date.now();
    const expiredSessions = Array.from(sessions.entries()).filter(
      ([, session]) => !session.closing && now - session.lastSeen > SESSION_IDLE_TTL_MS,
    );

    if (expiredSessions.length === 0) {
      return;
    }

    void Promise.allSettled(
      expiredSessions.map(([sessionId, session]) => closeSession(sessionId, session, "idle-timeout")),
    );
  }, SESSION_REAP_INTERVAL_MS);
  sessionReaper.unref();

  const httpServer = createServer(async (req, res) => {
    const requestId = randomUUID();
    sendCorsHeaders(res, config.corsOrigin);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    logger.info(`[${requestId}] ${req.method} ${url.pathname}`);

    // Health endpoint (no auth)
    if (url.pathname === "/health" && req.method === "GET") {
      sendJson(res, 200, {
        status: "ok",
        transport: "streamable-http",
        tools: stats.registered,
        environment: config.environment,
        readonly: config.readonlyMode,
      });
      return;
    }

    // Auth required for everything else
    if (!authenticate(req)) {
      sendJson(res, 401, { error: "Unauthorized", requestId });
      return;
    }

    // Legacy SSE endpoint — tell clients to use /mcp instead
    if (url.pathname === "/sse") {
      sendJson(res, 410, {
        error: "SSE transport deprecated. Use Streamable HTTP at POST /mcp",
        migration: "Change your MCP client config URL from /sse to /mcp",
        requestId,
      });
      return;
    }

    // Streamable HTTP MCP endpoint
    if (url.pathname === "/mcp") {
      let createdSessionId: string | undefined;

      try {
        // Parse body for POST requests
        let parsedBody: unknown = undefined;
        if (req.method === "POST") {
          const chunks: Buffer[] = [];
          let totalSize = 0;
          for await (const chunk of req) {
            const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
            totalSize += buf.length;
            if (totalSize > 1_048_576) {
              sendJson(res, 413, { error: "Payload too large", requestId });
              return;
            }
            chunks.push(buf);
          }
          try {
            parsedBody = JSON.parse(Buffer.concat(chunks).toString());
          } catch {
            sendJson(res, 400, { error: "Invalid JSON body", requestId });
            return;
          }
        }

        // Check for existing session
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (sessionId && sessions.has(sessionId)) {
          // Reuse existing session
          const session = sessions.get(sessionId)!;
          if (session.closing) {
            sendJson(res, 404, { error: "Session not found. Send initialize request without session ID.", requestId });
            return;
          }
          session.lastSeen = Date.now();
          await session.transport.handleRequest(req, res, parsedBody);
          return;
        }

        if (sessionId && !sessions.has(sessionId)) {
          // Invalid/expired session
          sendJson(res, 404, { error: "Session not found. Send initialize request without session ID.", requestId });
          return;
        }

        if (req.method !== "POST") {
          sendJson(res, 400, {
            error: "Session ID required. Send initialize request via POST without session ID.",
            requestId,
          });
          return;
        }

        if (!isInitializeRequest(parsedBody)) {
          sendJson(res, 400, {
            error: "New sessions must start with an initialize request.",
            requestId,
          });
          return;
        }

        // New session — create dedicated McpServer + transport
        const sessionServer = await createSessionServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId: string) => {
            createdSessionId = newSessionId;
            logger.info("Session initialized", { sessionId: newSessionId, requestId });
            sessions.set(newSessionId, {
              transport,
              server: sessionServer,
              lastSeen: Date.now(),
              closing: false,
            });
          },
        });

        transport.onclose = () => {
          const closedSessionId = transport.sessionId;
          const session = closedSessionId ? sessions.get(closedSessionId) : undefined;
          if (closedSessionId && session) {
            void closeSession(closedSessionId, session, "client-disconnect");
          }
        };

        await sessionServer.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
      } catch (error: unknown) {
        if (createdSessionId) {
          const createdSession = sessions.get(createdSessionId);
          if (createdSession) {
            await closeSession(createdSessionId, createdSession, "initialization-failed");
          }
        }

        logger.error("Unhandled /mcp request error", {
          requestId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        if (!res.headersSent) {
          sendJson(res, 500, { error: "Internal server error", requestId });
        } else if (!res.writableEnded) {
          res.end();
        }
      }
      return;
    }

    sendJson(res, 404, { error: "Not found. MCP endpoint is at /mcp", requestId });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    logger.info(`ServiceTitan MCP Server v${version}`);
    logger.info(`Transport: Streamable HTTP on port ${PORT}`);
    logger.info(`Read-only: ${config.readonlyMode ? "yes" : "no"}`);
    logger.info(`CORS origin: ${config.corsOrigin}`);
    logger.info(`Tools registered: ${stats.registered}`);
    logger.info(`MCP endpoint: http://localhost:${PORT}/mcp`);
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    clearInterval(sessionReaper);
    logger.info("Shutdown signal received, closing server...");
    void Promise.allSettled(
      Array.from(sessions.entries()).map(([sessionId, session]) => closeSession(sessionId, session, "shutdown")),
    ).then(() => {
      httpServer.close(() => {
        logger.info("HTTP server closed");
        process.exit(0);
      });
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `${JSON.stringify({
      level: "error",
      ts: new Date().toISOString(),
      msg: "Fatal startup error",
      error: message,
    })}\n`,
  );
  process.exit(1);
});
