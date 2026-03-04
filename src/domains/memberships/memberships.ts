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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const membershipStatusEnum = z.enum([
  "Active",
  "Suspended",
  "Expired",
  "Canceled",
  "Deleted",
]);

const billingFrequencyEnum = z.enum([
  "OneTime",
  "Monthly",
  "EveryOtherMonth",
  "Quarterly",
  "BiAnnual",
  "Annual",
]);

const membershipCustomFieldSchema = z.object({
  typeId: z.number().int().optional().describe("Custom field type ID"),
  value: z.string().optional().describe("Custom field value"),
});

const membershipPayloadSchema = z.object({
  customerId: z.number().int().optional().describe("Customer ID for membership sale"),
  locationId: z.number().int().optional().describe("Location ID for membership sale"),
  membershipTypeId: z
    .number()
    .int()
    .optional()
    .describe("Membership type ID to sell"),
  soldOn: z.string().optional().describe("Date/time when the membership was sold"),
  soldById: z.number().int().optional().describe("User ID who sold the membership"),
  campaignId: z.number().int().optional().describe("Campaign ID attributed to the sale"),
  businessUnitId: z
    .number()
    .int()
    .optional()
    .describe("Business unit ID associated with the membership"),
  duration: z
    .number()
    .int()
    .optional()
    .describe("Membership duration in months for fixed-term memberships"),
  billingFrequency: billingFrequencyEnum
    .optional()
    .describe("Billing frequency for recurring membership billing"),
  active: z.boolean().optional().describe("Whether the membership is active"),
  autoRenew: z.boolean().optional().describe("Whether the membership auto-renews"),
  memo: z.string().optional().describe("Internal memo for the membership"),
  customFields: z
    .array(membershipCustomFieldSchema)
    .optional()
    .describe("Custom field values for the membership"),
});

const membershipsListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ids: z.string().optional().describe("Comma-separated membership IDs (maximum 50)"),
      customerIds: z.string().optional().describe("Comma-separated customer IDs"),
      status: membershipStatusEnum
        .optional()
        .describe("Filter by membership status"),
      duration: z
        .number()
        .int()
        .optional()
        .describe("Filter by membership duration in months"),
      billingFrequency: billingFrequencyEnum
        .optional()
        .describe("Filter by membership billing frequency"),
    }).extend(activeFilterParam()),
  ),
);

const membershipIdSchema = z.object({
  id: z.number().int().describe("Customer membership ID"),
});

const membershipUpdateSchema = membershipPayloadSchema.extend({
  id: z.number().int().describe("Customer membership ID"),
  status: membershipStatusEnum
    .optional()
    .describe("Updated membership status value"),
});

const membershipCustomFieldsListSchema = dateFilterParams(
  paginationParams(
    z.object({}).extend(sortParam(["Id", "Name", "CreatedOn", "ModifiedOn"])),
  ),
);

export function registerMembershipTools(client: ServiceTitanClient, registry: ToolRegistry) {
  registry.register({
    name: "memberships_list",
    domain: "memberships",
    operation: "read",
    description: "List customer memberships",
    schema: membershipsListSchema.shape,
    handler: async (params) => {
      const parsed = membershipsListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/memberships",
          buildParams({
            ids: parsed.ids,
            customerIds: parsed.customerIds,
            status: parsed.status,
            duration: parsed.duration,
            billingFrequency: parsed.billingFrequency,
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
    name: "memberships_custom_fields_list",
    domain: "memberships",
    operation: "read",
    description: "List membership custom field definitions",
    schema: membershipCustomFieldsListSchema.shape,
    handler: async (params) => {
      const parsed = membershipCustomFieldsListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/memberships/custom-fields",
          buildParams({
            page: parsed.page,
            pageSize: parsed.pageSize,
            includeTotal: parsed.includeTotal,
            createdBefore: parsed.createdBefore,
            createdOnOrAfter: parsed.createdOnOrAfter,
            modifiedBefore: parsed.modifiedBefore,
            modifiedOnOrAfter: parsed.modifiedOnOrAfter,
            sort: parsed.sort,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "memberships_get",
    domain: "memberships",
    operation: "read",
    description: "Get a single customer membership by ID",
    schema: membershipIdSchema.shape,
    handler: async (params) => {
      const { id } = membershipIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/memberships/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "memberships_create",
    domain: "memberships",
    operation: "write",
    description: "Create a customer membership sale",
    schema: membershipPayloadSchema.shape,
    handler: async (params) => {
      const parsed = membershipPayloadSchema.parse(params);

      try {
        const data = await client.post(
          "/tenant/{tenant}/memberships/sale",
          buildParams(parsed),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "memberships_update",
    domain: "memberships",
    operation: "write",
    description: "Update a customer membership",
    schema: membershipUpdateSchema.shape,
    handler: async (params) => {
      const parsed = membershipUpdateSchema.parse(params);
      const { id, ...payload } = parsed;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/memberships/${id}`,
          buildParams(payload),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "memberships_status_changes_list",
    domain: "memberships",
    operation: "read",
    description: "List status changes for a customer membership",
    schema: membershipIdSchema.shape,
    handler: async (params) => {
      const { id } = membershipIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/memberships/${id}/status-changes`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
