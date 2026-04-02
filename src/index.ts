#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { AuditLogger } from "./audit.js";
import { ServiceTitanClient } from "./client.js";
import { loadConfig } from "./config.js";
import { loadDomainModules } from "./domains/loader.js";
import { Logger } from "./logger.js";
import { ToolRegistry } from "./registry.js";
import { setDisplayTimezone, setMaxResponseChars, toolResult } from "./utils.js";

async function main(): Promise<void> {
  // 1. Load and validate config (throws on missing vars)
  const config = loadConfig();
  setMaxResponseChars(config.maxResponseChars);
  setDisplayTimezone(config.timezone);

  // 2. Read version from package.json
  const { createRequire } = await import("node:module");
  const _require = createRequire(import.meta.url);
  const pkg = _require("../package.json") as { version: string };

  // 3. Initialize logger
  const logger = new Logger(config.logLevel);

  // 4. Create MCP server
  const server = new McpServer({
    name: "ServiceTitan",
    version: pkg.version,
  });

  // 4. Create API client
  const client = new ServiceTitanClient(config);

  // Pre-warm token and connection pool (non-blocking)
  client.prewarm();

  // 5. Create tool registry
  const auditLogger = new AuditLogger(logger);
  const registry = new ToolRegistry(server, config, logger, auditLogger);
  registry.attachClient(client);

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
      } catch {
        checks.authentication = "FAILED";
      }

      try {
        await client.get("/settings/v2/tenant/{tenant}/business-units", { pageSize: 1 });
        checks.tenant_access = "OK";
      } catch {
        checks.tenant_access = "FAILED";
      }

      return toolResult(checks);
    },
  });

  // 6. Load domain modules (dynamic imports from ./domains/)
  // Scans ./domains/*, imports each domain index.js, and registers all tools into the registry.
  await loadDomainModules(registry, logger);

  // 7. Log summary
  registry.logSummary();
  const stats = registry.getStats();
  logger.info("Server ready", stats);

  // 8. Connect transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
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
