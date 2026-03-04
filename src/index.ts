import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { ServiceTitanClient } from "./client.js";
import { loadConfig } from "./config.js";
import { Logger } from "./logger.js";
import { type DomainLoader, ToolRegistry } from "./registry.js";

async function loadDomainModules(
  registry: ToolRegistry,
  logger: Logger,
): Promise<void> {
  const domainsDirectory = fileURLToPath(new URL("./domains", import.meta.url));

  const entries = await readdir(domainsDirectory, { withFileTypes: true });
  const domainFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".js"));

  for (const fileName of domainFiles) {
    const domainName = fileName.replace(/\.js$/, "");
    const fileUrl = new URL(`./domains/${fileName}`, import.meta.url).href;

    const module = (await import(fileUrl)) as {
      default?: DomainLoader;
      loadDomain?: DomainLoader;
    };

    const loader = module.default ?? module.loadDomain;

    if (!loader) {
      logger.warn("Domain module missing loader export", { domain: domainName });
      continue;
    }

    registry.registerDomain(domainName, loader);
  }
}

async function main(): Promise<void> {
  // 1. Load and validate config (throws on missing vars)
  const config = loadConfig();

  // 2. Initialize logger
  const logger = new Logger(config.logLevel);

  // 3. Create MCP server
  const server = new McpServer({
    name: "ServiceTitan",
    version: "2.0.0",
  });

  // 4. Create API client
  const client = new ServiceTitanClient(config);

  // 5. Create tool registry
  const registry = new ToolRegistry(server, config, logger);
  registry.attachClient(client);

  // 6. Load domain modules (dynamic imports from ./domains/)
  // Spec 01 has no domain modules yet, this just keeps the hook in place.
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
