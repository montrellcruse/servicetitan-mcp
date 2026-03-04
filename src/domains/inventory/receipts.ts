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

const receiptLineItemSchema = z.object({
  skuId: z.number().int().optional().describe("SKU ID"),
  skuCode: z.string().optional().describe("SKU code"),
  description: z.string().optional().describe("Line item description"),
  quantity: z.number().optional().describe("Receipt quantity"),
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

const receiptExternalLinkSchema = z.object({
  name: z.string().optional().describe("External link label"),
  url: z.string().optional().describe("External link URL"),
});

const receiptPayloadSchema = z.object({
  number: z.string().optional().describe("Receipt number"),
  vendorInvoiceNumber: z.string().optional().describe("Vendor invoice number"),
  receivedOn: z.string().optional().describe("Receipt received date/time"),
  vendorId: z.number().int().optional().describe("Vendor ID"),
  billId: z.number().int().optional().describe("Bill ID"),
  batchId: z.number().int().optional().describe("Batch ID"),
  businessUnitId: z.number().int().optional().describe("Business unit ID"),
  inventoryLocationId: z
    .number()
    .int()
    .optional()
    .describe("Inventory location ID"),
  purchaseOrderId: z.number().int().optional().describe("Purchase order ID"),
  syncStatus: z.string().optional().describe("Sync status"),
  active: z.boolean().optional().describe("Whether receipt is active"),
  summary: z.string().optional().describe("Receipt summary"),
  memo: z.string().optional().describe("Receipt memo"),
  items: z.array(receiptLineItemSchema).optional().describe("Receipt line items"),
  externalLinks: z
    .array(receiptExternalLinkSchema)
    .optional()
    .describe("External links for this receipt"),
  customFields: customFieldMapSchema.optional().describe("Receipt custom fields"),
});

const receiptIdSchema = z.object({
  id: z.number().int().describe("Receipt ID"),
});

const receiptsListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        ids: z
          .string()
          .optional()
          .describe("Comma-separated receipt IDs (maximum 50)"),
        number: z.string().optional().describe("Receipt number filter"),
        vendorInvoiceNumber: z
          .string()
          .optional()
          .describe("Vendor invoice number filter"),
        billId: z.number().int().optional().describe("Bill ID filter"),
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
        purchaseOrderIds: z
          .string()
          .optional()
          .describe("Comma-separated purchase order IDs"),
        syncStatuses: z.string().optional().describe("Comma-separated sync statuses"),
        customFieldsFields: z
          .record(z.string())
          .optional()
          .describe("Custom field name/value filters"),
        customFieldsOperator: z
          .enum(["And", "Or"])
          .optional()
          .describe("Operator for custom field filters"),
        receivedOnOrAfter: z
          .string()
          .datetime()
          .optional()
          .describe("Received-on timestamp lower bound"),
        receivedBefore: z
          .string()
          .datetime()
          .optional()
          .describe("Received-on timestamp upper bound"),
      })
      .extend(activeFilterParam())
      .extend(sortParam(["Id", "ModifiedOn", "CreatedOn"])),
  ),
);

const updateCustomFieldsSchema = z.object({
  customFields: customFieldMapSchema.describe("Custom fields payload"),
});

export function registerReceiptTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "inventory_receipts_create",
    domain: "inventory",
    operation: "write",
    description: "Create a receipt",
    schema: receiptPayloadSchema.shape,
    handler: async (params) => {
      const input = receiptPayloadSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/receipts", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_receipts_cancel",
    domain: "inventory",
    operation: "write",
    description: "Cancel a receipt",
    schema: receiptIdSchema.shape,
    handler: async (params) => {
      const { id } = receiptIdSchema.parse(params);

      try {
        const data = await client.patch(`/tenant/{tenant}/receipts/${id}/cancellation`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_receipts_list",
    domain: "inventory",
    operation: "read",
    description: "List receipts",
    schema: receiptsListSchema.shape,
    handler: async (params) => {
      const input = receiptsListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/receipts",
          buildParams({
            ids: input.ids,
            active: input.active,
            number: input.number,
            vendorInvoiceNumber: input.vendorInvoiceNumber,
            billId: input.billId,
            batchId: input.batchId,
            vendorIds: input.vendorIds,
            businessUnitIds: input.businessUnitIds,
            inventoryLocationIds: input.inventoryLocationIds,
            purchaseOrderIds: input.purchaseOrderIds,
            syncStatuses: input.syncStatuses,
            "customFields.Fields": input.customFieldsFields,
            "customFields.Operator": input.customFieldsOperator,
            receivedOnOrAfter: input.receivedOnOrAfter,
            receivedBefore: input.receivedBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            createdBefore: input.createdBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            modifiedBefore: input.modifiedBefore,
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
    name: "inventory_receipts_update_custom_fields",
    domain: "inventory",
    operation: "write",
    description: "Update receipt custom fields",
    schema: updateCustomFieldsSchema.shape,
    handler: async (params) => {
      const input = updateCustomFieldsSchema.parse(params);

      try {
        const data = await client.patch(
          "/tenant/{tenant}/receipts/custom-fields",
          input.customFields,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
