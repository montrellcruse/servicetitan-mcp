import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, paginationParams, toolError, toolResult } from "../../utils.js";

const grossPayItemCreateSchema = z.object({
  name: z.string().describe("Gross pay item name"),
  description: z.string().optional().describe("Gross pay item description"),
  amount: z.number().describe("Gross pay amount"),
  is_active: z.boolean().optional().describe("Whether the gross pay item is active"),
});

const grossPayItemPayloadSchema = z
  .object({
    name: z.string().optional().describe("Gross pay item name"),
    description: z.string().optional().describe("Gross pay item description"),
    amount: z.number().optional().describe("Gross pay amount"),
    is_active: z.boolean().optional().describe("Whether the gross pay item is active"),
  })
  .passthrough();

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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
        return toolError(getErrorMessage(error));
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
        return toolError(getErrorMessage(error));
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_gross_pay_items_list",
    domain: "payroll",
    operation: "read",
    description: "List gross pay items",
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
        return toolError(getErrorMessage(error));
      }
    },
  });
}
