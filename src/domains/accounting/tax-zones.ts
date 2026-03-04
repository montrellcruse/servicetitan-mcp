import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import {
  activeFilterParam,
  buildParams,
  dateFilterParams,
  paginationParams,
  sortParam,
  toolError,
  toolResult,
} from "../../utils.js";

const taxZonesListSchema = paginationParams(
  dateFilterParams(
    z.object({
      ids: z.string().optional().describe("Comma-delimited tax zone IDs"),
      ...activeFilterParam(),
      ...sortParam(["Id", "Name", "CreatedOn"]),
    }),
  ),
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerTaxZoneTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "accounting_tax_zones_list",
    domain: "accounting",
    operation: "read",
    description: "List tax zones",
    schema: taxZonesListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof taxZonesListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/tax-zones",
          buildParams({
            ids: input.ids,
            active: input.active,
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
        return toolError(errorMessage(error));
      }
    },
  });
}
