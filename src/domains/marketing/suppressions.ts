import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, paginationParams, toolError, toolResult } from "../../utils.js";

const suppressionEmailSchema = z.object({
  email: z.string().email().describe("Suppression email address"),
});

const suppressionAddSchema = z.object({
  email: z.string().email().describe("Email address to suppress"),
  group_id: z.number().int().optional().describe("Suppression group ID"),
  reason: z.string().optional().describe("Suppression reason"),
});

const suppressionRemoveSchema = z.object({
  email: z.string().email().optional().describe("Email address to unsuppress"),
  group_id: z.number().int().optional().describe("Suppression group ID"),
  reason: z.string().optional().describe("Unsuppression reason"),
});

const suppressionsListSchema = paginationParams(z.object({}));

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function registerSuppressionsListTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
  name: "marketing_suppressions_list" | "marketing_suppressions_getlist",
  description: string,
): void {
  registry.register({
    name,
    domain: "marketing",
    operation: "read",
    description,
    schema: suppressionsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof suppressionsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/suppressions",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}

export function registerMarketingSuppressionTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registerSuppressionsListTool(
    client,
    registry,
    "marketing_suppressions_list",
    "List suppressions",
  );

  registerSuppressionsListTool(
    client,
    registry,
    "marketing_suppressions_getlist",
    "List suppressions (legacy naming)",
  );

  registry.register({
    name: "marketing_suppressions_get",
    domain: "marketing",
    operation: "read",
    description: "Get a suppression by email",
    schema: suppressionEmailSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof suppressionEmailSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/suppressions/${input.email}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_suppressions_remove",
    domain: "marketing",
    operation: "write",
    description: "Remove suppression records",
    schema: suppressionRemoveSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof suppressionRemoveSchema>;

      try {
        const hasPayload =
          input.email !== undefined || input.group_id !== undefined || input.reason !== undefined;
        const data = await client.post(
          "/tenant/{tenant}/suppressions/unsuppress",
          hasPayload ? input : undefined,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_suppressions_add",
    domain: "marketing",
    operation: "write",
    description: "Add a suppression",
    schema: suppressionAddSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof suppressionAddSchema>;

      try {
        const data = await client.post("/tenant/{tenant}/suppressions/suppress", input);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
