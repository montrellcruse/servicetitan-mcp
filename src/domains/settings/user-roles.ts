import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { activeFilterParam, buildParams, paginationParams, toolError, toolResult, getErrorMessage } from "../../utils.js";

const userRoleListSchema = paginationParams(
  z.object({
    ...activeFilterParam(),
    ids: z.string().optional().describe("Comma-separated role IDs (max 50)"),
    name: z.string().optional().describe("Role name filter"),
    createdBefore: z.string().datetime().optional().describe("Created date upper bound (UTC)"),
    createdOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Created date lower bound (UTC)"),
    employeeType: z
      .enum(["None", "Employee", "Technician", "All"])
      .optional()
      .describe("Filter roles by employee type"),
  }),
);
export function registerUserRoleTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "settings_user_roles_list",
    domain: "settings",
    operation: "read",
    description: "List user roles",
    schema: userRoleListSchema.shape,
    handler: async (params) => {
      const input = userRoleListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/user-roles",
          buildParams({
            ids: input.ids,
            name: input.name,
            active: input.active,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            employeeType: input.employeeType,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
