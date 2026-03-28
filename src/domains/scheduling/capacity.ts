import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult, getErrorMessage } from "../../utils.js";
export function registerSchedulingCapacityTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "scheduling_capacity_calculate",
    domain: "scheduling",
    operation: "write",
    description: "Calculate capacity for scheduling",
    schema: {},
    handler: async () => {
      try {
        const data = await client.post("/tenant/{tenant}/capacity");
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
