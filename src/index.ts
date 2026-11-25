#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createMcpServer } from "./server.js";
import { startupErrorMessage } from "./startup-diagnostics.js";

async function main(): Promise<void> {
  const { server, registry, logger } = await createMcpServer(loadConfig());
  registry.logSummary();
  await server.connect(new StdioServerTransport());
  const shutdown = async () => { await server.close(); process.exit(0); };
  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
  logger.info("Stdio server ready", registry.getStats());
}
main().catch((error: unknown) => {
  const message = startupErrorMessage(error, "Fatal startup error. Check required ServiceTitan configuration.");
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
