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
const receiptPayloadSchema = officialRequestSchema("Receipts_CreateReceipt") as z.AnyZodObject;

const receiptIdSchema = z.object({
  id: z.number().int().describe("Receipt ID"),
});

const receiptCancelSchema = (officialRequestSchema("Receipts_CancelReceipts") as z.AnyZodObject).extend({ id: z.number().int().describe("Receipt ID") });

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

const updateCustomFieldsSchema = officialRequestSchema("Receipts_UpdateCustomFields") as z.AnyZodObject;

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
        const data = await client.post("/tenant/{tenant}/receipts", input);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_receipts_cancel",
    domain: "inventory",
    operation: "write",
    description: "Cancel a receipt",
    schema: receiptCancelSchema.shape,
    handler: async (params) => {
      const { id, ...payload } = receiptCancelSchema.parse(params);

      try {
        const data = await client.patch(`/tenant/{tenant}/receipts/${id}/cancellation`, payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
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
        return toolError(error);
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
          input,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
