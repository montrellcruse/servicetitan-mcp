import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchWithWarning,
  isRecord,
  round,
  toDateRange,
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
  hours: number | null;
  grossPay: number | null;
}

interface EmployeeAccumulator {
  name: string;
  regularHours: number | null;
  overtimeHours: number | null;
  doubleOvertimeHours: number | null;
  grossPay: number | null;
  activities: Map<string, ActivityAccumulator>;
}

interface ActivityBreakdown {
  activity: string;
  entries: number;
  hours: number | null;
  grossPay: number | null;
  avgHourlyRate: number | null;
}

interface EmployeeLaborSummary {
  name: string;
  businessUnits: string[];
  totalHours: number | null;
  regularHours: number | null;
  overtimeHours: number | null;
  doubleOvertimeHours: number | null;
  grossPay: number | null;
  avgHourlyRate: number | null;
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

function reportNumber(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw
    : typeof raw === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim())
      ? Number(raw.trim()) : null;
  return value !== null && Number.isFinite(value) ? value : null;
}

function add(left: number | null, right: number | null): number | null {
  return left !== null && right !== null && Number.isFinite(left + right) ? left + right : null;
}

function totalHours(regularHours: number | null, overtimeHours: number | null, doubleOvertimeHours: number | null): number | null {
  return add(add(regularHours, overtimeHours), doubleOvertimeHours);
}

