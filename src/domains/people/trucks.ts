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
const truckPayloadSchema = officialRequestSchema("Trucks_Update") as z.ZodObject<z.ZodRawShape>;

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
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "people_trucks_list",
    domain: "people",
    operation: "read",
    description: "List one requested page of inventory trucks, optionally filtered by IDs, active state, dates, or external-data mapping. externalDataKey and externalDataValues must be supplied together.",
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
        return toolError(error);
      }
    },
  });
}
