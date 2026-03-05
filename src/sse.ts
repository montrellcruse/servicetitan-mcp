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
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

import { AuditLogger } from "./audit.js";
import { ServiceTitanClient } from "./client.js";
import { loadConfig } from "./config.js";
import { Logger } from "./logger.js";
import { type DomainLoader, ToolRegistry } from "./registry.js";
import { setMaxResponseChars, toolResult } from "./utils.js";

const PORT = Number(process.env.PORT ?? process.env.ST_MCP_PORT ?? 3100);
const API_KEY = process.env.ST_MCP_API_KEY ?? "";

if (!API_KEY) {
  process.stderr.write("Fatal: ST_MCP_API_KEY is required for remote access.\n");
  process.exit(1);
}

// ── Reuse the domain loading logic from index.ts ──

async function loadDomainModules(
  registry: ToolRegistry,
  logger: Logger,
): Promise<void> {
  const domainsDirectory = fileURLToPath(new URL("./domains", import.meta.url));
  const entries = await readdir(domainsDirectory, { withFileTypes: true });
  const domainDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const dirName of domainDirs) {
    const fileUrl = new URL(`./domains/${dirName}/index.js`, import.meta.url).href;
    let module: { default?: DomainLoader; loadDomain?: DomainLoader };
    try {
      module = (await import(fileUrl)) as typeof module;
    } catch {
      logger.debug("No index.js in domain directory", { domain: dirName });
      continue;
    }
    const loader = module.default ?? module.loadDomain;
    if (!loader) {
      logger.warn("Domain module missing loader export", { domain: dirName });
      continue;
    }
    registry.registerDomain(dirName, loader);
  }
}

// ── Auth middleware ──

function authenticate(req: IncomingMessage): boolean {
  const key = req.headers["x-api-key"];
  if (typeof key === "string" && key === API_KEY) {
    return true;
  }
  // Also check Authorization: Bearer <key>
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ") && auth.slice(7) === API_KEY) {
    return true;
  }
  return false;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization");
}

// ── Main ──

async function main(): Promise<void> {
  const config = loadConfig();
  setMaxResponseChars(config.maxResponseChars);

  const logger = new Logger(config.logLevel);
  const server = new McpServer({ name: "ServiceTitan", version: "2.0.0" });
  const client = new ServiceTitanClient(config);
  const auditLogger = new AuditLogger(logger);
  const registry = new ToolRegistry(server, config, logger, auditLogger);
  registry.attachClient(client);

  // Register health check tool
  registry.register({
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
        checks.authentication = `FAILED: ${error instanceof Error ? error.message : String(error)}`;
      }
      try {
        await client.get("/settings/v2/tenant/{tenant}/business-units", { pageSize: 1 });
        checks.tenant_access = "OK";
      } catch (error: unknown) {
        checks.tenant_access = `FAILED: ${error instanceof Error ? error.message : String(error)}`;
      }
      checks.environment = config.environment;
      checks.readonly_mode = String(config.readonlyMode);
      checks.tools_registered = String(registry.getStats().registered);
      return toolResult(checks);
    },
  });

  await loadDomainModules(registry, logger);
  registry.logSummary();

  const stats = registry.getStats();
  logger.info("SSE server starting", { port: PORT, tools: stats.registered });

  // Track active SSE transports by session ID
  const transports = new Map<string, SSEServerTransport>();

  const httpServer = createServer(async (req, res) => {
    sendCorsHeaders(res);

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

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
    if (!authenticate(req)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    // SSE connection endpoint
    if (url.pathname === "/sse" && req.method === "GET") {
      const transport = new SSEServerTransport("/messages", res);
      transports.set(transport.sessionId, transport);

      transport.onclose = () => {
        transports.delete(transport.sessionId);
        logger.info("SSE client disconnected", { sessionId: transport.sessionId });
      };

      logger.info("SSE client connected", { sessionId: transport.sessionId });
      await server.connect(transport);
      return;
    }

    // Message endpoint (POST from SSE clients)
    if (url.pathname === "/messages" && req.method === "POST") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) {
        sendJson(res, 400, { error: "Missing sessionId query parameter" });
        return;
      }

      const transport = transports.get(sessionId);
      if (!transport) {
        sendJson(res, 404, { error: "Unknown session" });
        return;
      }

      // Parse the body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());

      await transport.handlePostMessage(req, res, body);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  });

  httpServer.listen(PORT, () => {
    logger.info(`SSE server listening on port ${PORT}`);
    logger.info(`Connect Claude Desktop with: http://localhost:${PORT}/sse`);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
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
