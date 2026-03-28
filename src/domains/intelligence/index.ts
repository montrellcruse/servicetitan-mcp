import type { DomainLoader, ToolRegistry } from "../../registry.js";
import type { ServiceTitanClient } from "../../client.js";
import type { ToolResponse } from "../../types.js";

import { registerIntelligenceCampaignPerformanceTool } from "./campaign-roi.js";
import { registerIntelligenceCsrPerformanceTool } from "./csr-performance.js";
import { registerIntelligenceInvoiceTrackingTool } from "./invoice-tracking.js";
import { registerIntelligenceLaborCostTool } from "./labor-cost.js";
import { registerIntelligenceLookupTool } from "./lookup.js";
import { registerIntelligenceMembershipHealthTool } from "./membership-health.js";
import { registerIntelligenceDailySnapshotTool } from "./operational.js";
import { registerIntelligenceEstimatePipelineTool } from "./pipeline.js";
import { registerIntelligenceRevenueTool } from "./revenue.js";
import { registerIntelligenceTechnicianPerformanceTool } from "./technician-performance.js";
import { withIntelCache } from "./helpers.js";

/**
 * Creates a caching proxy for the ToolRegistry that wraps intelligence tool
 * handlers with a 5-minute in-memory cache. Cache key = tool name + args hash.
 * Transparent to the tool implementations — they register normally.
 */
function createCachingRegistry(inner: ToolRegistry): ToolRegistry {
  const CACHEABLE_PREFIX = "intel_";

  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === "register") {
        return (tool: { name: string; handler: (params: unknown) => Promise<ToolResponse>; [k: string]: unknown }) => {
          // Only cache intel_ tools (not lookup, which is reference data)
          if (tool.name.startsWith(CACHEABLE_PREFIX) && tool.name !== "intel_lookup") {
            const originalHandler = tool.handler;
            tool = {
              ...tool,
              handler: async (params: unknown) => {
                return withIntelCache(tool.name, params, () => originalHandler(params));
              },
            };
          }
          return target.register(tool as unknown as Parameters<typeof target.register>[0]);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export const loadIntelligenceDomain: DomainLoader = (client, registry) => {
  const cachedRegistry = createCachingRegistry(registry);
  registerIntelligenceLookupTool(client, cachedRegistry);
  registerIntelligenceRevenueTool(client, cachedRegistry);
  registerIntelligenceTechnicianPerformanceTool(client, cachedRegistry);
  registerIntelligenceMembershipHealthTool(client, cachedRegistry);
  registerIntelligenceEstimatePipelineTool(client, cachedRegistry);
  registerIntelligenceCampaignPerformanceTool(client, cachedRegistry);
  registerIntelligenceDailySnapshotTool(client, cachedRegistry);
  registerIntelligenceCsrPerformanceTool(client, cachedRegistry);
  registerIntelligenceLaborCostTool(client, cachedRegistry);
  registerIntelligenceInvoiceTrackingTool(client, cachedRegistry);
};

export default loadIntelligenceDomain;