function ratio(numerator: number | null, denominator: number | null, scale = 1, decimals = 2): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  const value = numerator / denominator * scale;
  return Number.isFinite(value) ? round(value, decimals) : null;
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
      "Summarize Report 166 regular, overtime, double-overtime, and total reported hours, grouped by employee name. These reported hours are not reconstructed job hours. GrossPay and effective hourly rates are available only where the configured report supplies numeric pay and hours; missing cells and failed sources remain null, and zero-hour rates are undefined. Business-unit and activity attribution are unavailable from this report contract. Report calls may wait for per-report/client spacing; source status and failures are returned in _sourceAvailability and _warnings." +
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
        const grossPayPresent = grossPayIndex >= 0;
        const employeeMap = new Map<string, EmployeeAccumulator>();
        let missingGrossPayCells = 0;
        let missingHourCells = 0;

        for (const row of rows) {
          const employeeName = toText(row[FIELD.EmployeeName]) ?? "Unknown Employee";
          const activityName = "Reported hours";
          const regularHours = reportNumber(row[FIELD.RegularHours]);
          const overtimeHours = reportNumber(row[FIELD.OvertimeHours]);
          const doubleOvertimeHours = reportNumber(row[FIELD.DoubleOvertimeHours]);
          const grossPay = grossPayPresent ? reportNumber(row[grossPayIndex]) : null;
          missingHourCells += [regularHours, overtimeHours, doubleOvertimeHours].filter((value) => value === null).length;
          if (grossPayPresent && grossPay === null) missingGrossPayCells += 1;
          const hours = totalHours(regularHours, overtimeHours, doubleOvertimeHours);
          const employeeKey = normalizeKey(employeeName);
          const employee = employeeMap.get(employeeKey) ?? {
            name: employeeName,
            regularHours: 0,
            overtimeHours: 0,
            doubleOvertimeHours: 0,
            grossPay: grossPayPresent ? 0 : null,
            activities: new Map<string, ActivityAccumulator>(),
          };
          employee.regularHours = add(employee.regularHours, regularHours);
          employee.overtimeHours = add(employee.overtimeHours, overtimeHours);
          employee.doubleOvertimeHours = add(employee.doubleOvertimeHours, doubleOvertimeHours);
          employee.grossPay = add(employee.grossPay, grossPay);
          const activity = employee.activities.get(activityName) ?? {
            activity: activityName, entries: 0, hours: 0, grossPay: grossPayPresent ? 0 : null,
          };
          activity.entries += 1;
          activity.hours = add(activity.hours, hours);
          activity.grossPay = add(activity.grossPay, grossPay);
          employee.activities.set(activityName, activity);
          employeeMap.set(employeeKey, employee);
        }

        if (missingHourCells > 0) {
          warnings.push(`Labor report contains ${missingHourCells} unavailable hour cell(s); affected hour totals and rates are null.`);
        }
        if (missingGrossPayCells > 0) {
          warnings.push(`Labor report contains ${missingGrossPayCells} unavailable GrossPay cell(s); affected pay totals and rates are null.`);
        }
        const rawEmployees = Array.from(employeeMap.values());
        // Sum source values before any presentation rounding or idle-row suppression.
        const sum = (field: "regularHours" | "overtimeHours" | "doubleOvertimeHours" | "grossPay") =>
          reportResponse ? rawEmployees.reduce<number | null>((total, employee) => add(total, employee[field]), 0) : null;
        const totalRegularHours = sum("regularHours");
        const totalOvertimeHours = sum("overtimeHours");
        const totalDoubleOvertimeHours = sum("doubleOvertimeHours");
        const totalHoursWorked = totalHours(totalRegularHours, totalOvertimeHours, totalDoubleOvertimeHours);
        const totalGrossPay = grossPayPresent ? sum("grossPay") : null;
        const costAvailable = reportResponse !== null && grossPayPresent && totalGrossPay !== null;
        const employees: EmployeeLaborSummary[] = rawEmployees.map((employee) => {
          const hours = totalHours(employee.regularHours, employee.overtimeHours, employee.doubleOvertimeHours);
          return {
            name: employee.name,
            businessUnits: [],
            totalHours: hours,
            regularHours: employee.regularHours,
            overtimeHours: employee.overtimeHours,
            doubleOvertimeHours: employee.doubleOvertimeHours,
            grossPay: employee.grossPay,
            avgHourlyRate: ratio(employee.grossPay, hours),
            activityBreakdown: Array.from(employee.activities.values()).map((activity) => ({
              activity: activity.activity,
              entries: activity.entries,
              hours: activity.hours,
              grossPay: activity.grossPay,
              avgHourlyRate: ratio(activity.grossPay, activity.hours),
            })),
          };
        }).filter(hasEmployeeActivity)
          .sort((a, b) => (b.grossPay ?? 0) - (a.grossPay ?? 0) || (b.totalHours ?? 0) - (a.totalHours ?? 0));
        const costReason = !reportResponse
          ? "Labor report unavailable; cost and hours cannot be measured. See _warnings."
          : !grossPayPresent
            ? "The configured Report 166 binding does not supply GrossPay; labor cost is unavailable."
            : totalGrossPay === null
              ? "GrossPay is unavailable in one or more source cells or its aggregate; a complete labor-cost total cannot be measured."
              : "Numeric GrossPay is available for all returned report rows.";
        const result: Record<string, unknown> = {
          period: { start: input.startDate, end: input.endDate },
          totalGrossPay: totalGrossPay,
          totalHours: totalHoursWorked,
          regularHours: totalRegularHours,
          overtimeHours: totalOvertimeHours,
          doubleOvertimeHours: totalDoubleOvertimeHours,
          avgHourlyRate: ratio(totalGrossPay, totalHoursWorked),
          costAvailability: { available: costAvailable, reason: costReason },
          overtimePercent: ratio(add(totalOvertimeHours, totalDoubleOvertimeHours), totalHoursWorked, 100, 1),
          employees,
          byBusinessUnit: [],
          aggregationBasis: "Original Report 166 numeric hour/pay values summed without per-row rounding, grouped by normalized employee name; no employee-ID, business-unit or activity attribution is provided by this report contract.",
          _sourceAvailability: {
            laborHours: reportResponse ? { status: "complete" } : { status: "failed", reason: "Labor report unavailable; see _warnings." },
          },
          _metricAvailability: {
            businessUnits: { available: false, reason: "Business-unit attribution is unavailable from the Report 166 contract." },
            activities: { available: false, reason: "Activity classification is unavailable; activityBreakdown groups all report rows as Reported hours." },
            ...(!costAvailable ? { grossPay: { available: false, reason: costReason } } : {}),
            ...(totalHoursWorked === null ? { hours: { available: false, reason: "Complete hour totals are unavailable; see source status and warnings." } } : {}),
          },
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
