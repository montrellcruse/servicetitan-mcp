import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import {
  activeFilterParam,
  buildParams,
  paginationParams,
  toolError,
  toolResult,
} from "../../utils.js";

const paymentTypeGetSchema = z.object({
  id: z.number().int().describe("Payment type ID"),
});

const paymentTypesListSchema = paginationParams(
  z.object({
    ids: z.string().optional().describe("Comma-delimited payment type IDs (max 50)"),
    ...activeFilterParam(),
    createdBefore: z.string().datetime({ offset: true }).optional().describe("Return records created before this timestamp"),
    createdOnOrAfter: z.string().datetime({ offset: true }).optional().describe("Return records created on or after this timestamp"),
  }),
);


export function registerPaymentTypeTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "accounting_payment_types_get",
    domain: "accounting",
    operation: "read",
    description: "Retrieve a payment type by its ServiceTitan ID. Returns the single upstream record without pagination; use accounting_payment_types_list to search when the ID is unknown.",
    schema: paymentTypeGetSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof paymentTypeGetSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/payment-types/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "accounting_payment_types_list",
    domain: "accounting",
    operation: "read",
    description: "List one requested page of customer payment-type definitions, filterable by IDs, active state, and creation timestamps. Use this catalog to interpret or select payment methods; use accounting_payments_list for actual customer payment transactions.",
    schema: paymentTypesListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof paymentTypesListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/payment-types",
          buildParams({
            ids: input.ids,
            active: input.active,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
