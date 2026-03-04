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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
    description: "Get a membership type by ID",
    schema: membershipTypeIdSchema.shape,
    handler: async (params) => {
      const { id } = membershipTypeIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/membership-types/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "memberships_types_list",
    domain: "memberships",
    operation: "read",
    description: "List membership types",
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "memberships_types_recurring_service_items_list",
    domain: "memberships",
    operation: "read",
    description: "List recurring service items for a membership type",
    schema: membershipTypeIdSchema.shape,
    handler: async (params) => {
      const { id } = membershipTypeIdSchema.parse(params);

      try {
        const data = await client.get(
          `/tenant/{tenant}/membership-types/${id}/recurring-service-items`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "memberships_types_discounts_list",
    domain: "memberships",
    operation: "read",
    description: "List discounts for a membership type",
    schema: membershipTypeIdSchema.shape,
    handler: async (params) => {
      const { id } = membershipTypeIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/membership-types/${id}/discounts`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "memberships_types_duration_billing_list",
    domain: "memberships",
    operation: "read",
    description: "List duration billing items for a membership type",
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
        return toolError(getErrorMessage(error));
      }
    },
  });
}
