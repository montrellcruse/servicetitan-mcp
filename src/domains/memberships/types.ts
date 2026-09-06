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
const billingFrequencyEnum = z.enum([
  "OneTime",
  "Monthly",
  "EveryOtherMonth",
  "Quarterly",
  "BiAnnual",
  "Annual",
]);

const membershipTypeIdSchema = z.object({
  id: z.number().int().describe("Membership type ID"),
});

const membershipTypesListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ids: z
        .string()
        .optional()
        .describe("Comma-separated membership type IDs (maximum 50)"),
      duration: z
        .number()
        .int()
        .optional()
        .describe("Filter by membership duration in months"),
      billingFrequency: billingFrequencyEnum
        .optional()
        .describe("Filter by billing frequency"),
      includeDurationBilling: z
        .boolean()
        .optional()
        .describe("Include duration billing items in each result"),
    }).extend(activeFilterParam()),
  ),
);

const membershipTypeDurationBillingSchema = membershipTypeIdSchema.extend(
  activeFilterParam(),
);

export function registerMembershipTypeTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
) {
  registry.register({
    name: "memberships_types_get",
    domain: "memberships",
    operation: "read",
    description: "Retrieve a membership type by its ServiceTitan ID. Returns the single upstream record without pagination; use memberships_types_list to search when the ID is unknown.",
    schema: membershipTypeIdSchema.shape,
    handler: async (params) => {
      const { id } = membershipTypeIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/membership-types/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "memberships_types_list",
    domain: "memberships",
    operation: "read",
    description: "List one requested page of membership-type definitions using IDs, active state, billing frequency, duration, and created or modified timestamps; includeDurationBilling controls embedded billing details. Use memberships_types_get for one known plan and memberships_list for memberships sold to customers.",
    schema: membershipTypesListSchema.shape,
    handler: async (params) => {
      const parsed = membershipTypesListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/membership-types",
          buildParams({
            ids: parsed.ids,
            active: parsed.active,
            duration: parsed.duration,
            billingFrequency: parsed.billingFrequency,
            includeDurationBilling: parsed.includeDurationBilling,
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
    name: "memberships_types_recurring_service_items_list",
    domain: "memberships",
    operation: "read",
    description: "Retrieve the recurring-service items configured under one required membership-type ID. Use memberships_types_get for the parent plan; use memberships_recurring_services_list for recurring services scheduled for customer locations.",
    schema: membershipTypeIdSchema.shape,
    handler: async (params) => {
      const { id } = membershipTypeIdSchema.parse(params);

      try {
        const data = await client.get(
          `/tenant/{tenant}/membership-types/${id}/recurring-service-items`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "memberships_types_discounts_list",
    domain: "memberships",
    operation: "read",
    description: "Retrieve discounts configured for one known membership type ID. These are type-level benefits, not the tenant pricebook discount-and-fee catalog.",
    schema: membershipTypeIdSchema.shape,
    handler: async (params) => {
      const { id } = membershipTypeIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/membership-types/${id}/discounts`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "memberships_types_duration_billing_list",
    domain: "memberships",
    operation: "read",
    description: "Retrieve duration and billing configurations under one required membership-type ID. Use this for plan-level term and billing choices; use memberships_types_get for the parent plan and memberships_list for customer memberships.",
    schema: membershipTypeDurationBillingSchema.shape,
    handler: async (params) => {
      const parsed = membershipTypeDurationBillingSchema.parse(params);

      try {
        const data = await client.get(
          `/tenant/{tenant}/membership-types/${parsed.id}/duration-billing-items`,
          buildParams({ active: parsed.active }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
