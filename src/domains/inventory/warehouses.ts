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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const warehouseAddressSchema = z.object({
  street: z.string().optional().describe("Street address"),
  unit: z.string().optional().describe("Address unit/suite"),
  city: z.string().optional().describe("City"),
  state: z.string().optional().describe("State/province"),
  postalCode: z.string().optional().describe("Postal code"),
  country: z.string().optional().describe("Country"),
});

const externalDataEntrySchema = z.object({
  key: z.string().optional().describe("External data key"),
  value: z.string().optional().describe("External data value"),
});

const warehousePayloadSchema = z.object({
  name: z.string().optional().describe("Warehouse name"),
  code: z.string().optional().describe("Warehouse code"),
  description: z.string().optional().describe("Warehouse description"),
  active: z.boolean().optional().describe("Whether the warehouse is active"),
  businessUnitId: z.number().int().optional().describe("Business unit ID"),
  inventoryLocationId: z
    .number()
    .int()
    .optional()
    .describe("Primary inventory location ID"),
  managerEmployeeId: z.number().int().optional().describe("Manager employee ID"),
  phone: z.string().optional().describe("Warehouse phone number"),
  email: z.string().optional().describe("Warehouse email"),
  memo: z.string().optional().describe("Internal note"),
  address: warehouseAddressSchema.optional().describe("Warehouse address"),
  externalData: z
    .array(externalDataEntrySchema)
    .optional()
    .describe("External data entries"),
});

const warehouseUpdateSchema = warehousePayloadSchema.extend({
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
          buildParams(payload),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
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
        return toolError(getErrorMessage(error));
      }
    },
  });
}
