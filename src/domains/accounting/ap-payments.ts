import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, dateFilterParams, paginationParams, sortParam, toolError, toolResult } from "../../utils.js";

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

const apPaymentsMarkAsExportedSchema = z.object({
  items: z
    .array(z.object({
      apPaymentId: z.number().int().describe("AP payment ID"),
      externalId: z.string().nullable().optional(),
      externalMessage: z.string().nullable().optional(),
    }))
    .min(1)
    .describe("AP payments to mark as exported (sent as the API's top-level array)"),
});

export function registerApPaymentTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "accounting_ap_payments_mark_as_exported",
    domain: "accounting",
    operation: "write",
    description: "Mark AP payments as exported",
    schema: apPaymentsMarkAsExportedSchema.shape,
    handler: async (params) => {
      const input = apPaymentsMarkAsExportedSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/ap-payments/markasexported", input.items);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
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
        return toolError(error);
      }
    },
  });
}
