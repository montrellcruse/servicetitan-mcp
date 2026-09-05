import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { officialRequestSchema } from "../../contracts/index.js";
import {
  activeFilterParam,
  buildParams,
  dateFilterParams,
  paginationParams,
  sortParam,
  toolError,
  toolResult,
} from "../../utils.js";
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

const membershipPayloadSchema = officialRequestSchema("CustomerMemberships_Create") as z.ZodObject<z.ZodRawShape>;

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

const membershipUpdateSchema = (officialRequestSchema("CustomerMemberships_Update") as z.ZodObject<z.ZodRawShape>).extend({ id: z.number().int() });

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
        return toolError(error);
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
        return toolError(error);
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
        return toolError(error);
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
        return toolError(error);
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
        return toolError(error);
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
        return toolError(error);
      }
    },
  });
}
