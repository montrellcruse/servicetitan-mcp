import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import {
  activeFilterParam,
  buildParams,
  dateFilterParams,
  paginationParams,
  toolError,
  toolResult,
  getErrorMessage,
} from "../../utils.js";

const employeeTypeSchema = z.enum(["Technician", "Employee"]);

const payrollSettingPayloadSchema = z
  .object({
    employeeId: z.number().int().optional().describe("Linked employee ID"),
    active: z.boolean().optional().describe("Whether payroll settings are active"),
    payType: z.string().optional().describe("Pay type value"),
    payRate: z.number().optional().describe("Primary pay rate"),
    hourlyRate: z.number().optional().describe("Hourly pay rate"),
    overtimeRate: z.number().optional().describe("Overtime rate"),
    overtimeMultiplier: z.number().optional().describe("Overtime multiplier"),
    doubleTimeMultiplier: z.number().optional().describe("Double-time multiplier"),
    regularHoursPerWeek: z
      .number()
      .optional()
      .describe("Regular hours per week"),
    dailyOvertimeThresholdMinutes: z
      .number()
      .int()
      .optional()
      .describe("Daily overtime threshold in minutes"),
    weeklyOvertimeThresholdMinutes: z
      .number()
      .int()
      .optional()
      .describe("Weekly overtime threshold in minutes"),
    timesheetCodeId: z.number().int().optional().describe("Timesheet code ID"),
    laborWageTypeId: z.number().int().optional().describe("Labor wage type ID"),
    externalPayrollId: z.string().optional().describe("External payroll identifier"),
    startDate: z.string().optional().describe("Payroll setting start date/time"),
    endDate: z.string().optional().describe("Payroll setting end date/time"),
  })
  .passthrough();

const employeePayrollSettingsSchema = z.object({
  employeeId: z.number().int().describe("Employee ID"),
});

const technicianPayrollSettingsSchema = z.object({
  technicianId: z.number().int().describe("Technician ID"),
});

const employeePayrollSettingsUpdateSchema = employeePayrollSettingsSchema.extend({
  payload: payrollSettingPayloadSchema.optional().describe("Employee payroll settings payload"),
});

const technicianPayrollSettingsUpdateSchema = technicianPayrollSettingsSchema.extend({
  payload: payrollSettingPayloadSchema
    .optional()
    .describe("Technician payroll settings payload"),
});

const payrollSettingsListSchema = dateFilterParams(
  paginationParams(
    z.object({
      employeeType: employeeTypeSchema.optional().describe("Employee type"),
      ...activeFilterParam(),
    }),
  ),
);
export function registerPayrollSettingsTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "payroll_payroll_settings_employee_get",
    domain: "payroll",
    operation: "read",
    description: "Get payroll settings for an employee",
    schema: employeePayrollSettingsSchema.shape,
    handler: async (params) => {
      const input = employeePayrollSettingsSchema.parse(params);

      try {
        const data = await client.get(
          `/tenant/{tenant}/employees/${input.employeeId}/payroll-settings`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_payroll_settings_employee_update",
    domain: "payroll",
    operation: "write",
    description: "Update payroll settings for an employee",
    schema: employeePayrollSettingsUpdateSchema.shape,
    handler: async (params) => {
      const input = employeePayrollSettingsUpdateSchema.parse(params);

      try {
        const data = await client.put(
          `/tenant/{tenant}/employees/${input.employeeId}/payroll-settings`,
          input.payload,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_payroll_settings_list",
    domain: "payroll",
    operation: "read",
    description: "List payroll settings",
    schema: payrollSettingsListSchema.shape,
    handler: async (params) => {
      const input = payrollSettingsListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/payroll-settings",
          buildParams({
            employeeType: input.employeeType,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
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
    name: "payroll_payroll_settings_technician_get",
    domain: "payroll",
    operation: "read",
    description: "Get payroll settings for a technician",
    schema: technicianPayrollSettingsSchema.shape,
    handler: async (params) => {
      const input = technicianPayrollSettingsSchema.parse(params);

      try {
        const data = await client.get(
          `/tenant/{tenant}/technicians/${input.technicianId}/payroll-settings`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_payroll_settings_technician_update",
    domain: "payroll",
    operation: "write",
    description: "Update payroll settings for a technician",
    schema: technicianPayrollSettingsUpdateSchema.shape,
    handler: async (params) => {
      const input = technicianPayrollSettingsUpdateSchema.parse(params);

      try {
        const data = await client.put(
          `/tenant/{tenant}/technicians/${input.technicianId}/payroll-settings`,
          input.payload,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
