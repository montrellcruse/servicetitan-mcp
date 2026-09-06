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

const campaignPayloadSchema = z
  .object({
    name: z.string().optional().describe("Campaign name"),
    active: z.boolean().optional().describe("Campaign active flag"),
    source: z.string().optional().describe("Campaign source"),
    otherSource: z.string().optional().describe("Other campaign source"),
    businessUnit: z.string().optional().describe("Business unit"),
    medium: z.string().optional().describe("Campaign medium"),
    otherMedium: z.string().optional().describe("Other campaign medium"),
    campaignPhoneNumbers: z.array(z.string()).optional().describe("Campaign phone numbers"),
  })
  .passthrough();

const campaignCreateSchema = z.object({
  payload: campaignPayloadSchema.extend({
    name: z.string().describe("Campaign name"),
  }),
});

const campaignGetSchema = z.object({
  id: z.number().int().describe("Campaign ID"),
});

const campaignUpdateSchema = z.object({
  id: z.number().int().describe("Campaign ID"),
  payload: campaignPayloadSchema.describe("Campaign update payload"),
});

const campaignsListSchema = paginationParams(
  dateFilterParams(
    z.object({
      ...activeFilterParam(),
      ids: z.string().optional().describe("Comma-delimited campaign IDs"),
      name: z.string().optional().describe("Campaign name filter"),
      campaignPhoneNumber: z.string().optional().describe("Campaign phone number filter"),
      ...sortParam(["Id", "Name", "CreatedOn", "ModifiedOn"]),
    }),
  ),
);

const campaignCostsByCampaignSchema = paginationParams(
  z.object({
    id: z.number().int().describe("Campaign ID"),
    year: z.number().int().optional().describe("Cost year"),
    month: z.number().int().optional().describe("Cost month"),
    ...sortParam(["Id", "Date"]),
  }),
);
export function registerMarketingCampaignTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "marketing_campaigns_create",
    domain: "marketing",
    operation: "write",
    description: "Create a campaign",
    schema: campaignCreateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignCreateSchema>;

      try {
        const data = await client.post("/tenant/{tenant}/campaigns", input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "marketing_campaigns_get",
    domain: "marketing",
    operation: "read",
    description: "Retrieve one marketing campaign record by ID, including its configured campaign data. Use marketing_campaigns_list to search by name, phone number, active state, IDs, or date ranges.",
    schema: campaignGetSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignGetSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/campaigns/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "marketing_campaigns_list",
    domain: "marketing",
    operation: "read",
    description: "Search campaigns by IDs, name, phone number, active state, or created and modified ranges. Returns one page; use marketing_campaigns_get for a known campaign ID.",
    schema: campaignsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/campaigns",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            active: input.active,
            ids: input.ids,
            name: input.name,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            campaignPhoneNumber: input.campaignPhoneNumber,
            sort: input.sort,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "marketing_campaigns_update",
    domain: "marketing",
    operation: "write",
    description: "Update a campaign",
    schema: campaignUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignUpdateSchema>;

      try {
        const data = await client.patch(`/tenant/{tenant}/campaigns/${input.id}`, input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "marketing_campaigns_costs_list",
    domain: "marketing",
    operation: "read",
    description: "List one page of costs for a required campaign ID, optionally filtered by year or month. Use marketing_campaign_costs_list for a broader cost search across campaigns.",
    schema: campaignCostsByCampaignSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignCostsByCampaignSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/campaigns/${input.id}/costs`,
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            year: input.year,
            month: input.month,
            sort: input.sort,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
