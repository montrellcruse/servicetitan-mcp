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
const recurringServiceEventStatusEnum = z.enum([
  "NotAttempted",
  "Unreachable",
  "Contacted",
  "Won",
  "Dismissed",
]);

const recurrenceTypeEnum = z.enum([
  "Weekly",
  "Monthly",
  "Seasonal",
  "Daily",
  "NthWeekdayOfMonth",
]);

const durationTypeEnum = z.enum(["Continuous", "NumberOfVisits"]);

const recurringServicePayloadSchema = z.object({
  membershipId: z
    .number()
    .int()
    .optional()
    .describe("Customer membership ID associated with this recurring service"),
  locationId: z.number().int().optional().describe("Location ID for this recurring service"),
  recurringServiceTypeId: z
    .number()
    .int()
    .optional()
    .describe("Recurring service type ID"),
  summary: z.string().optional().describe("Short summary for the recurring service"),
  startDate: z.string().optional().describe("Recurring service start date"),
  endDate: z.string().optional().describe("Recurring service end date"),
  nextServiceDate: z
    .string()
    .optional()
    .describe("Next scheduled service date for this recurring service"),
  active: z.boolean().optional().describe("Whether the recurring service is active"),
  autoRenew: z.boolean().optional().describe("Whether the recurring service auto-renews"),
});

const recurringServiceIdSchema = z.object({
  id: z.number().int().describe("Recurring service ID"),
});

const recurringServiceUpdateSchema = recurringServicePayloadSchema.extend({
  id: z.number().int().describe("Recurring service ID"),
});

const recurringServicesListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ids: z
        .string()
        .optional()
        .describe("Comma-separated recurring service IDs (maximum 50)"),
      membershipIds: z
        .string()
        .optional()
        .describe("Comma-separated customer membership IDs"),
      locationIds: z.string().optional().describe("Comma-separated location IDs"),
    }).extend(activeFilterParam()),
  ),
);

const recurringServiceEventIdSchema = z.object({
  id: z.number().int().describe("Recurring service event ID"),
});

const recurringServiceEventsListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ids: z
        .string()
        .optional()
        .describe("Comma-separated recurring service event IDs (maximum 50)"),
      locationId: z.number().int().optional().describe("Filter by location ID"),
      jobId: z.number().int().optional().describe("Filter by job ID"),
      status: recurringServiceEventStatusEnum
        .optional()
        .describe("Filter by recurring service event follow-up status"),
    }),
  ),
);

const recurringServiceTypeIdSchema = z.object({
  id: z.number().int().describe("Recurring service type ID"),
});

const recurringServiceTypesListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        ids: z
          .string()
          .optional()
          .describe("Comma-separated recurring service type IDs (maximum 50)"),
        membershipTypeId: z
          .number()
          .int()
          .optional()
          .describe("Filter by membership type ID"),
        recurrenceType: recurrenceTypeEnum
          .optional()
          .describe("Filter by recurrence type"),
        durationType: durationTypeEnum
          .optional()
          .describe("Filter by duration type"),
      })
      .extend(activeFilterParam())
      .extend(sortParam(["Id", "Name", "CreatedOn", "ModifiedOn"])),
  ),
);

export function registerRecurringServiceTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
) {
  registry.register({
    name: "memberships_recurring_services_get",
    domain: "memberships",
    operation: "read",
    description: "Get a recurring service by ID",
    schema: recurringServiceIdSchema.shape,
    handler: async (params) => {
      const { id } = recurringServiceIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/recurring-services/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "memberships_recurring_services_list",
    domain: "memberships",
    operation: "read",
    description: "List recurring services",
    schema: recurringServicesListSchema.shape,
    handler: async (params) => {
      const parsed = recurringServicesListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/recurring-services",
          buildParams({
            ids: parsed.ids,
            membershipIds: parsed.membershipIds,
            locationIds: parsed.locationIds,
            active: parsed.active,
            createdBefore: parsed.createdBefore,
            createdOnOrAfter: parsed.createdOnOrAfter,
            modifiedBefore: parsed.modifiedBefore,
            modifiedOnOrAfter: parsed.modifiedOnOrAfter,
            page: parsed.page,
            pageSize: parsed.pageSize,
            includeTotal: parsed.includeTotal,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "memberships_recurring_services_update",
    domain: "memberships",
    operation: "write",
    description: "Update a recurring service",
    schema: recurringServiceUpdateSchema.shape,
    handler: async (params) => {
      const parsed = recurringServiceUpdateSchema.parse(params);
      const { id, ...payload } = parsed;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/recurring-services/${id}`,
          buildParams(payload),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "memberships_recurring_service_events_list",
    domain: "memberships",
    operation: "read",
    description: "List recurring service events",
    schema: recurringServiceEventsListSchema.shape,
    handler: async (params) => {
      const parsed = recurringServiceEventsListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/recurring-service-events",
          buildParams({
            ids: parsed.ids,
            locationId: parsed.locationId,
            jobId: parsed.jobId,
            status: parsed.status,
            createdBefore: parsed.createdBefore,
            createdOnOrAfter: parsed.createdOnOrAfter,
            modifiedBefore: parsed.modifiedBefore,
            modifiedOnOrAfter: parsed.modifiedOnOrAfter,
            page: parsed.page,
            pageSize: parsed.pageSize,
            includeTotal: parsed.includeTotal,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "memberships_recurring_service_events_mark_complete",
    domain: "memberships",
    operation: "write",
    description: "Mark a recurring service event as complete",
    schema: recurringServiceEventIdSchema.shape,
    handler: async (params) => {
      const { id } = recurringServiceEventIdSchema.parse(params);

      try {
        const data = await client.post(
          `/tenant/{tenant}/recurring-service-events/${id}/mark-complete`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "memberships_recurring_service_events_mark_incomplete",
    domain: "memberships",
    operation: "write",
    description: "Mark a recurring service event as incomplete",
    schema: recurringServiceEventIdSchema.shape,
    handler: async (params) => {
      const { id } = recurringServiceEventIdSchema.parse(params);

      try {
        const data = await client.post(
          `/tenant/{tenant}/recurring-service-events/${id}/mark-incomplete`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "memberships_recurring_service_types_get",
    domain: "memberships",
    operation: "read",
    description: "Get a recurring service type by ID",
    schema: recurringServiceTypeIdSchema.shape,
    handler: async (params) => {
      const { id } = recurringServiceTypeIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/recurring-service-types/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "memberships_recurring_service_types_list",
    domain: "memberships",
    operation: "read",
    description: "List recurring service types",
    schema: recurringServiceTypesListSchema.shape,
    handler: async (params) => {
      const parsed = recurringServiceTypesListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/recurring-service-types",
          buildParams({
            ids: parsed.ids,
            membershipTypeId: parsed.membershipTypeId,
            recurrenceType: parsed.recurrenceType,
            durationType: parsed.durationType,
            active: parsed.active,
            createdBefore: parsed.createdBefore,
            createdOnOrAfter: parsed.createdOnOrAfter,
            modifiedBefore: parsed.modifiedBefore,
            modifiedOnOrAfter: parsed.modifiedOnOrAfter,
            page: parsed.page,
            pageSize: parsed.pageSize,
            includeTotal: parsed.includeTotal,
            sort: parsed.sort,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
