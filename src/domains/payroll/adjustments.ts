import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, paginationParams, toolError, toolResult } from "../../utils.js";

const payrollAdjustmentPayloadSchema = z.object({}).passthrough();

const createPayrollAdjustmentSchema = z.object({
  payload: payrollAdjustmentPayloadSchema.describe("Payroll adjustment create payload"),
});

const getPayrollAdjustmentSchema = z.object({
  id: z.number().int().describe("Payroll adjustment ID"),
  employeeType: z
    .enum(["Technician", "Employee"])
    .optional()
    .describe("Employee type"),
});

const listPayrollAdjustmentsSchema = paginationParams(
  z.object({
    employeeIds: z.string().optional().describe("Comma-delimited employee IDs"),
    postedOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Filter adjustments posted on or after this UTC timestamp"),
    postedOnOrBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Filter adjustments posted on or before this UTC timestamp"),
  }),
);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerPayrollAdjustmentTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "payroll_payroll_adjustments_create",
    domain: "payroll",
    operation: "write",
    description: "Create a payroll adjustment",
    schema: createPayrollAdjustmentSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof createPayrollAdjustmentSchema>;

      try {
        const data = await client.post("/tenant/{tenant}/payroll-adjustments", input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_payroll_adjustments_get",
    domain: "payroll",
    operation: "read",
    description: "Get a payroll adjustment by ID",
    schema: getPayrollAdjustmentSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof getPayrollAdjustmentSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/payroll-adjustments/${input.id}`, {
          employeeType: input.employeeType,
        });
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_payroll_adjustments_list",
    domain: "payroll",
    operation: "read",
    description: "List payroll adjustments",
    schema: listPayrollAdjustmentsSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof listPayrollAdjustmentsSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/payroll-adjustments",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            employeeIds: input.employeeIds,
            postedOnOrAfter: input.postedOnOrAfter,
            postedOnOrBefore: input.postedOnOrBefore,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
