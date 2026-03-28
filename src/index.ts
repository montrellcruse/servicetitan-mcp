import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { AuditLogger } from "./audit.js";
import { ServiceTitanClient } from "./client.js";
import { loadConfig } from "./config.js";
import { Logger } from "./logger.js";
import { type DomainLoader, ToolRegistry } from "./registry.js";
import { setMaxResponseChars, toolResult } from "./utils.js";

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

async function main(): Promise<void> {
  // 1. Load and validate config (throws on missing vars)
  const config = loadConfig();
  setMaxResponseChars(config.maxResponseChars);

  // 2. Initialize logger
  const logger = new Logger(config.logLevel);

  // 3. Create MCP server
  const server = new McpServer({
    name: "ServiceTitan",
    version: "2.3.0",
  });

  // 4. Create API client
  const client = new ServiceTitanClient(config);

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
      checks.confirm_writes = String(config.confirmWrites);
      checks.max_response_chars = String(config.maxResponseChars);
      checks.enabled_domains =
        config.enabledDomains && config.enabledDomains.length > 0
          ? config.enabledDomains.join(", ")
          : "all";

      const stats = registry.getStats();
      checks.tools_registered = String(stats.registered);
      checks.tools_skipped = String(stats.skipped);

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
