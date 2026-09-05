#!/usr/bin/env node
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
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";


import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { ServiceTitanClient } from "./client.js";
import { loadConfig } from "./config.js";
import { Logger } from "./logger.js";
import { createMcpServer, VERSION } from "./server.js";
import { authenticated, allowedOrigin, requestUrl, attachAuthenticatedPrincipal } from "./http-policy.js";

const SESSION_IDLE_TTL_MS = 30 * 60 * 1000;
const SESSION_REAP_INTERVAL_MS = 60 * 1000;

const PORT = Number(process.env.PORT ?? process.env.ST_MCP_PORT ?? 3100);
const API_KEY = process.env.ST_MCP_API_KEY ?? "";

if (!API_KEY) {
  process.stderr.write("Fatal: ST_MCP_API_KEY is required for remote access.\n");
  process.exit(1);
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
  const version = VERSION;
  const logger = new Logger(config.logLevel, [config.clientSecret, config.appKey, API_KEY]);
  const client = new ServiceTitanClient(config);
  let stats = { registered: 0 };
  let pendingInitializations = 0;
  async function createSessionServer(): Promise<McpServer> {
    const runtime = await createMcpServer(config, { client, logger });
    stats = runtime.registry.getStats();
    return runtime.server;
  }

  type Session = {
    transport: StreamableHTTPServerTransport;
    server: McpServer;
    lastSeen: number;
    closing: boolean;
    activeRequests: number;
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
      ([, session]) => !session.closing && session.activeRequests === 0 && now - session.lastSeen > SESSION_IDLE_TTL_MS,
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
    try {
    let url: URL;
    try { url = requestUrl(req); } catch { sendJson(res, 400, { error: "Invalid request URL or Host", requestId }); return; }
    if (!allowedOrigin(req, config.corsOrigin)) { sendJson(res, 403, { error: "Origin not permitted", requestId }); return; }
    sendCorsHeaders(res, config.corsOrigin);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

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
    if (!authenticated(req, API_KEY)) {
      sendJson(res, 401, { error: "Unauthorized", requestId });
      return;
    }

    attachAuthenticatedPrincipal(req, config.mcpClientId ?? "api-key");

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
      let selectedSessionId: string | undefined;

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
          selectedSessionId = sessionId;
          session.lastSeen = Date.now();
          session.activeRequests += 1;
          let finished = false;
          const finishedRequest = () => {
            if (finished) return;
            finished = true;
            session.activeRequests -= 1;
            session.lastSeen = Date.now();
          };
          res.once("finish", finishedRequest);
          res.once("close", finishedRequest);
          try { await session.transport.handleRequest(req, res, parsedBody); }
          finally { if (res.writableEnded) finishedRequest(); }
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

        // Include pending initialization to prevent concurrent requests bypassing the limit.
        if (sessions.size + pendingInitializations >= (config.maxSessions ?? 32)) {
          sendJson(res, 503, { error: "Session limit reached; close an existing session before retrying", requestId });
          return;
        }
        pendingInitializations += 1;
        let sessionServer: McpServer | undefined;
        let newTransport: StreamableHTTPServerTransport | undefined;
        try {
        sessionServer = await createSessionServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId: string) => {
            createdSessionId = newSessionId;
            logger.info("Session initialized", { sessionId: newSessionId, requestId });
            sessions.set(newSessionId, {
              transport,
              server: sessionServer!,
              lastSeen: Date.now(),
              closing: false,
              activeRequests: 0,
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

        newTransport = transport;
        await sessionServer.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
        if (!createdSessionId) { await transport.close(); await sessionServer.close(); }
        } catch (error) {
          if (!createdSessionId) { await newTransport?.close().catch(() => {}); await sessionServer?.close().catch(() => {}); }
          throw error;
        } finally { pendingInitializations -= 1; }
      } catch (error: unknown) {
        if (selectedSessionId) {
          const selected = sessions.get(selectedSessionId);
          if (selected) await closeSession(selectedSessionId, selected, "transport-failed");
        }
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
    } catch {
      logger.error("HTTP request failed", { requestId });
      if (!res.headersSent) sendJson(res, 500, { error: "Internal server error", requestId });
      else if (!res.writableEnded) res.end();
    }
  });
  httpServer.requestTimeout = 30_000;
  httpServer.headersTimeout = 15_000;
  httpServer.keepAliveTimeout = 5_000;

  httpServer.listen(PORT, process.env.ST_MCP_HOST ?? "127.0.0.1", () => {
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
