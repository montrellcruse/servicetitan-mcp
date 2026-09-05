import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceTitanClient } from "./client.js";
import type { ServiceTitanConfig } from "./config.js";
import { assertWritePolicy } from "./config.js";
import { loadDomainModules } from "./domains/loader.js";
import { Logger } from "./logger.js";
import { ToolRegistry } from "./registry.js";
import { checkReadiness } from "./readiness.js";
import { getRequestContext, throwIfAborted } from "./request-context.js";
import { toolResult } from "./utils.js";

declare const __PACKAGE_VERSION__: string | undefined;

export const VERSION = typeof __PACKAGE_VERSION__ === "string" ? __PACKAGE_VERSION__ : (createRequire(import.meta.url)("../package.json") as { version: string }).version;

export async function createMcpServer(config: ServiceTitanConfig, options: { client?: ServiceTitanClient; logger?: Logger } = {}) {
  assertWritePolicy(config);
  const client = options.client ?? new ServiceTitanClient(config);
  const logger = options.logger ?? new Logger(config.logLevel, [config.clientSecret, config.appKey]);
  const server = new McpServer({ name: "ServiceTitan", version: VERSION });
  const registry = new ToolRegistry(server, config, logger);
  registry.attachClient(client);
  registry.register({
    name: "st_health_check", domain: "_system", operation: "read", schema: {},
    description: "Verify authentication and representative tenant read access. Use st_readiness_check for report and module compatibility.",
    handler: async () => {
      const checks: Record<string, string> = {};
      try { await client.ensureToken(); checks.authentication = "OK"; } catch { throwIfAborted(getRequestContext().signal); checks.authentication = "FAILED"; }
      if (checks.authentication === "OK") {
        try { await client.get("/settings/v2/tenant/{tenant}/business-units", { pageSize: 1 }); checks.tenant_access = "OK"; }
        catch { throwIfAborted(getRequestContext().signal); checks.tenant_access = "FAILED"; }
      } else { checks.tenant_access = "NOT_CHECKED"; }
      return toolResult(checks);
    },
  });
  registry.register({
    name: "st_readiness_check", domain: "_system", operation: "read",
    schema: { reports: z.boolean().optional().describe("Validate configured intelligence report definitions without executing report data") },
    description: "Read-only compatibility manifest: authentication, representative module read access, report fields/parameters and definition fingerprints. Does not certify write scopes or metric totals.",
    handler: async (params) => toolResult(await checkReadiness(client, config, { reports: (params as { reports?: boolean }).reports })),
  });
  registry.register({
    name: "st_result_read", domain: "_system", operation: "read",
    schema: { resultId: z.string().uuid(), offset: z.number().int().min(0).optional().default(0) },
    description: "Retrieve a stored large result as bounded JSON text chunks. Start at offset 0, concatenate text in nextOffset order, then parse JSON. Results expire after five minutes and belong to this session.",
    handler: async params => { const { resultId, offset = 0 } = params as { resultId: string; offset?: number }; return toolResult(registry.readResult(resultId, offset)); },
  });
  const close = server.close.bind(server);
  server.close = async () => { registry.clearResults(); await close(); };
  await loadDomainModules(registry, logger);
  registry.validateSelection();
  return { server, registry, client, logger };
}

export { ExperimentalWritesDisabledError, loadConfig } from "./config.js";
export type { ServiceTitanConfig } from "./config.js";
export { ServiceTitanClient } from "./client.js";
export { checkReadiness } from "./readiness.js";
