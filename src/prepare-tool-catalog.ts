import type { ServiceTitanClient } from "./client.js";
import type { ServiceTitanConfig } from "./config.js";
import { loadDomainModules } from "./domains/loader.js";
import type { Logger } from "./logger.js";
import { ToolRegistry } from "./registry.js";
import { z } from "./schema.js";
import type { ToolDeclaration } from "./tool-catalog.js";

const SYSTEM_TOOLS = [
  {
    name: "st_health_check", domain: "_system", operation: "read", schema: {},
    description: "Verify authentication and representative tenant read access. Use st_readiness_check for report and module compatibility.",
  },
  {
    name: "st_readiness_check", domain: "_system", operation: "read",
    schema: { reports: z.boolean().optional().describe("When true, also fetch and validate configured intelligence report definitions; report data is never executed") },
    description: "Read-only compatibility manifest: authentication, representative module read access, report fields/parameters and definition fingerprints. Does not certify write scopes or metric totals.",
  },
  {
    name: "st_result_read", domain: "_system", operation: "read",
    schema: {
      resultId: z.string().uuid().describe("Session-owned result identifier returned by a tool whose response exceeded the inline limit"),
      offset: z.number().int().min(0).optional().default(0).describe("Zero-based character offset for the next JSON text chunk; start at 0 and then use nextOffset"),
    },
    description: "Retrieve a stored large result as bounded JSON text chunks. Start at offset 0, concatenate text in nextOffset order, then parse JSON. Results expire after five minutes and belong to this session.",
  },
] as const satisfies readonly ToolDeclaration[];

export type SystemToolName = typeof SYSTEM_TOOLS[number]["name"];

/** Collect declarations without creating an SDK server or issuing requests. */
export async function prepareToolCatalog(config: ServiceTitanConfig, client: ServiceTitanClient, logger: Logger) {
  const declarations = new ToolRegistry(undefined, config, logger);
  for (const tool of SYSTEM_TOOLS) declarations.catalog.add(tool);
  declarations.attachClient(client);
  await loadDomainModules(declarations, logger);
  declarations.validateSelection();
  return declarations.catalog;
}
