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

const paymentTypeGetSchema = z.object({
  id: z.number().int().describe("Payment type ID"),
});

const paymentTypesListSchema = paginationParams(
  dateFilterParams(
    z.object({
      ids: z.string().optional().describe("Comma-delimited payment type IDs (max 50)"),
      ...activeFilterParam(),
    }),
  ),
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerPaymentTypeTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "accounting_payment_types_get",
    domain: "accounting",
    operation: "read",
    description: "Get a payment type by ID",
    schema: paymentTypeGetSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof paymentTypeGetSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/payment-types/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_payment_types_list",
    domain: "accounting",
    operation: "read",
    description: "List payment types",
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
        return toolError(errorMessage(error));
      }
    },
  });
}
