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
import { createServer, type ServerResponse } from "node:http";

import { loadConfig } from "./config.js";
import { Logger } from "./logger.js";
import { prepareMcpDeployment, VERSION } from "./server.js";
import { StreamableHttpSessions } from "./streamable-http-sessions.js";
import { startupErrorMessage } from "./startup-diagnostics.js";
import { authenticated, allowedOrigin, requestUrl, attachAuthenticatedPrincipal, sendJson } from "./http-policy.js";

const PORT = Number(process.env.PORT ?? process.env.ST_MCP_PORT ?? 3100);
const API_KEY = process.env.ST_MCP_API_KEY ?? "";

if (!API_KEY) {
  process.stderr.write("Fatal: ST_MCP_API_KEY is required for remote access.\n");
  process.exit(1);
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

function sendInternalError(res: ServerResponse, requestId: string): void {
  if (res.destroyed || res.writableEnded) return;
  if (!res.headersSent) sendJson(res, 500, { error: "Internal server error", requestId });
  else res.end();
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel, [config.clientSecret, config.appKey, API_KEY]);
  const deployment = await prepareMcpDeployment(config, { logger });
  const stats = deployment.catalog.getStats();
  const sessions = new StreamableHttpSessions(config.maxSessions ?? 32, () => deployment.createServer().server, logger);

  const httpServer = createServer(async (req, res) => {
    const requestId = randomUUID();
    try {
      let url: URL;
      try {
        url = requestUrl(req);
      } catch {
        sendJson(res, 400, { error: "Invalid request URL or Host", requestId });
        return;
      }
      if (!allowedOrigin(req, config.corsOrigin)) {
        sendJson(res, 403, { error: "Origin not permitted", requestId });
        return;
      }
      sendCorsHeaders(res, config.corsOrigin);

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      logger.info(`[${requestId}] ${req.method} ${url.pathname}`);

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

      if (!authenticated(req, API_KEY)) {
        sendJson(res, 401, { error: "Unauthorized", requestId });
        return;
      }
      attachAuthenticatedPrincipal(req, config.mcpClientId ?? "api-key");

      if (url.pathname === "/sse") {
        sendJson(res, 410, {
          error: "SSE transport deprecated. Use Streamable HTTP at POST /mcp",
          migration: "Change your MCP client config URL from /sse to /mcp",
          requestId,
        });
        return;
      }
      if (url.pathname !== "/mcp") {
        sendJson(res, 404, { error: "Not found. MCP endpoint is at /mcp", requestId });
        return;
      }

      try {
        let parsedBody: unknown;
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
        await sessions.handleRequest(req, res, parsedBody, requestId);
      } catch (error: unknown) {
        logger.error("Unhandled /mcp request error", {
          requestId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        sendInternalError(res, requestId);
      }
    } catch {
      logger.error("HTTP request failed", { requestId });
      sendInternalError(res, requestId);
    }
  });
  httpServer.requestTimeout = 30_000;
  httpServer.headersTimeout = 15_000;
  httpServer.keepAliveTimeout = 5_000;

  httpServer.listen(PORT, process.env.ST_MCP_HOST ?? "127.0.0.1", () => {
    logger.info(`ServiceTitan MCP Server v${VERSION}`);
    logger.info(`Transport: Streamable HTTP on port ${PORT}`);
    logger.info(`Read-only: ${config.readonlyMode ? "yes" : "no"}`);
    logger.info(`CORS origin: ${config.corsOrigin}`);
    logger.info(`Tools registered: ${stats.registered}`);
    logger.info(`MCP endpoint: http://localhost:${PORT}/mcp`);
  });

  const shutdown = () => sessions.shutdown(httpServer, code => {
    if (code === 0) logger.info("HTTP server closed");
    process.exit(code);
  });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  const message = startupErrorMessage(error, "Check required ServiceTitan and transport configuration.");
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
