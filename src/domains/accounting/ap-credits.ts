import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, dateFilterParams, paginationParams, sortParam, toolError, toolResult } from "../../utils.js";

const apCreditsListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ids: z
        .string()
        .optional()
        .describe("Comma-delimited AP credit IDs (max 50)"),
      ...sortParam(["Id", "CreatedOn", "ModifiedOn"]),
    }),
  ),
);

const apCreditsMarkAsExportedSchema = z.object({
  items: z
    .array(z.object({ apCreditId: z.number().int().describe("AP credit ID") }))
    .min(1)
    .describe("AP credits to mark as exported (sent as the API's top-level array)"),
});

export function registerApCreditTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "accounting_ap_credits_mark_as_exported",
    domain: "accounting",
    operation: "write",
    description: "Mark AP credits as exported",
    schema: apCreditsMarkAsExportedSchema.shape,
    handler: async (params) => {
      const input = apCreditsMarkAsExportedSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/ap-credits/markasexported", input.items);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "accounting_ap_credits_list",
    domain: "accounting",
    operation: "read",
    description: "List one requested page of vendor AP credits, filterable by credit IDs and created or modified timestamps. Use this for credits on vendor accounts; use accounting_ap_payments_list for AP disbursements and accounting_payments_list for customer receipts.",
    schema: apCreditsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof apCreditsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/ap-credits",
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
