import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, dateFilterParams, paginationParams, sortParam, toolError, toolResult } from "../../utils.js";
import { getErrorMessage } from "../intelligence/helpers.js";

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


export function registerApCreditTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "accounting_ap_credits_mark_as_exported",
    domain: "accounting",
    operation: "write",
    description: "Mark AP credits as exported",
    schema: {},
    handler: async () => {
      try {
        const data = await client.post("/tenant/{tenant}/ap-credits/markasexported");
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_ap_credits_list",
    domain: "accounting",
    operation: "read",
    description: "List AP credits",
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
        return toolError(getErrorMessage(error));
      }
    },
  });
}
