import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, paginationParams, sortParam, toolError, toolResult, getErrorMessage } from "../../utils.js";

const campaignCostPayloadSchema = z.object({
  year: z.number().int().optional().describe("Cost year"),
  month: z.number().int().optional().describe("Cost month"),
  dailyCost: z.number().optional().describe("Daily cost"),
  campaignId: z.number().int().optional().describe("Campaign ID"),
});

const campaignCostCreateSchema = campaignCostPayloadSchema.extend({
  year: z.number().int().describe("Cost year"),
  month: z.number().int().describe("Cost month"),
  dailyCost: z.number().describe("Daily cost"),
  campaignId: z.number().int().describe("Campaign ID"),
});

const campaignCostIdSchema = z.object({
  id: z.number().int().describe("Campaign cost ID"),
});

const campaignCostUpdateSchema = z.object({
  id: z.number().int().describe("Campaign cost ID"),
  payload: campaignCostPayloadSchema.optional().describe("Campaign cost update payload"),
});

const campaignCostsListSchema = paginationParams(
  z.object({
    year: z.number().int().optional().describe("Cost year"),
    month: z.number().int().optional().describe("Cost month"),
    campaignId: z.number().int().optional().describe("Campaign ID"),
    ...sortParam(["Id", "Date"]),
  }),
);
function registerCampaignCostListTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
  name: "marketing_campaign_costs_list",
  description: string,
): void {
  registry.register({
    name,
    domain: "marketing",
    operation: "read",
    description,
    schema: campaignCostsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignCostsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/costs",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            year: input.year,
            month: input.month,
            campaignId: input.campaignId,
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

export function registerMarketingCampaignCostTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registerCampaignCostListTool(
    client,
    registry,
    "marketing_campaign_costs_list",
    "List campaign costs",
  );

  registry.register({
    name: "marketing_campaign_costs_create",
    domain: "marketing",
    operation: "write",
    description: "Create a campaign cost",
    schema: campaignCostCreateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignCostCreateSchema>;

      try {
        const data = await client.post("/tenant/{tenant}/costs", input);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_campaign_costs_get",
    domain: "marketing",
    operation: "read",
    description: "Get a campaign cost by ID",
    schema: campaignCostIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignCostIdSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/costs/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_campaign_costs_update",
    domain: "marketing",
    operation: "write",
    description: "Update a campaign cost",
    schema: campaignCostUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignCostUpdateSchema>;

      try {
        const data = await client.patch(`/tenant/{tenant}/costs/${input.id}`, input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_campaign_costs_delete",
    domain: "marketing",
    operation: "delete",
    description: "Delete a campaign cost",
    schema: campaignCostIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignCostIdSchema>;

      try {
        const data = await client.delete(`/tenant/{tenant}/costs/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
