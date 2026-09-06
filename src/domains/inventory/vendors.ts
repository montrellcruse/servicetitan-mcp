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
const vendorPayloadSchema = officialRequestSchema("Vendors_Create") as z.AnyZodObject;

const vendorIdSchema = z.object({
  id: z.number().int().describe("Vendor ID"),
});

const vendorGetSchema = vendorIdSchema.extend({
  externalDataApplicationGuid: z
    .string()
    .uuid()
    .optional()
    .describe("External data application GUID for lookup"),
  externalDataKey: z
    .string()
    .optional()
    .describe("External data key used with externalDataValues"),
  externalDataValues: z
    .string()
    .optional()
    .describe("External data values used with externalDataKey"),
});

const vendorUpdateSchema = (officialRequestSchema("Vendors_Update") as z.AnyZodObject).extend({
  id: z.number().int().describe("Vendor ID"),
});

const vendorsListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        ids: z
          .array(z.number().int().describe("Vendor ID to include"))
          .optional()
          .describe("Collection of vendor IDs to filter by"),
        externalDataApplicationGuid: z
          .string()
          .uuid()
          .optional()
          .describe("External data application GUID for lookup"),
        externalDataKey: z
          .string()
          .optional()
          .describe("External data key used with externalDataValues"),
        externalDataValues: z
          .string()
          .optional()
          .describe("External data values used with externalDataKey"),
      })
      .extend(activeFilterParam())
      .extend(sortParam(["Id", "ModifiedOn", "CreatedOn"])),
  ),
);

export function registerVendorTools(client: ServiceTitanClient, registry: ToolRegistry) {
  registry.register({
    name: "inventory_vendors_create",
    domain: "inventory",
    operation: "write",
    description: "Create a vendor",
    schema: vendorPayloadSchema.shape,
    handler: async (params) => {
      const parsed = vendorPayloadSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/vendors", parsed);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_vendors_get",
    domain: "inventory",
    operation: "read",
    description: "Retrieve a vendor by its ServiceTitan ID. Returns the single upstream record without pagination; use inventory_vendors_list to search when the ID is unknown.",
    schema: vendorGetSchema.shape,
    handler: async (params) => {
      const parsed = vendorGetSchema.parse(params);

      try {
        const data = await client.get(
          `/tenant/{tenant}/vendors/${parsed.id}`,
          buildParams({
            externalDataApplicationGuid: parsed.externalDataApplicationGuid,
            externalDataKey: parsed.externalDataKey,
            externalDataValues: parsed.externalDataValues,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_vendors_list",
    domain: "inventory",
    operation: "read",
    description: "List one requested page of inventory vendors using IDs, active state, created or modified timestamps, and external-data mapping filters. Use inventory_vendors_get for one known vendor; use inventory_purchase_orders_list for purchase-order records.",
    schema: vendorsListSchema.shape,
    handler: async (params) => {
      const parsed = vendorsListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/vendors",
          buildParams({
            ids: parsed.ids,
            active: parsed.active,
            externalDataApplicationGuid: parsed.externalDataApplicationGuid,
            externalDataKey: parsed.externalDataKey,
            externalDataValues: parsed.externalDataValues,
            createdBefore: parsed.createdBefore,
            createdOnOrAfter: parsed.createdOnOrAfter,
            modifiedBefore: parsed.modifiedBefore,
            modifiedOnOrAfter: parsed.modifiedOnOrAfter,
            page: parsed.page,
            pageSize: parsed.pageSize,
            includeTotal: parsed.includeTotal,
            sort: parsed.sort,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_vendors_update",
    domain: "inventory",
    operation: "write",
    description: "Update a vendor",
    schema: vendorUpdateSchema.shape,
    handler: async (params) => {
      const parsed = vendorUpdateSchema.parse(params);
      const { id, ...payload } = parsed;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/vendors/${id}`,
          payload,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
