import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, dateFilterParams, paginationParams, sortParam, toolError, toolResult } from "../../utils.js";
import { getErrorMessage } from "../intelligence/helpers.js";

const apPaymentsListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ids: z
        .string()
        .optional()
        .describe("Comma-delimited AP payment IDs (max 50)"),
      ...sortParam(["Id", "CreatedOn", "ModifiedOn"]),
    }),
  ),
);


export function registerApPaymentTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "accounting_ap_payments_mark_as_exported",
    domain: "accounting",
    operation: "write",
    description: "Mark AP payments as exported",
    schema: {},
    handler: async () => {
      try {
        const data = await client.post("/tenant/{tenant}/ap-payments/markasexported");
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_ap_payments_list",
    domain: "accounting",
    operation: "read",
    description: "List AP payments",
    schema: apPaymentsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof apPaymentsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/ap-payments",
          buildParams({
            ids: input.ids,
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
}
