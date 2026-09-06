import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchWithWarning,
  isRecord,
  round,
  safeDivide,
  sumBy,
  toDateRange,
  toNumber,
  toText,
} from "./helpers.js";
import { resolveBusinessUnitId, resolveTechnicianId } from "./resolvers.js";
import { executeReport } from "./report-executor.js";

const laborCostSchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  businessUnitId: z.number().int().optional().describe("Filter by business unit ID"),
  businessUnitName: z.string().optional().describe("Filter by business unit name (resolved via cache, e.g. 'HVAC'). Alternative to businessUnitId."),
  technicianId: z.number().int().optional().describe("Filter by technician ID"),
  technicianName: z.string().optional().describe("Filter by technician name (resolved via cache, e.g. 'John'). Alternative to technicianId."),
});

const FIELD = {
  EmployeeName: 0,
  Date: 1,
  RegularHours: 2,
  OvertimeHours: 3,
  DoubleOvertimeHours: 4,
} as const;

interface ActivityAccumulator {
  activity: string;
  entries: number;
  hours: number;
  grossPay: number;
}

interface EmployeeAccumulator {
  name: string;
  businessUnits: Set<string>;
  regularHours: number;
  overtimeHours: number;
  doubleOvertimeHours: number;
  grossPay: number;
  activities: Map<string, ActivityAccumulator>;
}

interface BusinessUnitAccumulator {
  name: string;
  employees: Set<string>;
  regularHours: number;
  overtimeHours: number;
  doubleOvertimeHours: number;
  grossPay: number;
}

interface ActivityBreakdown {
  activity: string;
  entries: number;
  hours: number;
  grossPay: number;
  avgHourlyRate: number;
}

interface EmployeeLaborSummary {
  name: string;
  businessUnits: string[];
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  doubleOvertimeHours: number;
  grossPay: number;
  avgHourlyRate: number;
  activityBreakdown: ActivityBreakdown[];
}

function extractReportRows(response: unknown): unknown[][] {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    return [];
  }

  return response.data.filter(Array.isArray);
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function totalHours(regularHours: number, overtimeHours: number, doubleOvertimeHours: number): number {
  return regularHours + overtimeHours + doubleOvertimeHours;
}

function hasEmployeeActivity(employee: EmployeeLaborSummary): boolean {
  return employee.totalHours !== 0 || employee.grossPay !== 0;
}

export function registerIntelligenceLaborCostTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "intel_labor_cost",
    domain: "intelligence",
    operation: "read",
    description:
      "Summarize employee regular, overtime, double-overtime, and total hours from Report 166 for the selected date range. When the tenant report exposes GrossPay, the tool also derives cost and effective hourly rate; otherwise those fields are unavailable rather than estimated. Report execution may wait for per-report/client spacing, and source failures are returned in _warnings." +
      '\n\nExamples:\n- "What labor hours were reported this month?" -> startDate="2026-03-01", endDate="2026-04-01"\n- "Show overtime hours by employee for Q1" -> startDate="2026-01-01", endDate="2026-04-01"',
    schema: laborCostSchema.shape,
    handler: async (params) => {
      try {
        const input = laborCostSchema.parse(params);
        toDateRange(input.startDate, input.endDate, registry.timezone);
        const warnings: string[] = [];

        const buResolved = await resolveBusinessUnitId(client, input.businessUnitId, input.businessUnitName);
        const effectiveBuId = buResolved.id;
        if (input.businessUnitName && !effectiveBuId) {
          warnings.push(`Business unit "${input.businessUnitName}" not found. Showing all business units.`);
        }
        if (buResolved.resolvedName) {
          warnings.push(`Resolved "${input.businessUnitName}" → ${buResolved.resolvedName} (ID: ${effectiveBuId})`);
        }

        const techResolved = await resolveTechnicianId(client, input.technicianId, input.technicianName);
        const effectiveTechId = techResolved.id;
        if (input.technicianName && !effectiveTechId) {
          warnings.push(`Technician "${input.technicianName}" not found. Showing all technicians.`);
        }
        if (techResolved.resolvedName) {
          warnings.push(`Resolved "${input.technicianName}" → ${techResolved.resolvedName} (ID: ${effectiveTechId})`);
        }

        const reportParams: Array<{ name: string; value: string }> = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        if (effectiveBuId !== undefined) {
          reportParams.push({
            name: "BusinessUnitId",
            value: String(effectiveBuId),
          });
        }

        if (effectiveTechId !== undefined) {
          reportParams.push({
            name: "TechnicianId",
            value: String(effectiveTechId),
          });
        }

        const reportResponse = await fetchWithWarning(
          warnings,
          "Labor cost report (Report 166)",
          () =>
            executeReport(client, "166", reportParams, registry.reportBindings),
          null,
        );

        const rows = reportResponse ? extractReportRows(reportResponse) : [];
        const grossPayIndex = reportResponse && Array.isArray(reportResponse.fields)
          ? reportResponse.fields.findIndex((field) => field.name === "GrossPay")
          : -1;
        const costAvailable = grossPayIndex >= 0;
        const employeeMap = new Map<string, EmployeeAccumulator>();
        const businessUnitMap = new Map<string, BusinessUnitAccumulator>();

        for (const row of rows) {
          const employeeName = toText(row[FIELD.EmployeeName]) ?? "Unknown Employee";
          const activityName = "Reported hours";
          const businessUnitName = "Unavailable from Report 166";
          const regularHours = toNumber(row[FIELD.RegularHours]);
          const overtimeHours = toNumber(row[FIELD.OvertimeHours]);
          const doubleOvertimeHours = toNumber(row[FIELD.DoubleOvertimeHours]);
          const grossPay = costAvailable ? toNumber(row[grossPayIndex]) : 0;
          const hours = totalHours(regularHours, overtimeHours, doubleOvertimeHours);

          const employeeKey = normalizeKey(employeeName);
          const employee =
            employeeMap.get(employeeKey) ??
            {
              name: employeeName,
              businessUnits: new Set<string>(),
              regularHours: 0,
              overtimeHours: 0,
              doubleOvertimeHours: 0,
              grossPay: 0,
              activities: new Map<string, ActivityAccumulator>(),
            };

          employee.businessUnits.add(businessUnitName);
          employee.regularHours += regularHours;
          employee.overtimeHours += overtimeHours;
          employee.doubleOvertimeHours += doubleOvertimeHours;
          employee.grossPay += grossPay;

          const activityKey = normalizeKey(activityName);
          const activity =
            employee.activities.get(activityKey) ??
            {
              activity: activityName,
              entries: 0,
              hours: 0,
              grossPay: 0,
            };
          activity.entries += 1;
          activity.hours += hours;
          activity.grossPay += grossPay;
          employee.activities.set(activityKey, activity);

          employeeMap.set(employeeKey, employee);

          const businessUnitKey = normalizeKey(businessUnitName);
          const businessUnit =
            businessUnitMap.get(businessUnitKey) ??
            {
              name: businessUnitName,
              employees: new Set<string>(),
              regularHours: 0,
              overtimeHours: 0,
              doubleOvertimeHours: 0,
              grossPay: 0,
            };

          businessUnit.employees.add(employeeName);
          businessUnit.regularHours += regularHours;
          businessUnit.overtimeHours += overtimeHours;
          businessUnit.doubleOvertimeHours += doubleOvertimeHours;
          businessUnit.grossPay += grossPay;
          businessUnitMap.set(businessUnitKey, businessUnit);
        }

        const employees: EmployeeLaborSummary[] = Array.from(employeeMap.values())
          .map((employee) => {
            const employeeTotalHours = totalHours(
              employee.regularHours,
              employee.overtimeHours,
              employee.doubleOvertimeHours,
            );

            return {
              name: employee.name,
              businessUnits: Array.from(employee.businessUnits).sort((a, b) =>
                a.localeCompare(b),
              ),
              totalHours: round(employeeTotalHours, 2),
              regularHours: round(employee.regularHours, 2),
              overtimeHours: round(employee.overtimeHours, 2),
              doubleOvertimeHours: round(employee.doubleOvertimeHours, 2),
              grossPay: round(employee.grossPay, 2),
              avgHourlyRate: round(safeDivide(employee.grossPay, employeeTotalHours), 2),
              activityBreakdown: Array.from(employee.activities.values())
                .map((activity) => ({
                  activity: activity.activity,
                  entries: activity.entries,
                  hours: round(activity.hours, 2),
                  grossPay: round(activity.grossPay, 2),
                  avgHourlyRate: round(safeDivide(activity.grossPay, activity.hours), 2),
                }))
                .sort((a, b) => b.grossPay - a.grossPay || b.hours - a.hours),
            };
          })
          .filter(hasEmployeeActivity)
          .sort((a, b) => b.grossPay - a.grossPay || b.totalHours - a.totalHours);

        const byBusinessUnit = Array.from(businessUnitMap.values())
          .map((businessUnit) => {
            const businessUnitTotalHours = totalHours(
              businessUnit.regularHours,
              businessUnit.overtimeHours,
              businessUnit.doubleOvertimeHours,
            );
            const businessUnitOvertimeHours =
              businessUnit.overtimeHours + businessUnit.doubleOvertimeHours;

            return {
              name: businessUnit.name,
              employeeCount: businessUnit.employees.size,
              totalHours: round(businessUnitTotalHours, 2),
              regularHours: round(businessUnit.regularHours, 2),
              overtimeHours: round(businessUnit.overtimeHours, 2),
              doubleOvertimeHours: round(businessUnit.doubleOvertimeHours, 2),
              grossPay: round(businessUnit.grossPay, 2),
              avgHourlyRate: round(
                safeDivide(businessUnit.grossPay, businessUnitTotalHours),
                2,
              ),
              overtimePercent: round(
                safeDivide(businessUnitOvertimeHours, businessUnitTotalHours) * 100,
                1,
              ),
            };
          })
          .sort((a, b) => b.grossPay - a.grossPay || b.totalHours - a.totalHours);

        const calculatedGrossPay = round(sumBy(employees, (employee) => employee.grossPay), 2);
        const totalGrossPay = costAvailable ? calculatedGrossPay : null;
        const totalHoursWorked = round(sumBy(employees, (employee) => employee.totalHours), 2);
        const totalRegularHours = round(sumBy(employees, (employee) => employee.regularHours), 2);
        const totalOvertimeHours = round(sumBy(employees, (employee) => employee.overtimeHours), 2);
        const totalDoubleOvertimeHours = round(
          sumBy(employees, (employee) => employee.doubleOvertimeHours),
          2,
        );
        const presentedEmployees = employees.map((employee) => ({
          ...employee,
          grossPay: costAvailable ? employee.grossPay : null,
          avgHourlyRate: costAvailable ? employee.avgHourlyRate : null,
          activityBreakdown: employee.activityBreakdown.map((activity) => ({
            ...activity,
            grossPay: costAvailable ? activity.grossPay : null,
            avgHourlyRate: costAvailable ? activity.avgHourlyRate : null,
          })),
        }));
        const presentedBusinessUnits = byBusinessUnit.map((businessUnit) => ({
          ...businessUnit,
          grossPay: costAvailable ? businessUnit.grossPay : null,
          avgHourlyRate: costAvailable ? businessUnit.avgHourlyRate : null,
        }));

        const result: Record<string, unknown> = {
          period: {
            start: input.startDate,
            end: input.endDate,
          },
          totalGrossPay,
          totalHours: totalHoursWorked,
          regularHours: totalRegularHours,
          overtimeHours: totalOvertimeHours,
          doubleOvertimeHours: totalDoubleOvertimeHours,
          avgHourlyRate: costAvailable ? round(safeDivide(calculatedGrossPay, totalHoursWorked), 2) : null,
          costAvailability: {
            available: costAvailable,
            reason: costAvailable
              ? "GrossPay is present in the configured report binding."
              : "ServiceTitan Report 166 provides hours but no gross-pay field; labor cost cannot be calculated from this source.",
          },
          overtimePercent: round(
            safeDivide(totalOvertimeHours + totalDoubleOvertimeHours, totalHoursWorked) * 100,
            1,
          ),
          employees: presentedEmployees,
          byBusinessUnit: presentedBusinessUnits,
        };

        if (warnings.length > 0) {
          result._warnings = warnings;
        }

        return toolResult(result, { shape: true });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
