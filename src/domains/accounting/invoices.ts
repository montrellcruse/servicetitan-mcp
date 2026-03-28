import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, dateFilterParams, paginationParams, sortParam, toolError, toolResult } from "../../utils.js";
import { getErrorMessage } from "../intelligence/helpers.js";

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

const invoiceUpdatePayloadSchema = z.object({
  status: z.string().optional().describe("Invoice status"),
  number: z.string().optional().describe("Invoice reference number"),
  customerId: z.number().int().optional().describe("Customer ID"),
  jobId: z.number().int().optional().describe("Job ID"),
  businessUnitId: z.number().int().optional().describe("Business unit ID"),
  invoicedOn: z.string().optional().describe("Invoice date-time"),
  dueDate: z.string().optional().describe("Invoice due date-time"),
  total: z.number().optional().describe("Invoice total"),
  balance: z.number().optional().describe("Invoice balance"),
  memo: z.string().optional().describe("Invoice memo"),
  exportId: z.string().optional().describe("External export ID"),
  customFields: z
    .array(
      z.object({
        typeId: z.number().int().optional().describe("Custom field type ID"),
        name: z.string().optional().describe("Custom field name"),
        value: z.string().optional().describe("Custom field value"),
      }),
    )
    .optional()
    .describe("Invoice custom fields"),
});

const invoiceItemPatchSchema = z.object({
  id: z.number().int().optional().describe("Invoice item ID"),
  skuId: z.number().int().optional().describe("SKU ID"),
  quantity: z.number().optional().describe("Item quantity"),
  unitPrice: z.number().optional().describe("Item unit price"),
  total: z.number().optional().describe("Item total amount"),
  description: z.string().optional().describe("Item description"),
  tax: z.number().optional().describe("Tax amount"),
});

const invoicesListSchema = paginationParams(
  dateFilterParams(
    z.object({
      ids: z.string().optional().describe("Comma-delimited invoice IDs"),
      statuses: z.array(z.string()).optional().describe("Invoice statuses"),
      batchId: z.number().int().optional().describe("Batch ID"),
      batchNumber: z.number().int().optional().describe("Batch number"),
      customFieldFields: z
        .record(z.string())
        .optional()
        .describe("Custom field name/value filters"),
      customFieldOperator: z
        .enum(["And", "Or"])
        .optional()
        .describe("Operator for custom field filters"),
      jobId: z.number().int().optional().describe("Job ID"),
      jobNumber: z.string().optional().describe("Job number"),
      businessUnitId: z.number().int().optional().describe("Business unit ID"),
      customerId: z.number().int().optional().describe("Customer ID"),
      invoicedOnOrAfter: z
        .string()
        .optional()
        .describe("Invoiced on or after RFC3339 date-time"),
      invoicedOnBefore: z
        .string()
        .optional()
        .describe("Invoiced on or before RFC3339 date-time"),
      adjustmentToId: z.number().int().optional().describe("Adjusted invoice ID"),
      number: z.string().optional().describe("Invoice number"),
      totalGreater: z.number().optional().describe("Minimum invoice total"),
      totalLess: z.number().optional().describe("Maximum invoice total"),
      balanceFilterBalance: z.number().optional().describe("Balance filter value"),
      balanceFilterComparer: z
        .enum(["Equals", "NotEquals", "Greater", "Less"])
        .optional()
        .describe("Balance comparison operator"),
      dueDateBefore: z
        .string()
        .optional()
        .describe("Due date before RFC3339 date-time"),
      dueDateOnOrAfter: z
        .string()
        .optional()
        .describe("Due date on or after RFC3339 date-time"),
      orderBy: z.string().optional().describe("Order by field"),
      orderByDirection: z
        .string()
        .optional()
        .describe("Order direction: asc|desc"),
      reviewStatuses: z.array(z.string()).optional().describe("Review statuses"),
      assignedToIds: z
        .array(z.number().int())
        .optional()
        .describe("Assignee user IDs"),
      ...sortParam([
        "Id",
        "ModifiedOn",
        "CreatedOn",
        "Number",
        "InvoicedOn",
        "DueDate",
        "Total",
        "Balance",
      ]),
    }),
  ),
);

const invoiceUpdateSchema = z.object({
  id: z.number().int().describe("Invoice ID"),
  payload: invoiceUpdatePayloadSchema
    .optional()
    .describe("Invoice fields to patch"),
});

const invoiceCustomFieldsUpdateSchema = z.object({
  customFields: customFieldMapSchema.describe("Invoice custom fields payload"),
});

