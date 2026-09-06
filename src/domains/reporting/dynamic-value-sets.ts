import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, paginationParams, toolError, toolResult } from "../../utils.js";

const dynamicValueSetSchema = paginationParams(
  z.object({
    dynamicSetId: z
      .string()
      .describe("Dynamic set ID from report metadata"),
  }),
);
export function registerDynamicValueSetTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "reporting_dynamic_value_sets_get",
    domain: "reporting",
    operation: "read",
    description: "Resolve selectable values for a report dynamic-value-set identifier. Use values from the report definition to supply the required identifier and paging inputs when that report parameter offers dynamic choices.",
    schema: dynamicValueSetSchema.shape,
    handler: async (params) => {
      const { dynamicSetId, ...query } = params as {
        dynamicSetId: string;
        page?: number;
        pageSize?: number;
        includeTotal?: boolean;
      };

      try {
        const data = await client.get(
          `/tenant/{tenant}/dynamic-value-sets/${dynamicSetId}`,
          buildParams(query),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  });
}
