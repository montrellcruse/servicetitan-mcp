import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import {
  activeFilterParam,
  buildParams,
  dateFilterParams,
  paginationParams,
  sortParam,
  toolError,
  toolResult,
} from "../../utils.js";

function withDescribedDateFilters<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return dateFilterParams(schema).extend({
    createdBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Return zones created before this UTC timestamp"),
    createdOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Return zones created on or after this UTC timestamp"),
    modifiedBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Return zones modified before this UTC timestamp"),
    modifiedOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Return zones modified on or after this UTC timestamp"),
  });
}
const zoneListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...activeFilterParam(),
      ...sortParam(["Id", "CreatedOn", "ModifiedOn"]),
    }),
  ),
);

export function registerSchedulingZoneTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "scheduling_zones_get",
    domain: "scheduling",
    operation: "read",
    description: "Retrieve a zone by its ServiceTitan ID. Returns the single upstream record without pagination; use scheduling_zones_list to search when the ID is unknown.",
    schema: {
      id: z.number().int().describe("Zone ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.get(`/tenant/{tenant}/zones/${id}`);
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "scheduling_zones_list",
    domain: "scheduling",
    operation: "read",
    description: "List one requested page of scheduling zones using active state and created or modified timestamp filters. Use scheduling_zones_get for one known zone ID; use scheduling_business_hours_list for configured operating hours rather than geographic zone definitions.",
    schema: zoneListSchema.shape,
    handler: async (params) => {
      const typed = params as z.infer<typeof zoneListSchema>;

      try {
        const data = await client.get("/tenant/{tenant}/zones", buildParams(typed));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  });
}
