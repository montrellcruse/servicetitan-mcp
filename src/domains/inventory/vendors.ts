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

const vendorAddressSchema = z.object({
  street: z.string().optional().describe("Street address line"),
  unit: z.string().optional().describe("Address unit or suite"),
  city: z.string().optional().describe("Address city"),
  state: z.string().optional().describe("Address state or province"),
  postalCode: z.string().optional().describe("Address postal code"),
  country: z.string().optional().describe("Address country"),
});

const vendorPayloadSchema = z.object({
  name: z.string().optional().describe("Vendor name"),
  code: z.string().optional().describe("Vendor internal code"),
  contactName: z.string().optional().describe("Primary vendor contact name"),
  phone: z.string().optional().describe("Vendor phone number"),
  email: z.string().optional().describe("Vendor email address"),
  website: z.string().optional().describe("Vendor website URL"),
  accountNumber: z.string().optional().describe("Vendor account number"),
  taxId: z.string().optional().describe("Vendor tax ID"),
  memo: z.string().optional().describe("Internal vendor memo"),
  active: z.boolean().optional().describe("Whether the vendor is active"),
  address: vendorAddressSchema.optional().describe("Vendor mailing address"),
  remitToAddress: vendorAddressSchema
    .optional()
    .describe("Vendor remit-to address"),
  businessUnitIds: z
    .array(z.number().int().describe("Business unit ID associated with this vendor"))
    .optional()
    .describe("Business units associated with this vendor"),
});

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

const vendorUpdateSchema = vendorPayloadSchema.extend({
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
        const data = await client.post("/tenant/{tenant}/vendors", buildParams(parsed));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_vendors_get",
    domain: "inventory",
    operation: "read",
    description: "Get a vendor by ID",
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_vendors_list",
    domain: "inventory",
    operation: "read",
    description: "List vendors",
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
        return toolError(getErrorMessage(error));
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
          buildParams(payload),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
