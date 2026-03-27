import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, dateFilterParams, paginationParams, sortParam, toolError, toolResult } from "../../utils.js";
import { getErrorMessage } from "../intelligence/helpers.js";

const paymentTermGetSchema = z.object({
  paymentTermId: z.number().int().describe("Payment term ID"),
});

const paymentTermsListSchema = paginationParams(
  dateFilterParams(
    z.object({
      ids: z.string().optional().describe("Comma-delimited payment term IDs (max 50)"),
      ...sortParam(["Id", "Name", "CreatedOn"]),
    }),
  ),
);


export function registerPaymentTermTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "accounting_payment_terms_get",
    domain: "accounting",
    operation: "read",
    description: "Get a payment term by ID",
    schema: paymentTermGetSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof paymentTermGetSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/payment-terms/${input.paymentTermId}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_payment_terms_list",
    domain: "accounting",
    operation: "read",
    description: "List payment terms",
    schema: paymentTermsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof paymentTermsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/payment-terms",
          buildParams({
            ids: input.ids,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            sort: input.sort,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
