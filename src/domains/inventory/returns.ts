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
  getErrorMessage,
} from "../../utils.js";
const scalarCustomFieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const customFieldMapSchema = z
  .object({})
  .catchall(scalarCustomFieldValueSchema)
  .describe("Custom field key/value map");

const returnLineItemSchema = z.object({
  skuId: z.number().int().optional().describe("SKU ID for this return item"),
  skuCode: z.string().optional().describe("SKU code for this return item"),
  description: z.string().optional().describe("Return item description"),
  quantity: z.number().optional().describe("Return quantity"),
  unitCost: z.number().optional().describe("Unit cost"),
  inventoryLocationId: z
    .number()
    .int()
    .optional()
    .describe("Inventory location ID"),
  purchaseOrderItemId: z
    .number()
    .int()
    .optional()
    .describe("Purchase order item ID"),
  taxCodeId: z.number().int().optional().describe("Tax code ID"),
});

const returnExternalLinkSchema = z.object({
  name: z.string().optional().describe("External link label"),
  url: z.string().optional().describe("External link URL"),
});

const returnPayloadSchema = z.object({
  number: z.string().optional().describe("Return number"),
  referenceNumber: z.string().optional().describe("Reference number"),
  returnDate: z.string().optional().describe("Return date/time"),
  vendorId: z.number().int().optional().describe("Vendor ID"),
  jobId: z.number().int().optional().describe("Job ID"),
  purchaseOrderId: z.number().int().optional().describe("Purchase order ID"),
  batchId: z.number().int().optional().describe("Batch ID"),
  businessUnitId: z.number().int().optional().describe("Business unit ID"),
  inventoryLocationId: z
    .number()
    .int()
    .optional()
    .describe("Inventory location ID"),
  returnTypeId: z.number().int().optional().describe("Return type ID"),
  status: z.string().optional().describe("Return status"),
  syncStatus: z.string().optional().describe("Sync status"),
  active: z.boolean().optional().describe("Whether return is active"),
  summary: z.string().optional().describe("Return summary"),
  memo: z.string().optional().describe("Return memo"),
  items: z.array(returnLineItemSchema).optional().describe("Return line items"),
  externalLinks: z
    .array(returnExternalLinkSchema)
    .optional()
    .describe("External links for this return"),
  customFields: customFieldMapSchema.optional().describe("Return custom fields"),
});

const returnIdSchema = z.object({
  id: z.number().int().describe("Return ID"),
});

const returnUpdateSchema = returnPayloadSchema.extend({
  id: z.number().int().describe("Return ID"),
});

const returnsListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        ids: z
          .string()
          .optional()
          .describe("Comma-separated return IDs (maximum 50)"),
        number: z.string().optional().describe("Return number filter"),
        referenceNumber: z.string().optional().describe("Reference number filter"),
        jobId: z.number().int().optional().describe("Job ID filter"),
        purchaseOrderId: z.number().int().optional().describe("Purchase order ID filter"),
        batchId: z.number().int().optional().describe("Batch ID filter"),
        vendorIds: z.string().optional().describe("Comma-separated vendor IDs"),
        businessUnitIds: z
          .string()
          .optional()
          .describe("Comma-separated business unit IDs"),
        inventoryLocationIds: z
          .string()
          .optional()
          .describe("Comma-separated inventory location IDs"),
        syncStatuses: z.string().optional().describe("Comma-separated sync statuses"),
        customFieldsFields: z
          .record(z.string())
          .optional()
          .describe("Custom field name/value filters"),
        customFieldsOperator: z
          .enum(["And", "Or"])
          .optional()
          .describe("Operator for custom field filters"),
        returnDateOnOrAfter: z
          .string()
          .datetime()
          .optional()
          .describe("Return date on or after this UTC timestamp"),
        returnDateBefore: z
          .string()
          .datetime()
          .optional()
          .describe("Return date before this UTC timestamp"),
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

