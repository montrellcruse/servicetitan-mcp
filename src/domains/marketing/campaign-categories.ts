import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, paginationParams, sortParam, toolError, toolResult, getErrorMessage } from "../../utils.js";

const campaignCategoryPayloadSchema = z.object({
  name: z.string().optional().describe("Campaign category name"),
  active: z.boolean().optional().describe("Campaign category active flag"),
});

const campaignCategoryCreateSchema = z.object({
  payload: campaignCategoryPayloadSchema.optional().describe("Campaign category payload"),
});

const campaignCategoryIdSchema = z.object({
  id: z.number().int().describe("Campaign category ID"),
});

const campaignCategoryUpdateSchema = z.object({
  id: z.number().int().describe("Campaign category ID"),
  payload: campaignCategoryPayloadSchema.optional().describe("Campaign category update payload"),
});

const campaignCategoryListSchema = paginationParams(
  z.object({
    createdBefore: z.string().datetime().optional().describe("Created before timestamp"),
    createdOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Created on or after timestamp"),
    ...sortParam(["Id", "CreatedOn", "Name"]),
  }),
);
function registerCampaignCategoryListTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
  name: "marketing_campaign_categories_list" | "marketing_campaign_categories_get_list",
  description: string,
): void {
  registry.register({
    name,
    domain: "marketing",
    operation: "read",
    description,
    schema: campaignCategoryListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignCategoryListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/categories",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            sort: input.sort,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}

export function registerMarketingCampaignCategoryTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "marketing_campaign_categories_create",
    domain: "marketing",
    operation: "write",
    description: "Create a campaign category",
    schema: campaignCategoryCreateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignCategoryCreateSchema>;

      try {
        const data = await client.post("/tenant/{tenant}/categories", input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registerCampaignCategoryListTool(
    client,
    registry,
    "marketing_campaign_categories_list",
    "List campaign categories",
  );

  registerCampaignCategoryListTool(
    client,
    registry,
    "marketing_campaign_categories_get_list",
    "List campaign categories (legacy naming)",
  );

  registry.register({
    name: "marketing_campaign_categories_get",
    domain: "marketing",
    operation: "read",
    description: "Get a campaign category by ID",
    schema: campaignCategoryIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignCategoryIdSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/categories/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_campaign_categories_update",
    domain: "marketing",
    operation: "write",
    description: "Update a campaign category",
    schema: campaignCategoryUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignCategoryUpdateSchema>;

      try {
        const data = await client.patch(`/tenant/{tenant}/categories/${input.id}`, input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_campaign_categories_delete",
    domain: "marketing",
    operation: "delete",
    description: "Delete a campaign category",
    schema: campaignCategoryIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignCategoryIdSchema>;

      try {
        const data = await client.delete(`/tenant/{tenant}/categories/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
