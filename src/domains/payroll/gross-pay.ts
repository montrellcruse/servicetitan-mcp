import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, paginationParams, toolError, toolResult } from "../../utils.js";

const grossPayItemCreateSchema = z.object({
  payrollId: z.number().int().describe("Payroll ID"),
  amount: z.number().describe("Gross pay amount"),
  activityCodeId: z.number().int().describe("Activity code ID"),
  date: z.string().datetime().describe("Gross pay date/time"),
  invoiceId: z.number().int().nullable().optional(),
  budgetCodeId: z.number().int().nullable().optional(),
  businessUnitId: z.number().int().nullable().optional(),
  memo: z.string().nullable().optional(),
});

const grossPayItemPayloadSchema = grossPayItemCreateSchema;

const grossPayItemUpdateSchema = z.object({
  id: z.number().int().describe("Gross pay item ID"),
  payload: grossPayItemPayloadSchema.describe("Gross pay item update payload"),
});

const grossPayItemDeleteSchema = z.object({
  id: z.number().int().describe("Gross pay item ID"),
});

const grossPayItemListSchema = paginationParams(
  z.object({
    employeeType: z
      .enum(["Technician", "Employee"])
      .optional()
      .describe("Employee type"),
    employeeId: z.number().int().optional().describe("Employee ID"),
    payrollIds: z.string().optional().describe("Comma-delimited payroll IDs"),
    dateOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Filter items on or after this UTC timestamp"),
    dateOnOrBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Filter items on or before this UTC timestamp"),
  }),
);
export function registerPayrollGrossPayTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "payroll_gross_pay_items_create",
    domain: "payroll",
    operation: "write",
    description: "Create a gross pay item",
    schema: grossPayItemCreateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof grossPayItemCreateSchema>;

      try {
        const data = await client.post("/tenant/{tenant}/gross-pay-items", input);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "payroll_gross_pay_items_update",
    domain: "payroll",
    operation: "write",
    description: "Update a gross pay item",
    schema: grossPayItemUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof grossPayItemUpdateSchema>;

      try {
        const data = await client.put(
          `/tenant/{tenant}/gross-pay-items/${input.id}`,
          input.payload,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "payroll_gross_pay_items_delete",
    domain: "payroll",
    operation: "delete",
    description: "Delete a gross pay item",
    schema: grossPayItemDeleteSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof grossPayItemDeleteSchema>;

      try {
        await client.delete(`/tenant/{tenant}/gross-pay-items/${input.id}`);
        return toolResult({ success: true, message: "Gross pay item deleted successfully." });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "payroll_gross_pay_items_list",
    domain: "payroll",
    operation: "read",
    description: "List one requested page of gross-pay line items, optionally scoped by employee, payroll IDs, or pay date range. Use this to inspect pay components rather than payroll-period summaries.",
    schema: grossPayItemListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof grossPayItemListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/gross-pay-items",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            employeeType: input.employeeType,
            employeeId: input.employeeId,
            payrollIds: input.payrollIds,
            dateOnOrAfter: input.dateOnOrAfter,
            dateOnOrBefore: input.dateOnOrBefore,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
