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


export function registerTaxZoneTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "accounting_tax_zones_list",
    domain: "accounting",
    operation: "read",
    description: "List one requested page of tax-zone definitions, filterable by IDs, active state, and created or modified timestamps. Use this catalog to resolve tax treatment identifiers; it does not return invoice transactions or calculated tax totals.",
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
        return toolError(error);
      }
    },
  });
}