const invoiceIdItemIdSchema = z.object({
  invoiceId: z.number().int().describe("Invoice ID"),
  itemId: z.number().int().describe("Invoice item ID"),
});

const invoiceItemsUpdateSchema = z.object({
  invoiceId: z.number().int().describe("Invoice ID"),
  payload: z
    .union([
      invoiceItemPatchSchema,
      z.array(invoiceItemPatchSchema).describe("Invoice item patch operations"),
    ])
    .optional()
    .describe("Invoice item patch payload"),
});

const invoiceCustomFieldTypesSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...sortParam(["Id", "Name", "CreatedOn", "ModifiedOn"]),
    }),
  ),
);

const invoiceAdjustmentCreateSchema = z.object({
  payload: z.object({}).passthrough().describe("Invoice adjustment payload"),
});

const invoiceMarkAsExportedSchema = z.object({
  ids: z
    .array(z.number().int().describe("Invoice ID"))
    .min(1)
    .describe("Invoice IDs to mark as exported"),
});

export function registerInvoiceTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "accounting_invoices_create_adjustment",
    domain: "accounting",
    operation: "write",
    description: "Create an adjustment invoice",
    schema: invoiceAdjustmentCreateSchema.shape,
    handler: async (params) => {
      const input = invoiceAdjustmentCreateSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/invoices", input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_invoices_update_custom_fields",
    domain: "accounting",
    operation: "write",
    description: "Update invoice custom fields",
    schema: invoiceCustomFieldsUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof invoiceCustomFieldsUpdateSchema>;

      try {
        const data = await client.patch(
          "/tenant/{tenant}/invoices/custom-fields",
          input.customFields,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_invoices_update",
    domain: "accounting",
    operation: "write",
    description: "Patch an invoice",
    schema: invoiceUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof invoiceUpdateSchema>;

      try {
        const data = await client.patch(`/tenant/{tenant}/invoices/${input.id}`, input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_invoices_list",
    domain: "accounting",
    operation: "read",
    description: "List invoices",
    schema: invoicesListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof invoicesListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/invoices",
          buildParams({
            ids: input.ids,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            statuses: input.statuses,
            batchId: input.batchId,
            batchNumber: input.batchNumber,
            page: input.page,
            pageSize: input.pageSize,
            "customField.Fields": input.customFieldFields,
            "customField.Operator": input.customFieldOperator,
            includeTotal: input.includeTotal,
            jobId: input.jobId,
            jobNumber: input.jobNumber,
            businessUnitId: input.businessUnitId,
            customerId: input.customerId,
            invoicedOnOrAfter: input.invoicedOnOrAfter,
            invoicedOnBefore: input.invoicedOnBefore,
            adjustmentToId: input.adjustmentToId,
            number: input.number,
            createdOnOrAfter: input.createdOnOrAfter,
            createdBefore: input.createdBefore,
            totalGreater: input.totalGreater,
            totalLess: input.totalLess,
            "balanceFilter.Balance": input.balanceFilterBalance,
            "balanceFilter.Comparer": input.balanceFilterComparer,
            dueDateBefore: input.dueDateBefore,
            dueDateOnOrAfter: input.dueDateOnOrAfter,
            orderBy: input.orderBy,
            orderByDirection: input.orderByDirection,
            reviewStatuses: input.reviewStatuses,
            assignedToIds: input.assignedToIds,
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
    name: "accounting_invoices_custom_field_types_list",
    domain: "accounting",
    operation: "read",
    description: "List invoice custom field types",
    schema: invoiceCustomFieldTypesSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof invoiceCustomFieldTypesSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/invoices/custom-fields",
          buildParams({
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_invoice_items_delete",
    domain: "accounting",
    operation: "delete",
    description: "Delete an invoice item",
    schema: invoiceIdItemIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof invoiceIdItemIdSchema>;

      try {
        await client.delete(
          `/tenant/{tenant}/invoices/${input.invoiceId}/items/${input.itemId}`,
        );

        return toolResult({
          success: true,
          message: "Invoice item deleted successfully",
        });
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_invoice_items_update",
    domain: "accounting",
    operation: "write",
    description: "Patch invoice items",
    schema: invoiceItemsUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof invoiceItemsUpdateSchema>;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/invoices/${input.invoiceId}/items`,
          input.payload,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_invoices_mark_as_exported",
    domain: "accounting",
    operation: "write",
    description: "Mark invoices as exported",
    schema: invoiceMarkAsExportedSchema.shape,
    handler: async (params) => {
      const input = invoiceMarkAsExportedSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/invoices/markasexported", {
          ids: input.ids,
        });
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
