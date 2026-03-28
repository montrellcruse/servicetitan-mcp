import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchWithWarning,
  getErrorMessage,
  isRecord,
  round,
  safeDivide,
  sumBy,
  toDateRange,
  toNumber,
  toText,
} from "./helpers.js";
import { resolveBusinessUnitId, resolveTechnicianId } from "./resolvers.js";

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
  Activity: 1,
  Date: 2,
  InvoiceNumber: 3,
  EmployeeBusinessUnit: 4,
  Duration: 5,
  RegularHours: 6,
  OvertimeHours: 7,
  DoubleOvertimeHours: 8,
  GrossPay: 9,
  CustomerName: 10,
  ProjectNumber: 11,
  Zone: 12,
  TaxZone: 13,
  LocationZip: 14,
  LocationName: 15,
  LocationAddress: 16,
  LaborTypeCode: 17,
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
      "Labor cost summary from the Master Pay File with employee hours, gross pay, hourly rates, activity mix, and business unit breakdown" +
      '\n\nExamples:\n- "What did labor cost us this month?" -> startDate="2026-03-01", endDate="2026-04-01"\n- "Show overtime costs by employee for Q1" -> startDate="2026-01-01", endDate="2026-04-01"\n- "How much did Andrew cost in labor last week?" -> startDate="2026-03-02", endDate="2026-03-09", technicianName="Andrew"',
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
            client.post("/tenant/{tenant}/report-category/accounting/reports/166/data", {
              parameters: reportParams,
            }),
          null,
        );

        const rows = reportResponse ? extractReportRows(reportResponse) : [];
        const employeeMap = new Map<string, EmployeeAccumulator>();
        const businessUnitMap = new Map<string, BusinessUnitAccumulator>();

        for (const row of rows) {
          const employeeName = toText(row[FIELD.EmployeeName]) ?? "Unknown Employee";
          const activityName = toText(row[FIELD.Activity]) ?? "Unknown Activity";
          const businessUnitName = toText(row[FIELD.EmployeeBusinessUnit]) ?? "Unknown";
          const regularHours = toNumber(row[FIELD.RegularHours]);
          const overtimeHours = toNumber(row[FIELD.OvertimeHours]);
          const doubleOvertimeHours = toNumber(row[FIELD.DoubleOvertimeHours]);
          const grossPay = toNumber(row[FIELD.GrossPay]);
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

        const totalGrossPay = round(sumBy(employees, (employee) => employee.grossPay), 2);
        const totalHoursWorked = round(sumBy(employees, (employee) => employee.totalHours), 2);
        const totalRegularHours = round(sumBy(employees, (employee) => employee.regularHours), 2);
        const totalOvertimeHours = round(sumBy(employees, (employee) => employee.overtimeHours), 2);
        const totalDoubleOvertimeHours = round(
          sumBy(employees, (employee) => employee.doubleOvertimeHours),
          2,
        );

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
          avgHourlyRate: round(safeDivide(totalGrossPay, totalHoursWorked), 2),
          overtimePercent: round(
            safeDivide(totalOvertimeHours + totalDoubleOvertimeHours, totalHoursWorked) * 100,
            1,
          ),
          employees,
          byBusinessUnit,
        };

        if (warnings.length > 0) {
          result._warnings = warnings;
        }

        return toolResult(result, { shape: true });
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
