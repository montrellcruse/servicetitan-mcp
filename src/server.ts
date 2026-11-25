import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ServiceTitanClient } from "./client.js";
import type { ServiceTitanConfig } from "./config.js";
import { Logger } from "./logger.js";
import { prepareToolCatalog, type SystemToolName } from "./prepare-tool-catalog.js";
import { ToolRegistry, type ToolDefinition } from "./registry.js";
import { checkCatalogReadiness } from "./readiness.js";
import { getRequestContext, throwIfAborted } from "./request-context.js";
import { toolResultChunk } from "./result-delivery.js";
import { toolResult } from "./utils.js";

declare const __PACKAGE_VERSION__: string | undefined;

export const VERSION = typeof __PACKAGE_VERSION__ === "string" ? __PACKAGE_VERSION__ : (createRequire(import.meta.url)("../package.json") as { version: string }).version;

export async function prepareMcpDeployment(config: ServiceTitanConfig, options: { client?: ServiceTitanClient; logger?: Logger } = {}) {
  const client = options.client ?? new ServiceTitanClient(config);
  const logger = options.logger ?? new Logger(config.logLevel, [config.clientSecret, config.appKey]);
  const catalog = await prepareToolCatalog(config, client, logger);

  function createServer() {
    const server = new McpServer({ name: "ServiceTitan", version: VERSION });
    const registry = new ToolRegistry(server, config, logger, undefined, catalog);
    registry.attachClient(client);
    const systemHandlers: Record<SystemToolName, ToolDefinition["handler"]> = {
      st_health_check: async () => {
        const checks: Record<string, string> = {};
        try { await client.ensureToken(); checks.authentication = "OK"; }
        catch { throwIfAborted(getRequestContext().signal); checks.authentication = "FAILED"; }
        if (checks.authentication === "OK") {
          try { await client.get("/settings/v2/tenant/{tenant}/business-units", { pageSize: 1 }); checks.tenant_access = "OK"; }
          catch { throwIfAborted(getRequestContext().signal); checks.tenant_access = "FAILED"; }
        } else { checks.tenant_access = "NOT_CHECKED"; }
        return toolResult(checks);
      },
      st_readiness_check: async params => toolResult(await checkCatalogReadiness(client, config, registry.catalog, { reports: (params as { reports?: boolean }).reports })),
      st_result_read: async params => {
        const { resultId, offset = 0 } = params as { resultId: string; offset?: number };
        return toolResultChunk(registry.readResult(resultId, offset));
      },
    };
    registry.registerCatalog(systemHandlers);
    const connect = server.server.connect.bind(server.server);
    server.server.connect = transport => {
      if (!server.server.transport) {
        // The SDK composes the transport callback when it attaches the connection.
        const onclose = transport.onclose;
        transport.onclose = () => {
          if (server.server.transport === transport) registry.clearResults();
          onclose?.();
        };
      }
      return connect(transport);
    };
    const close = server.close.bind(server);
    server.close = async () => { registry.clearResults(); await close(); };
    return { server, registry, client, logger };
  }

  return { catalog, createServer };
}

export async function createMcpServer(config: ServiceTitanConfig, options: { client?: ServiceTitanClient; logger?: Logger } = {}) {
  const deployment = await prepareMcpDeployment(config, options);
  return deployment.createServer();
}

export { ExperimentalWritesDisabledError, loadConfig } from "./config.js";
export type { ServiceTitanConfig } from "./config.js";
export { ServiceTitanClient } from "./client.js";
export { checkReadiness } from "./readiness.js";
