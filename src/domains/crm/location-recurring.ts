import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import {
  activeFilterParam,
  buildParams,
  dateFilterParams,
  paginationParams,
  toolError,
  toolResult,
} from "../../utils.js";

const recurringServiceEventStatusSchema = z.enum([
  "NotAttempted",
  "Unreachable",
  "Contacted",
  "Won",
  "Dismissed",
]);

const recurringServicePayloadSchema = z.object({
  membershipId: z.number().int().optional().describe("Membership ID"),
  locationId: z.number().int().optional().describe("Location ID"),
  recurringServiceTypeId: z.number().int().optional().describe("Recurring service type ID"),
  summary: z.string().optional().describe("Recurring service summary"),
  startDate: z.string().optional().describe("Start date"),
  endDate: z.string().optional().describe("End date"),
  nextServiceDate: z.string().optional().describe("Next service date"),
  active: z.boolean().optional().describe("Active flag"),
  autoRenew: z.boolean().optional().describe("Auto-renew flag"),
});

const recurringServiceIdSchema = z.object({
  id: z.number().int().describe("Recurring service ID"),
});

const recurringServiceUpdateSchema = z.object({
  id: z.number().int().describe("Recurring service ID"),
  payload: recurringServicePayloadSchema.optional().describe("Recurring service update payload"),
});

const recurringServicesListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        ids: z.string().optional().describe("Comma-delimited recurring service IDs (max 50)"),
        membershipIds: z.string().optional().describe("Comma-delimited membership IDs"),
        locationIds: z.string().optional().describe("Comma-delimited location IDs"),
      })
      .extend(activeFilterParam()),
  ),
);

const recurringServiceEventIdSchema = z.object({
  id: z.number().int().describe("Recurring service event ID"),
});

const recurringServiceEventsListSchema = paginationParams(
  z.object({
    ids: z.string().optional().describe("Comma-delimited recurring service event IDs (max 50)"),
    locationId: z.number().int().optional().describe("Location ID"),
    jobId: z.number().int().optional().describe("Job ID"),
    status: recurringServiceEventStatusSchema.optional().describe("Follow-up status"),
    createdBefore: z.string().datetime().optional().describe("Created before timestamp"),
    createdOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Created on or after timestamp"),
  }),
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerLocationRecurringTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "crm_location_recurring_services_get",
    domain: "crm",
    operation: "read",
    description: "Get a location recurring service by ID",
    schema: recurringServiceIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof recurringServiceIdSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/recurring-services/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_location_recurring_services_update",
    domain: "crm",
    operation: "write",
    description: "Patch a location recurring service",
    schema: recurringServiceUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof recurringServiceUpdateSchema>;

      try {
        const data = await client.patch(`/tenant/{tenant}/recurring-services/${input.id}`, input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_location_recurring_services_list",
    domain: "crm",
    operation: "read",
    description: "List location recurring services",
    schema: recurringServicesListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof recurringServicesListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/recurring-services",
          buildParams({
            ids: input.ids,
            membershipIds: input.membershipIds,
            locationIds: input.locationIds,
            active: input.active,
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
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_location_recurring_service_events_list",
    domain: "crm",
    operation: "read",
    description: "List location recurring service events",
    schema: recurringServiceEventsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof recurringServiceEventsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/recurring-service-events",
          buildParams({
            ids: input.ids,
            locationId: input.locationId,
            jobId: input.jobId,
            status: input.status,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_location_recurring_service_events_mark_complete",
    domain: "crm",
    operation: "write",
    description: "Mark a recurring service event complete",
    schema: recurringServiceEventIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof recurringServiceEventIdSchema>;

      try {
        const data = await client.post(
          `/tenant/{tenant}/recurring-service-events/${input.id}/mark-complete`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_location_recurring_service_events_mark_incomplete",
    domain: "crm",
    operation: "write",
    description: "Mark a recurring service event incomplete",
    schema: recurringServiceEventIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof recurringServiceEventIdSchema>;

      try {
        const data = await client.post(
          `/tenant/{tenant}/recurring-service-events/${input.id}/mark-incomplete`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });
}