const updateCustomFieldsSchema = z.object({
  customFields: customFieldMapSchema.describe("Custom fields payload"),
});

const returnTypePayloadSchema = z.object({
  name: z.string().optional().describe("Return type name"),
  active: z.boolean().optional().describe("Whether the return type is active"),
  color: z.string().optional().describe("Color code for display"),
  memo: z.string().optional().describe("Internal note"),
});

const returnTypeUpdateSchema = returnTypePayloadSchema.extend({
  id: z.number().int().describe("Return type ID"),
});

const returnTypesListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        activeOnly: z
          .boolean()
          .optional()
          .describe("When true, return only active return types"),
        name: z.string().optional().describe("Return type name filter"),
      })
      .extend(sortParam(["Id", "ModifiedOn", "CreatedOn"])),
  ),
);

export function registerReturnTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "inventory_returns_create",
    domain: "inventory",
    operation: "write",
    description: "Create a return",
    schema: returnPayloadSchema.shape,
    handler: async (params) => {
      const input = returnPayloadSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/returns", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_returns_update_custom_fields",
    domain: "inventory",
    operation: "write",
    description: "Update return custom fields",
    schema: updateCustomFieldsSchema.shape,
    handler: async (params) => {
      const input = updateCustomFieldsSchema.parse(params);

      try {
        const data = await client.patch(
          "/tenant/{tenant}/returns/custom-fields",
          input.customFields,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_returns_update",
    domain: "inventory",
    operation: "write",
    description: "Update a return",
    schema: returnUpdateSchema.shape,
    handler: async (params) => {
      const parsed = returnUpdateSchema.parse(params);
      const { id, ...payload } = parsed;

      try {
        const data = await client.patch(`/tenant/{tenant}/returns/${id}`, buildParams(payload));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_returns_cancel",
    domain: "inventory",
    operation: "write",
    description: "Cancel a return",
    schema: returnIdSchema.shape,
    handler: async (params) => {
      const { id } = returnIdSchema.parse(params);

      try {
        const data = await client.patch(`/tenant/{tenant}/returns/${id}/cancellation`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_returns_list",
    domain: "inventory",
    operation: "read",
    description: "List returns",
    schema: returnsListSchema.shape,
    handler: async (params) => {
      const input = returnsListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/returns",
          buildParams({
            ids: input.ids,
            active: input.active,
            number: input.number,
            referenceNumber: input.referenceNumber,
            jobId: input.jobId,
            purchaseOrderId: input.purchaseOrderId,
            batchId: input.batchId,
            vendorIds: input.vendorIds,
            businessUnitIds: input.businessUnitIds,
            inventoryLocationIds: input.inventoryLocationIds,
            syncStatuses: input.syncStatuses,
            "customFields.Fields": input.customFieldsFields,
            "customFields.Operator": input.customFieldsOperator,
            returnDateOnOrAfter: input.returnDateOnOrAfter,
            returnDateBefore: input.returnDateBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            createdBefore: input.createdBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            externalDataApplicationGuid: input.externalDataApplicationGuid,
            externalDataKey: input.externalDataKey,
            externalDataValues: input.externalDataValues,
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

  registry.register({
    name: "inventory_return_types_create",
    domain: "inventory",
    operation: "write",
    description: "Create a return type",
    schema: returnTypePayloadSchema.shape,
    handler: async (params) => {
      const input = returnTypePayloadSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/return-types", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_return_types_update",
    domain: "inventory",
    operation: "write",
    description: "Update a return type",
    schema: returnTypeUpdateSchema.shape,
    handler: async (params) => {
      const parsed = returnTypeUpdateSchema.parse(params);
      const { id, ...payload } = parsed;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/return-types/${id}`,
          buildParams(payload),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_return_types_list",
    domain: "inventory",
    operation: "read",
    description: "List return types",
    schema: returnTypesListSchema.shape,
    handler: async (params) => {
      const input = returnTypesListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/return-types",
          buildParams({
            activeOnly: input.activeOnly,
            name: input.name,
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
