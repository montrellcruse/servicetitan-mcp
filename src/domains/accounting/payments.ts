import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, dateFilterParams, paginationParams, sortParam, toolError, toolResult } from "../../utils.js";

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

const paymentSplitSchema = z.object({
  invoiceId: z.number().int().optional().describe("Invoice ID receiving payment"),
  amount: z.number().optional().describe("Split amount"),
});

const paymentUpdatePayloadSchema = z.object({
  typeId: z.number().int().optional().describe("Payment type ID"),
  active: z.boolean().optional().describe("Whether payment is active"),
  memo: z.string().optional().describe("Payment memo"),
  paidOn: z.string().optional().describe("Payment date-time"),
  authCode: z.string().optional().describe("Authorization code"),
  checkNumber: z.string().optional().describe("Check number"),
  exportId: z.string().optional().describe("External export ID"),
  transactionStatus: z
    .string()
    .optional()
    .describe("Transaction status value from ServiceTitan"),
  status: z.string().optional().describe("Payment status value from ServiceTitan"),
  splits: z.array(paymentSplitSchema).optional().describe("Invoice split allocations"),
});

const paymentsListSchema = paginationParams(
  dateFilterParams(
    z.object({
      ids: z.string().optional().describe("Comma-delimited payment IDs (max 50)"),
      appliedToInvoiceIds: z
        .string()
        .optional()
        .describe("Comma-delimited invoice IDs applied to"),
      appliedToReferenceNumber: z
        .string()
        .optional()
        .describe("Applied reference number"),
      statuses: z.string().optional().describe("Payment statuses"),
      paidOnAfter: z
        .string()
        .optional()
        .describe("Paid date on or after RFC3339 date-time"),
      paidOnBefore: z
        .string()
        .optional()
        .describe("Paid date on or before RFC3339 date-time"),
      businessUnitIds: z
        .string()
        .optional()
        .describe("Comma-delimited business unit IDs"),
      batchNumber: z.number().int().optional().describe("Batch number"),
      batchId: z.number().int().optional().describe("Batch ID"),
      transactionType: z
        .enum(["Undefined", "JournalEntry", "ReceivePayment"])
        .optional()
        .describe("Transaction type"),
      customerId: z.number().int().optional().describe("Customer ID"),
      totalGreater: z.number().optional().describe("Minimum total amount"),
      totalLess: z.number().optional().describe("Maximum total amount"),
      customFieldFields: z
        .record(z.string())
        .optional()
        .describe("Custom field name/value filters"),
      customFieldOperator: z
        .enum(["And", "Or"])
        .optional()
        .describe("Operator for custom field filters"),
      ...sortParam(["Id", "CreatedOn", "ModifiedOn", "PaidOn", "Total"]),
    }),
  ),
);

const paymentIdSchema = z.object({
  id: z.number().int().describe("Payment ID"),
});

const paymentUpdateSchema = z.object({
  id: z.number().int().describe("Payment ID"),
  payload: paymentUpdatePayloadSchema
    .optional()
    .describe("Payment fields to patch"),
});

const updateCustomFieldsSchema = z.object({
  customFields: customFieldMapSchema.describe("Payment custom fields payload"),
});

const customFieldTypesSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...sortParam(["Id", "Name", "CreatedOn", "ModifiedOn"]),
    }),
  ),
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerPaymentTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "accounting_payments_create",
    domain: "accounting",
    operation: "write",
    description: "Create a payment",
    schema: {},
    handler: async () => {
      try {
        const data = await client.post("/tenant/{tenant}/payments");
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_payments_update_custom_fields",
    domain: "accounting",
    operation: "write",
    description: "Update payment custom fields",
    schema: updateCustomFieldsSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof updateCustomFieldsSchema>;

      try {
        const data = await client.patch(
          "/tenant/{tenant}/payments/custom-fields",
          input.customFields,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_payments_custom_field_types_list",
    domain: "accounting",
    operation: "read",
    description: "List payment custom field types",
    schema: customFieldTypesSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customFieldTypesSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/payments/custom-fields",
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
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_payments_list",
    domain: "accounting",
    operation: "read",
    description: "List payments",
    schema: paymentsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof paymentsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/payments",
          buildParams({
            ids: input.ids,
            appliedToInvoiceIds: input.appliedToInvoiceIds,
            appliedToReferenceNumber: input.appliedToReferenceNumber,
            statuses: input.statuses,
            paidOnAfter: input.paidOnAfter,
            paidOnBefore: input.paidOnBefore,
            businessUnitIds: input.businessUnitIds,
            batchNumber: input.batchNumber,
            batchId: input.batchId,
            transactionType: input.transactionType,
            customerId: input.customerId,
            totalGreater: input.totalGreater,
            totalLess: input.totalLess,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            "customField.Fields": input.customFieldFields,
            "customField.Operator": input.customFieldOperator,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            sort: input.sort,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_payments_update_status",
    domain: "accounting",
    operation: "write",
    description: "Update payment statuses",
    schema: {},
    handler: async () => {
      try {
        const data = await client.post("/tenant/{tenant}/payments/status");
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_payments_update",
    domain: "accounting",
    operation: "write",
    description: "Patch a payment",
    schema: paymentUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof paymentUpdateSchema>;

      try {
        const data = await client.patch(`/tenant/{tenant}/payments/${input.id}`, input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });
}
