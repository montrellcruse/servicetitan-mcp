import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import {
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
      .describe("Return teams created before this UTC timestamp"),
    createdOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Return teams created on or after this UTC timestamp"),
    modifiedBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Return teams modified before this UTC timestamp"),
    modifiedOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Return teams modified on or after this UTC timestamp"),
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const teamListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...sortParam(["Id", "CreatedOn", "ModifiedOn"]),
      includeInactive: z.boolean().optional().describe("Whether to include inactive teams"),
    }),
  ),
);

export function registerSchedulingTeamTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "scheduling_teams_list",
    domain: "scheduling",
    operation: "read",
    description: "List teams",
    schema: teamListSchema.shape,
    handler: async (params) => {
      const typed = params as z.infer<typeof teamListSchema>;

      try {
        const data = await client.get("/tenant/{tenant}/teams", buildParams(typed));
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "scheduling_teams_create",
    domain: "scheduling",
    operation: "write",
    description: "Create a team",
    schema: {
      name: z.string().describe("Team name"),
      active: z.boolean().optional().describe("Whether the team is active"),
    },
    handler: async (params) => {
      const { name, active } = params as { name: string; active?: boolean };

      try {
        const data = await client.post("/tenant/{tenant}/teams", buildParams({ name, active }));
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "scheduling_teams_get",
    domain: "scheduling",
    operation: "read",
    description: "Get a team by ID",
    schema: {
      id: z.number().int().describe("Team ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.get(`/tenant/{tenant}/teams/${id}`);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "scheduling_teams_delete",
    domain: "scheduling",
    operation: "delete",
    description: "Delete a team",
    schema: {
      id: z.number().int().describe("Team ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        await client.delete(`/tenant/{tenant}/teams/${id}`);
        return toolResult({ success: true, message: "Team deleted successfully." });
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
