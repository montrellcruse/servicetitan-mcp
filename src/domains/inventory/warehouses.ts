import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { officialRequestSchema } from "../../contracts/index.js";
import {
  activeFilterParam,
  buildParams,
  dateFilterParams,
  paginationParams,
  sortParam,
  toolError,
  toolResult,
} from "../../utils.js";
const warehouseUpdateSchema = (officialRequestSchema("Warehouses_Update") as z.AnyZodObject).extend({
  id: z.number().int().describe("Warehouse ID"),
});

const warehousesListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        ids: z
          .string()
          .optional()
          .describe("Comma-separated warehouse IDs (maximum 50)"),
        externalDataApplicationGuid: z
          .string()
          .uuid()
          .optional()
          .describe("External data application GUID"),
        externalDataKey: z.string().optional().describe("External data key"),
        externalDataValues: z.string().optional().describe("External data values"),
      })
      .extend(activeFilterParam())
      .extend(sortParam(["Id", "ModifiedOn", "CreatedOn"])),
  ),
);

export function registerWarehouseTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "inventory_warehouses_update",
    domain: "inventory",
    operation: "write",
    description: "Update a warehouse",
    schema: warehouseUpdateSchema.shape,
    handler: async (params) => {
      const parsed = warehouseUpdateSchema.parse(params);
      const { id, ...payload } = parsed;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/warehouses/${id}`,
          payload,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_warehouses_list",
    domain: "inventory",
    operation: "read",
    description: "List warehouses",
    schema: warehousesListSchema.shape,
    handler: async (params) => {
      const input = warehousesListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/warehouses",
          buildParams({
            ids: input.ids,
            active: input.active,
            externalDataApplicationGuid: input.externalDataApplicationGuid,
            externalDataKey: input.externalDataKey,
            externalDataValues: input.externalDataValues,
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
        return toolError(error);
      }
    },
  });
}
