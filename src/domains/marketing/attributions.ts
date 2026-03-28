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
  getErrorMessage,
} from "../../utils.js";

const safePathSegmentSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Must contain only alphanumeric characters, hyphens, and underscores",
  );

const attributionCreateSchema = z.object({
  payload: z.object({}).passthrough().optional().describe("Attribution payload"),
});

const attributedLeadsListSchema = paginationParams(
  z.object({
    fromUtc: z
      .string()
      .datetime()
      .describe("Start date/time in UTC for the filtering period"),
    toUtc: z.string().datetime().describe("End date/time in UTC for the filtering period"),
    leadType: z
      .enum(["Call", "WebBooking", "WebLeadForm", "ManualJob"])
      .optional()
      .describe("Lead type filter"),
  }),
);

const clientSpecificPricingListSchema = paginationParams(
  z.object({
    ids: z.string().optional().describe("Comma-delimited rate sheet IDs"),
    searchTerm: z.string().optional().describe("Search term"),
    ...activeFilterParam(),
  }),
);

const clientSpecificPricingUpdateSchema = z.object({
  rateSheetId: z.number().int().describe("Rate sheet ID"),
  payload: z.object({}).passthrough().describe("Rate sheet update payload"),
});

const reviewsListSchema = paginationParams(
  z.object({
    search: z.string().optional().describe("Search text"),
    reportType: z.number().int().optional().describe("Report type"),
    sort: z.string().optional().describe("Sort expression"),
    createdOnOrAfter: z.string().datetime().optional().describe("Created on or after timestamp"),
    createdBefore: z.string().datetime().optional().describe("Created before timestamp"),
    modifiedOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Modified on or after timestamp"),
    modifiedBefore: z.string().datetime().optional().describe("Modified before timestamp"),
    fromDate: z.string().datetime().optional().describe("Review date from"),
    toDate: z.string().datetime().optional().describe("Review date to"),
    responseTypes: z.array(z.string()).optional().describe("Response types"),
    locationIds: z.array(z.number().int()).optional().describe("Location IDs"),
    sources: z.array(z.string()).optional().describe("Review sources"),
    reviewStatuses: z.array(z.string()).optional().describe("Review statuses"),
    technicianIds: z.array(z.number().int()).optional().describe("Technician IDs"),
    campaignIds: z.array(z.number().int()).optional().describe("Campaign IDs"),
    fromRating: z.number().optional().describe("From rating"),
    toRating: z.number().optional().describe("To rating"),
    includeReviewsWithoutLocation: z
      .boolean()
      .optional()
      .describe("Include reviews without location"),
    includeReviewsWithoutCampaign: z
      .boolean()
      .optional()
      .describe("Include reviews without campaign"),
    includeReviewsWithoutTechnician: z
      .boolean()
      .optional()
      .describe("Include reviews without technician"),
  }),
);

const schedulerIdSchema = z.object({
  id: safePathSegmentSchema.describe("Scheduler ID"),
});

const schedulerPerformanceSchema = z.object({
  id: safePathSegmentSchema.describe("Scheduler ID"),
  sessionCreatedOnOrAfter: z
    .string()
    .datetime()
    .describe("Session created on or after timestamp"),
  sessionCreatedBefore: z.string().datetime().describe("Session created before timestamp"),
});

const schedulerListSchema = dateFilterParams(
  paginationParams(
    z.object({}),
  ),
);

const schedulerSessionsListSchema = dateFilterParams(
  paginationParams(
    z.object({
      id: safePathSegmentSchema.describe("Scheduler ID"),
    }),
  ),
);
function toCsv<T>(items: T[] | undefined): string | undefined {
  return items && items.length > 0 ? items.join(",") : undefined;
}

function registerAttributionCreateTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
  options: {
    name: string;
    description: string;
    path: string;
  },
): void {
  registry.register({
    name: options.name,
    domain: "marketing",
    operation: "write",
    description: options.description,
    schema: attributionCreateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof attributionCreateSchema>;

      try {
        const data = await client.post(options.path, input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}

export function registerMarketingAttributionTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registerAttributionCreateTool(client, registry, {
    name: "marketing_external_call_attributions_create",
    description: "Create external call attributions",
    path: "/tenant/{tenant}/external-call-attributions",
  });

  registerAttributionCreateTool(client, registry, {
    name: "marketing_scheduled_job_attributions_create",
    description: "Create scheduled job attributions",
    path: "/tenant/{tenant}/job-attributions",
  });

  registerAttributionCreateTool(client, registry, {
    name: "marketing_web_booking_attributions_create",
    description: "Create web booking attributions",
    path: "/tenant/{tenant}/web-booking-attributions",
  });

  registerAttributionCreateTool(client, registry, {
    name: "marketing_web_lead_form_attributions_create",
    description: "Create web lead form attributions",
    path: "/tenant/{tenant}/web-lead-form-attributions",
  });

  registry.register({
    name: "marketing_attributed_leads_get",
    domain: "marketing",
    operation: "read",
    description: "Get attributed leads",
    schema: attributedLeadsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof attributedLeadsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/attributed-leads",
          buildParams({
            fromUtc: input.fromUtc,
            toUtc: input.toUtc,
            leadType: input.leadType,
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

  registry.register({
    name: "marketing_client_side_data_get",
    domain: "marketing",
    operation: "read",
    description: "Get marketing client-side data",
    schema: {},
    handler: async () => {
      try {
        const data = await client.get("/tenant/{tenant}/data");
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_client_specific_pricing_get_all_rate_sheets",
    domain: "marketing",
    operation: "read",
    description: "List all client-specific pricing rate sheets",
    schema: clientSpecificPricingListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof clientSpecificPricingListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/clientspecificpricing",
          buildParams({
            ids: input.ids,
            searchTerm: input.searchTerm,
            active: input.active,
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

  registry.register({
    name: "marketing_client_specific_pricing_update_rate_sheet",
    domain: "marketing",
    operation: "write",
    description: "Update a client-specific pricing rate sheet",
    schema: clientSpecificPricingUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof clientSpecificPricingUpdateSchema>;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/clientspecificpricing/${input.rateSheetId}`,
          input.payload,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_reviews",
    domain: "marketing",
    operation: "read",
    description: "List marketing reviews",
    schema: reviewsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof reviewsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/reviews",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            search: input.search,
            reportType: input.reportType,
            sort: input.sort,
            createdOnOrAfter: input.createdOnOrAfter,
            createdBefore: input.createdBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            fromDate: input.fromDate,
            toDate: input.toDate,
            responseTypes: toCsv(input.responseTypes),
            locationIds: toCsv(input.locationIds),
            sources: toCsv(input.sources),
            reviewStatuses: toCsv(input.reviewStatuses),
            technicianIds: toCsv(input.technicianIds),
            campaignIds: toCsv(input.campaignIds),
            fromRating: input.fromRating,
            toRating: input.toRating,
            includeReviewsWithoutLocation: input.includeReviewsWithoutLocation,
            includeReviewsWithoutCampaign: input.includeReviewsWithoutCampaign,
            includeReviewsWithoutTechnician: input.includeReviewsWithoutTechnician,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_scheduler_schedulers",
    domain: "marketing",
    operation: "read",
    description: "List schedulers",
    schema: schedulerListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof schedulerListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/schedulers",
          buildParams({
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
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

  registry.register({
    name: "marketing_scheduler_scheduler_performance",
    domain: "marketing",
    operation: "read",
    description: "Get scheduler performance",
    schema: schedulerPerformanceSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof schedulerPerformanceSchema>;

      try {
        const encodedSchedulerId = encodeURIComponent(input.id);
        const data = await client.get(
          `/tenant/{tenant}/schedulers/${encodedSchedulerId}/performance`,
          {
            sessionCreatedOnOrAfter: input.sessionCreatedOnOrAfter,
            sessionCreatedBefore: input.sessionCreatedBefore,
          },
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_scheduler_schedulersessions",
    domain: "marketing",
    operation: "read",
    description: "List scheduler sessions",
    schema: schedulerSessionsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof schedulerSessionsListSchema>;

      try {
        const encodedSchedulerId = encodeURIComponent(input.id);
        const data = await client.get(
          `/tenant/{tenant}/schedulers/${encodedSchedulerId}/sessions`,
          buildParams({
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
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
