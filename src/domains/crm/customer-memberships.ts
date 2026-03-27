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
import { getErrorMessage } from "../intelligence/helpers.js";

const membershipStatusSchema = z.enum(["Active", "Suspended", "Expired", "Canceled", "Deleted"]);

const billingFrequencySchema = z.enum([
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

const membershipCreatePayloadSchema = z.object({
  customerId: z.number().int().optional().describe("Customer ID"),
  locationId: z.number().int().optional().describe("Location ID"),
  membershipTypeId: z.number().int().optional().describe("Membership type ID"),
  soldOn: z.string().optional().describe("Membership sold date/time"),
  soldById: z.number().int().optional().describe("User ID who sold membership"),
  campaignId: z.number().int().optional().describe("Campaign ID"),
  businessUnitId: z.number().int().optional().describe("Business unit ID"),
  duration: z.number().int().optional().describe("Membership duration in months"),
  billingFrequency: billingFrequencySchema.optional().describe("Billing frequency"),
  active: z.boolean().optional().describe("Active flag"),
  autoRenew: z.boolean().optional().describe("Auto-renew flag"),
  memo: z.string().optional().describe("Internal memo"),
  customFields: z
    .array(membershipCustomFieldSchema)
    .optional()
    .describe("Membership custom field values"),
});

const membershipUpdatePayloadSchema = membershipCreatePayloadSchema.extend({
  status: membershipStatusSchema.optional().describe("Membership status"),
});

const membershipIdSchema = z.object({
  id: z.number().int().describe("Customer membership ID"),
});

const membershipsListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        ids: z.string().optional().describe("Comma-delimited membership IDs (max 50)"),
        customerIds: z.string().optional().describe("Comma-delimited customer IDs"),
        status: membershipStatusSchema.optional().describe("Membership status"),
        duration: z
          .number()
          .int()
          .optional()
          .describe("Membership duration in months (null for ongoing memberships)"),
        billingFrequency: billingFrequencySchema.optional().describe("Billing frequency"),
      })
      .extend(activeFilterParam()),
  ),
);

const membershipUpdateSchema = z.object({
  id: z.number().int().describe("Customer membership ID"),
  payload: membershipUpdatePayloadSchema.optional().describe("Membership update payload"),
});

const membershipCreateSchema = z.object({
  payload: membershipCreatePayloadSchema.optional().describe("Membership create payload"),
});

const membershipCustomFieldsListSchema = dateFilterParams(
  paginationParams(
    z.object({
      sort: z.string().optional().describe("Sort expression"),
    }),
  ),
);


export function registerCustomerMembershipTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "crm_customer_memberships_list",
    domain: "crm",
    operation: "read",
    description: "List customer memberships",
    schema: membershipsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof membershipsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/memberships",
          buildParams({
            ids: input.ids,
            customerIds: input.customerIds,
            status: input.status,
            duration: input.duration,
            billingFrequency: input.billingFrequency,
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customer_memberships_custom_fields_list",
    domain: "crm",
    operation: "read",
    description: "List customer membership custom fields",
    schema: membershipCustomFieldsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof membershipCustomFieldsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/memberships/custom-fields",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
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
    name: "crm_customer_memberships_get",
    domain: "crm",
    operation: "read",
    description: "Get a customer membership by ID",
    schema: membershipIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof membershipIdSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/memberships/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customer_memberships_update",
    domain: "crm",
    operation: "write",
    description: "Patch a customer membership",
    schema: membershipUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof membershipUpdateSchema>;

      try {
        const data = await client.patch(`/tenant/{tenant}/memberships/${input.id}`, input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customer_memberships_create",
    domain: "crm",
    operation: "write",
    description: "Create a customer membership",
    schema: membershipCreateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof membershipCreateSchema>;

      try {
        const data = await client.post("/tenant/{tenant}/memberships/sale", input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customer_memberships_status_changes_list",
    domain: "crm",
    operation: "read",
    description: "List status changes for a customer membership",
    schema: membershipIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof membershipIdSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/memberships/${input.id}/status-changes`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
