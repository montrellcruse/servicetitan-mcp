#!/usr/bin/env node
/**
 * SSE transport entrypoint for remote MCP access.
 *
 * Hosts the ServiceTitan MCP server over HTTP with Server-Sent Events,
 * allowing Claude Desktop (or any MCP client) to connect remotely.
 *
 * Authentication: requires x-api-key header matching ST_MCP_API_KEY env var.
 *
 * Usage:
 *   ST_MCP_API_KEY=<secret> node build/sse.js
 *
 * Endpoints:
 *   GET  /sse          → SSE stream (MCP protocol)
 *   POST /messages     → MCP message endpoint (used by SSE transport)
 *   GET  /health       → Health check (no auth required)
 */
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

import { ExperimentalWritesDisabledError, loadConfig } from "./config.js";
import { Logger } from "./logger.js";
import { createMcpServer, VERSION } from "./server.js";
import { authenticated, allowedOrigin, requestUrl, attachAuthenticatedPrincipal } from "./http-policy.js";

const PORT = Number(process.env.PORT ?? process.env.ST_MCP_PORT ?? 3100);
const API_KEY = process.env.ST_MCP_API_KEY ?? "";

if (!API_KEY) {
  process.stderr.write("Fatal: ST_MCP_API_KEY is required for remote access.\n");
  process.exit(1);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendCorsHeaders(res: ServerResponse, corsOrigin: string): void {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization");
}

// ── Main ──

async function main(): Promise<void> {
  const config = loadConfig();
  const version = VERSION;
  const logger = new Logger(config.logLevel, [config.clientSecret, config.appKey, API_KEY]);
  const { server, registry } = await createMcpServer(config, { logger });
  registry.logSummary();
  const stats = registry.getStats();

  const transports = new Map<string, SSEServerTransport>();
  let activeTransportId = 0;

  const httpServer = createServer(async (req, res) => {
    const requestId = randomUUID();
    try {
      let url: URL;
      try { url = requestUrl(req); } catch { sendJson(res, 400, { error: "Invalid request URL or Host", requestId }); return; }
      if (!allowedOrigin(req, config.corsOrigin)) { sendJson(res, 403, { error: "Origin not permitted", requestId }); return; }
      if (config.corsOrigin) sendCorsHeaders(res, config.corsOrigin);
      // Handle CORS preflight
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

      // SSE connection endpoint
      if (url.pathname === "/sse" && req.method === "GET") {
        activeTransportId += 1;
        const transportId = activeTransportId;

        // Close any existing connection — McpServer only supports one transport at a time
        try {
          await server.close();
        } catch {
          // No active connection — that's fine
        }

        // Clean up all previous transports
        for (const [id, transport] of transports) {
          try {
            await transport.close();
          } catch {
            // already closed
          }
          transports.delete(id);
        }

        // Disable Nagle's algorithm and proxy buffering for SSE
        // This ensures chunked responses are flushed immediately
        req.socket.setNoDelay(true);
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no"); // nginx/Fly proxy hint

        // Wrap res.write to auto-flush after each SSE event
        const origWrite = res.write.bind(res) as typeof res.write;
        (res as any).write = function (chunk: any, encodingOrCb?: any, cb?: any) {
          const result = origWrite(chunk, encodingOrCb, cb);
          // Force flush the socket after each write
          if (res.socket && !res.socket.destroyed) {
            (res.socket as any).uncork?.();
          }
          return result;
        };

        const transport = new SSEServerTransport("/messages", res);
        transports.set(transport.sessionId, transport);

        let keepAlive: NodeJS.Timeout | undefined;
        let disconnected = false;

        const closeSseServer = (): void => {
          if (transportId !== activeTransportId) {
            return;
          }

          void server.close().catch((err) => {
            logger.warn("Failed to close SSE server on disconnect", {
              sessionId: transport.sessionId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        };

        const cleanupTransport = (reason: "transport-close" | "response-close"): void => {
          if (disconnected) {
            return;
          }

          disconnected = true;
          if (keepAlive) {
            clearInterval(keepAlive);
            keepAlive = undefined;
          }

          if (transports.get(transport.sessionId) === transport) {
            transports.delete(transport.sessionId);
          }

          logger.info("SSE client disconnected", { sessionId: transport.sessionId, reason });
          closeSseServer();
        };

        transport.onclose = () => {
          cleanupTransport("transport-close");
        };

        logger.info("SSE client connected", { sessionId: transport.sessionId, requestId });

        // ── SSE keepalive heartbeat ──
        // Sends a comment every 30 s to keep the connection alive and detect
        // silently-disconnected clients (res.write() will fail and trigger "close").
        keepAlive = setInterval(() => {
          res.write(": keepalive\n\n");
        }, 30_000);

        res.on("close", () => {
          cleanupTransport("response-close");
        });

        try { await server.connect(transport); }
        catch (error) { cleanupTransport("transport-close"); await transport.close().catch(() => {}); throw error; }
        return;
      }

      // Message endpoint (POST from SSE clients)
      if (url.pathname === "/messages" && req.method === "POST") {
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) {
          sendJson(res, 400, { error: "Missing sessionId query parameter", requestId });
          return;
        }

        const transport = transports.get(sessionId);
        if (!transport) {
          sendJson(res, 404, { error: "Unknown session", requestId });
          return;
        }

        // Parse the body
        const chunks: Buffer[] = [];
        let totalSize = 0;
        for await (const chunk of req) {
          const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          totalSize += buf.length;
          if (totalSize > 1_048_576) { // 1MB limit
            sendJson(res, 413, { error: "Payload too large", requestId });
            return;
          }
          chunks.push(buf);
        }

        let body: unknown;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString());
        } catch {
          sendJson(res, 400, { error: "Invalid JSON body", requestId });
          return;
        }

        try {
          await transport.handlePostMessage(req, res, body);
        } catch (error: unknown) {
          logger.error("Unhandled /messages request error", {
            requestId,
            sessionId,
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

      sendJson(res, 404, { error: "Not found", requestId });
    } catch (error: unknown) {
      logger.error("Unhandled SSE request error", {
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
  });

  httpServer.listen(PORT, process.env.ST_MCP_HOST ?? "127.0.0.1", () => {
    logger.info(`ServiceTitan MCP Server v${version}`);
    logger.info(`Transport: SSE on port ${PORT}`);
    logger.info(`Read-only: ${config.readonlyMode ? "yes" : "no"}`);
    logger.info(`CORS origin: ${config.corsOrigin}`);
    logger.info(`Tools registered: ${stats.registered}`);
    logger.info(`Connect Claude Desktop with: http://localhost:${PORT}/sse`);
  });

  const shutdown = () => {
    logger.info("Shutdown signal received, closing server...");
    for (const transport of transports.values()) { void transport.close(); }
    void server.close();
    httpServer.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
    // Force exit after 10s if connections don't drain
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  const message = error instanceof ExperimentalWritesDisabledError
    ? error.message : "Check required ServiceTitan and transport configuration.";
  process.stderr.write(
    `${JSON.stringify({
      level: "error",
      ts: new Date().toISOString(),
      msg: "Fatal SSE startup error",
      error: message,
    })}\n`,
  );
  process.exit(1);
});
