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

const externalDataEntrySchema = z.object({
  key: z.string().optional().describe("External data key"),
  value: z.string().optional().describe("External data value"),
});

const truckPayloadSchema = z.object({
  name: z.string().optional().describe("Truck display name"),
  number: z.string().optional().describe("Truck number/code"),
  description: z.string().optional().describe("Truck description"),
  active: z.boolean().optional().describe("Whether the truck is active"),
  businessUnitId: z.number().int().optional().describe("Business unit ID"),
  employeeId: z.number().int().optional().describe("Assigned employee ID"),
  technicianId: z.number().int().optional().describe("Assigned technician ID"),
  inventoryLocationId: z
    .number()
    .int()
    .optional()
    .describe("Inventory location ID"),
  warehouseId: z.number().int().optional().describe("Warehouse ID"),
  licensePlate: z.string().optional().describe("License plate"),
  vin: z.string().optional().describe("Vehicle identification number"),
  make: z.string().optional().describe("Vehicle make"),
  model: z.string().optional().describe("Vehicle model"),
  year: z.number().int().optional().describe("Vehicle model year"),
  color: z.string().optional().describe("Vehicle color"),
  memo: z.string().optional().describe("Internal note"),
  externalData: z
    .array(externalDataEntrySchema)
    .optional()
    .describe("External data entries"),
});

const truckUpdateSchema = truckPayloadSchema.extend({
  id: z.number().int().describe("Truck ID"),
});

const trucksListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        ids: z
          .string()
          .optional()
          .describe("Comma-separated truck IDs (maximum 50)"),
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

export function registerPeopleTruckTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "people_trucks_update",
    domain: "people",
    operation: "write",
    description: "Update a truck",
    schema: truckUpdateSchema.shape,
    handler: async (params) => {
      const parsed = truckUpdateSchema.parse(params);
      const { id, ...payload } = parsed;

      try {
        const data = await client.patch(`/tenant/{tenant}/trucks/${id}`, buildParams(payload));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_trucks_list",
    domain: "people",
    operation: "read",
    description: "List trucks",
    schema: trucksListSchema.shape,
    handler: async (params) => {
      const input = trucksListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/trucks",
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
