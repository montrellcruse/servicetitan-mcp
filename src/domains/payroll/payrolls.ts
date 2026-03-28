import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, paginationParams, toolError, toolResult, getErrorMessage } from "../../utils.js";

const payrollStatusSchema = z.enum(["Pending", "Expired", "Approved", "Paid", "Locked"]);
const employeeTypeSchema = z.enum(["Technician", "Employee"]);
const activeStateSchema = z.enum(["True", "Any", "False"]);

const payrollQueryFieldsSchema = z.object({
  startedOnOrAfter: z
    .string()
    .datetime()
    .optional()
    .describe("Filter payrolls started on or after this UTC timestamp"),
  endedOnOrBefore: z
    .string()
    .datetime()
    .optional()
    .describe("Filter payrolls ended on or before this UTC timestamp"),
  modifiedBefore: z
    .string()
    .datetime()
    .optional()
    .describe("Filter payrolls modified before this UTC timestamp"),
  modifiedOnOrAfter: z
    .string()
    .datetime()
    .optional()
    .describe("Filter payrolls modified on or after this UTC timestamp"),
  approvedOnOrAfter: z
    .string()
    .datetime()
    .optional()
    .describe("Filter payrolls approved on or after this UTC timestamp"),
  status: payrollStatusSchema.optional().describe("Payroll status"),
  active: activeStateSchema.optional().describe("Active filter"),
});

const payrollListSchema = paginationParams(
  payrollQueryFieldsSchema.extend({
    employeeType: employeeTypeSchema.optional().describe("Employee type"),
  }),
);

const payrollGetSchema = z.object({
  id: z.number().int().describe("Payroll ID"),
  employeeType: employeeTypeSchema.optional().describe("Optional employee type filter"),
});

const technicianPayrollsListSchema = paginationParams(
  payrollQueryFieldsSchema.extend({
    technicianId: z.number().int().describe("Technician ID"),
  }),
);

const employeePayrollsListSchema = paginationParams(
  payrollQueryFieldsSchema.extend({
    employeeId: z.number().int().describe("Employee ID"),
  }),
);
export function registerPayrollTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "payroll_payrolls_list",
    domain: "payroll",
    operation: "read",
    description: "List payroll periods",
    schema: payrollListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof payrollListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/payrolls",
          buildParams({
            employeeType: input.employeeType,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            startedOnOrAfter: input.startedOnOrAfter,
            endedOnOrBefore: input.endedOnOrBefore,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            approvedOnOrAfter: input.approvedOnOrAfter,
            status: input.status,
            active: input.active,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_payrolls_get",
    domain: "payroll",
    operation: "read",
    description: "Get a payroll period by ID",
    schema: payrollGetSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof payrollGetSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/payrolls/${input.id}`, {
          employeeType: input.employeeType,
        });
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_technicians_payrolls_list",
    domain: "payroll",
    operation: "read",
    description: "List payroll periods for a technician",
    schema: technicianPayrollsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof technicianPayrollsListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/technicians/${input.technicianId}/payrolls`,
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            startedOnOrAfter: input.startedOnOrAfter,
            endedOnOrBefore: input.endedOnOrBefore,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            approvedOnOrAfter: input.approvedOnOrAfter,
            status: input.status,
            active: input.active,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_employees_payrolls_list",
    domain: "payroll",
    operation: "read",
    description: "List payroll periods for an employee",
    schema: employeePayrollsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof employeePayrollsListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/employees/${input.employeeId}/payrolls`,
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            startedOnOrAfter: input.startedOnOrAfter,
            endedOnOrBefore: input.endedOnOrBefore,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            approvedOnOrAfter: input.approvedOnOrAfter,
            status: input.status,
            active: input.active,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
