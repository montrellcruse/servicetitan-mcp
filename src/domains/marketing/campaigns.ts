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

const campaignCategoryCreateSchema = z.object({
  payload: z.object({}).passthrough().optional().describe("Campaign category payload"),
});

const campaignCategoryGetSchema = z.object({
  id: z.number().int().describe("Campaign category ID"),
});

const campaignCategoryUpdateSchema = z.object({
  id: z.number().int().describe("Campaign category ID"),
  payload: z
    .object({
      name: z.string().optional().describe("Campaign category name"),
      active: z.boolean().optional().describe("Whether category is active"),
    })
    .passthrough()
    .optional()
    .describe("Campaign category update payload"),
});

const campaignCategoryListSchema = paginationParams(
  z.object({
    createdBefore: z.string().datetime().optional().describe("Filter by created-before"),
    createdOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Filter by created-on-or-after"),
    ...sortParam(["Id", "CreatedOn", "Name"]),
  }),
);

const campaignCostCreateSchema = z.object({
  year: z.number().int().describe("Cost year"),
  month: z.number().int().describe("Cost month"),
  dailyCost: z.number().describe("Daily cost"),
  campaignId: z.number().int().describe("Campaign ID"),
});

const campaignCostGetSchema = z.object({
  id: z.number().int().describe("Campaign cost ID"),
});

const campaignCostUpdateSchema = z.object({
  id: z.number().int().describe("Campaign cost ID"),
  payload: z.object({}).passthrough().describe("Campaign cost update payload"),
});

const campaignCostsListSchema = paginationParams(
  z.object({
    year: z.number().int().optional().describe("Cost year"),
    month: z.number().int().optional().describe("Cost month"),
    campaignId: z.number().int().optional().describe("Campaign ID"),
    ...sortParam(["Id", "Date"]),
  }),
);

const campaignPayloadSchema = z
  .object({
    name: z.string().optional().describe("Campaign name"),
    active: z.boolean().optional().describe("Campaign active flag"),
    source: z.string().optional().describe("Campaign source"),
    otherSource: z.string().optional().describe("Other campaign source"),
    businessUnit: z.string().optional().describe("Business unit"),
    medium: z.string().optional().describe("Campaign medium"),
    otherMedium: z.string().optional().describe("Other campaign medium"),
    campaignPhoneNumbers: z
      .array(z.string())
      .optional()
      .describe("Campaign phone numbers"),
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
      campaignPhoneNumber: z
        .string()
        .optional()
        .describe("Campaign phone number filter"),
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerMarketingCampaignTools(
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

  registry.register({
    name: "marketing_campaign_categories_list",
    domain: "marketing",
    operation: "read",
    description: "List campaign categories",
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

  registry.register({
    name: "marketing_campaign_categories_get",
    domain: "marketing",
    operation: "read",
    description: "Get a campaign category by ID",
    schema: campaignCategoryGetSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignCategoryGetSchema>;

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
    name: "marketing_campaign_costs_list",
    domain: "marketing",
    operation: "read",
    description: "List campaign costs",
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
    schema: campaignCostGetSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignCostGetSchema>;

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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_campaigns_get",
    domain: "marketing",
    operation: "read",
    description: "Get a campaign by ID",
    schema: campaignGetSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof campaignGetSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/campaigns/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_campaigns_list",
    domain: "marketing",
    operation: "read",
    description: "List campaigns",
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
        return toolError(getErrorMessage(error));
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_campaigns_costs_list",
    domain: "marketing",
    operation: "read",
    description: "List costs for a campaign",
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
        return toolError(getErrorMessage(error));
      }
    },
  });
}
