import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult, getErrorMessage } from "../../utils.js";

const capacityCalculateSchema = z.object({
  payload: z.object({}).passthrough().describe("Capacity calculation payload"),
});

export function registerSchedulingCapacityTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "scheduling_capacity_calculate",
    domain: "scheduling",
    operation: "write",
    description: "Calculate capacity for scheduling",
    schema: capacityCalculateSchema.shape,
    handler: async (params) => {
      const input = capacityCalculateSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/capacity", input.payload);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
