import { z } from "../../schema.js";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { executeReport, type ReportExecution, type ReportRow } from "./report-executor.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchAllPagesBlind,
  fetchWithWarning,
  round,
  safeDivide,
  sumBy,
  toDateRange,
  toNumber,
} from "./helpers.js";
import { resolveBusinessUnitId } from "./resolvers.js";

const revenueSummarySchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  businessUnitId: z.number().int().optional().describe("Filter by business unit ID"),
  businessUnitName: z.string().optional().describe("Filter by business unit name (resolved via cache, e.g. 'HVAC'). Alternative to businessUnitId."),
  includeCollections: z.boolean().optional().default(false).describe("Include payments received during the selected period. Default: false."),
  includeProductivityMetrics: z.boolean().optional().default(false).describe("Include business-unit productivity metrics from Report 177: revenue per hour, billable efficiency, upsold work, tasks per opportunity, and recalls. Default: false."),
});

type GenericRecord = Record<string, unknown>;

interface BUProductivity {
  revenuePerHour: number;
  billableEfficiency: number;
  upsold: number;
  tasksPerOpportunity: number;
  optionsPerOpportunity: number;
  recallsCaused: number;
}

interface BUSales {
  totalSales: number;
  closedAvgSale: number;
  closeRate: number;
  salesOpportunity: number;
  optionsPerOpportunity: number;
}

interface BURevenue {
  name: string;
  totalRevenue: number;
  completedRevenue: number;
  nonJobRevenue: number;
  adjustmentRevenue: number;
  opportunities: number;
  convertedJobs: number;
  conversionRate: number;
  productivity?: BUProductivity;
  sales?: BUSales;
}

interface BUProductivityRow {
  name: string;
  productivity: BUProductivity;
}

interface BUSalesRow {
  name: string;
  sales: BUSales;
}

export function sumReport175TotalRevenue(report: ReportExecution | null): number {
  return round(sumBy(report?.data ?? [], (row) => toNumber(row.TotalRevenue)), 2);
}

function parseReportRows(report: ReportExecution | null): BURevenue[] {
  const rows = report?.data ?? [];
  const results: BURevenue[] = [];

  for (const row of rows) {
    const totalRevenue = toNumber(row.TotalRevenue);
    const completedRevenue = toNumber(row.CompletedRevenue);

    // Skip BUs with zero activity
    if (totalRevenue === 0 && completedRevenue === 0) continue;

    results.push({
      name: String(row.Name ?? "Unknown"),
      totalRevenue: round(totalRevenue, 2),
      completedRevenue: round(completedRevenue, 2),
      nonJobRevenue: round(toNumber(row.NonJobRevenue), 2),
      adjustmentRevenue: round(toNumber(row.AdjustmentRevenue), 2),
      opportunities: Math.round(toNumber(row.Opportunity)),
      convertedJobs: Math.round(toNumber(row.ConvertedJobs)),
      conversionRate: round(toNumber(row.OpportunityConversionRate) * 100, 1),
    });
  }

  return results.sort((a, b) => b.totalRevenue - a.totalRevenue);
}

function hasAnyProductivityActivity(row: ReportRow): boolean {
  return (
    toNumber(row.RevenuePerHour) !== 0 ||
    toNumber(row.BillableEfficiency) !== 0 ||
    toNumber(row.Upsold) !== 0 ||
    toNumber(row.TasksPerOpportunity) !== 0 ||
    toNumber(row.OptionsPerOpportunity) !== 0 ||
    toNumber(row.RecallsCaused) !== 0 ||
    toNumber(row.AdjustmentRevenue) !== 0 ||
    toNumber(row.TotalRevenue) !== 0 ||
    toNumber(row.NonJobRevenue) !== 0
  );
}

function parseProductivityRows(report: ReportExecution | null): BUProductivityRow[] {
  const rows = report?.data ?? [];
  const results: BUProductivityRow[] = [];

  for (const row of rows) {
    if (!hasAnyProductivityActivity(row)) {
      continue;
    }

    results.push({
      name: String(row.Name ?? "Unknown"),
      productivity: {
        revenuePerHour: round(toNumber(row.RevenuePerHour), 2),
        billableEfficiency: round(toNumber(row.BillableEfficiency), 3),
        upsold: round(toNumber(row.Upsold), 2),
        tasksPerOpportunity: round(toNumber(row.TasksPerOpportunity), 2),
        optionsPerOpportunity: round(
          toNumber(row.OptionsPerOpportunity),
          2,
        ),
        recallsCaused: Math.round(toNumber(row.RecallsCaused)),
      },
    });
  }

  return results;
}

function hasAnySalesActivity(row: ReportRow): boolean {
  return (
    toNumber(row.TotalSales) !== 0 ||
    toNumber(row.ClosedAverageSale) !== 0 ||
    toNumber(row.CloseRate) !== 0 ||
    toNumber(row.SalesOpportunity) !== 0 ||
    toNumber(row.OptionsPerOpportunity) !== 0 ||
    toNumber(row.AdjustmentRevenue) !== 0 ||
    toNumber(row.TotalRevenue) !== 0 ||
    toNumber(row.NonJobRevenue) !== 0
  );
}

function parseSalesRows(report: ReportExecution | null): BUSalesRow[] {
  const rows = report?.data ?? [];
  const results: BUSalesRow[] = [];

  for (const row of rows) {
    if (!hasAnySalesActivity(row)) {
      continue;
    }

    results.push({
      name: String(row.Name ?? "Unknown"),
      sales: {
        totalSales: round(toNumber(row.TotalSales), 2),
        closedAvgSale: round(toNumber(row.ClosedAverageSale), 2),
        closeRate: round(toNumber(row.CloseRate) * 100, 1),
        salesOpportunity: Math.round(toNumber(row.SalesOpportunity)),
        optionsPerOpportunity: round(toNumber(row.OptionsPerOpportunity), 2),
      },
    });
  }

  return results;
}

function normalizeBusinessUnitName(name: string): string {
  return name.trim().toLowerCase();
}

function buildBusinessUnitMap<T extends { name: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [normalizeBusinessUnitName(row.name), row]));
}

function mergeBusinessUnitReports(
  revenueRows: BURevenue[],
  productivityRows: BUProductivityRow[],
  salesRows: BUSalesRow[],
): BURevenue[] {
  const revenueByName = buildBusinessUnitMap(revenueRows);
  const productivityByName = buildBusinessUnitMap(productivityRows);
  const salesByName = buildBusinessUnitMap(salesRows);
  const businessUnitNames = new Set<string>([
    ...revenueRows.map((row) => row.name),
    ...productivityRows.map((row) => row.name),
    ...salesRows.map((row) => row.name),
  ]);

  return Array.from(businessUnitNames)
    .map((name) => {
      const key = normalizeBusinessUnitName(name);
      const revenueRow = revenueByName.get(key);
      const merged: BURevenue = revenueRow
        ? { ...revenueRow }
        : {
            name,
            totalRevenue: 0,
            completedRevenue: 0,
            nonJobRevenue: 0,
            adjustmentRevenue: 0,
            opportunities: 0,
            convertedJobs: 0,
            conversionRate: 0,
          };

      const productivity = productivityByName.get(key);
      if (productivity) {
        merged.productivity = productivity.productivity;
      }

      const sales = salesByName.get(key);
      if (sales) {
        merged.sales = sales.sales;
      }

      return merged;
    })
    .sort((left, right) => right.totalRevenue - left.totalRevenue || left.name.localeCompare(right.name));
}

function hasProductivity(
  businessUnit: BURevenue,
): businessUnit is BURevenue & { productivity: BUProductivity } {
  return businessUnit.productivity !== undefined;
}

function hasSales(businessUnit: BURevenue): businessUnit is BURevenue & { sales: BUSales } {
  return businessUnit.sales !== undefined;
}

function averageBy<T>(items: T[], mapper: (item: T) => number, decimals = 2): number {
  return round(safeDivide(sumBy(items, mapper), items.length), decimals);
}

function paymentAmount(payment: GenericRecord): number {
  const amt = payment.amount ?? payment.total ?? payment.paymentAmount;
  return toNumber(amt);
}

export function registerIntelligenceRevenueTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "intel_revenue_summary",
    domain: "intelligence",
    operation: "read",
    reports: { required: ["175", "179"], optional: ["177"] },
    description:
      "Summarize Report 175 revenue and Report 179 sales for the selected date range, optionally filtered to one business unit. Returns completed, non-job, adjustment, and total revenue plus opportunities, conversion, and sales metrics by business unit; the aggregate reflects returned report rows and is not certified as an all-company total or as matching every tenant dashboard configuration. includeProductivityMetrics adds Report 177 metrics, and includeCollections fetches all payment pages for the period. Report calls are cached briefly and serialized per report/client with at least 65 seconds between starts; a failed source is identified in _warnings and its affected metrics may be empty." +
      '\n\nExamples:\n- "What was our total revenue last month?" -> startDate="2026-02-01", endDate="2026-03-01"\n- "How much did HVAC bring in this quarter?" -> startDate="2026-01-01", endDate="2026-04-01", businessUnitName="HVAC"\n- "Revenue year to date" -> startDate="2026-01-01", endDate="2026-03-10"',
    schema: revenueSummarySchema.shape,
    handler: async (params) => {
      try {
        const input = revenueSummarySchema.parse(params);
        const warnings: string[] = [];

        // Resolve businessUnitName → ID via cache if provided
        const buResolved = await resolveBusinessUnitId(client, input.businessUnitId, input.businessUnitName);
        const effectiveBuId = buResolved.id;
        if (input.businessUnitName && !effectiveBuId) {
          warnings.push(`Business unit "${input.businessUnitName}" not found. Showing all business units.`);
        }
        if (buResolved.resolvedName) {
          warnings.push(`Resolved "${input.businessUnitName}" → ${buResolved.resolvedName} (ID: ${effectiveBuId})`);
        }

        // ── Revenue from ST's native reporting engine (Report 175) ──
        // This uses the same calculation as the ST dashboard.
        // TotalRevenue = CompletedRevenue + NonJobRevenue + AdjustmentRevenue
        const reportParams: { name: string; value: string }[] = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        if (effectiveBuId !== undefined) {
          reportParams.push({
            name: "BusinessUnitIds",
            value: String(effectiveBuId),
          });
        }

        // Compute date range (needed for payments if requested)
        const { startIso, endIso } = toDateRange(input.startDate, input.endDate, registry.timezone);

        // Revenue and sales are always fetched. Productivity and collections are opt-in.
        const reportFetches: [
          Promise<ReportExecution | null>,
          Promise<ReportExecution | null>,
          Promise<ReportExecution | null>,
          Promise<GenericRecord[]>,
        ] = [
          fetchWithWarning(
            warnings,
            "Revenue report (Report 175)",
            () =>
              executeReport(client, "175", reportParams, registry.reportBindings),
            null,
          ),
          input.includeProductivityMetrics
            ? fetchWithWarning(
                warnings,
                "Productivity report (Report 177)",
                () =>
                  executeReport(client, "177", reportParams, registry.reportBindings),
                null,
              )
            : Promise.resolve(null),
          fetchWithWarning(
            warnings,
            "Sales report (Report 179)",
            () =>
              executeReport(client, "179", reportParams, registry.reportBindings),
            null,
          ),
          input.includeCollections
            ? fetchWithWarning(
                warnings,
                "Payment data",
                () =>
                  fetchAllPagesBlind<GenericRecord>(client, "/tenant/{tenant}/payments", {
                    paidOnAfter: startIso,
                    paidOnBefore: endIso,
                    businessUnitIds:
                      effectiveBuId === undefined
                        ? undefined
                        : String(effectiveBuId),
                  }),
                [],
              )
            : Promise.resolve([]),
        ];

        const [reportResponse, productivityReportResponse, salesReportResponse, payments] =
          await Promise.all(reportFetches);

        const revenueRows = parseReportRows(reportResponse);
        const productivityRows = parseProductivityRows(productivityReportResponse);
        const salesRows = parseSalesRows(salesReportResponse);
        const byBU = mergeBusinessUnitReports(revenueRows, productivityRows, salesRows);

        const totalRevenue = round(sumBy(byBU, (bu) => bu.totalRevenue), 2);
        const completedRevenue = round(sumBy(byBU, (bu) => bu.completedRevenue), 2);
        const nonJobRevenue = round(sumBy(byBU, (bu) => bu.nonJobRevenue), 2);
        const adjustmentRevenue = round(sumBy(byBU, (bu) => bu.adjustmentRevenue), 2);
        const totalOpportunities = byBU.reduce((s, bu) => s + bu.opportunities, 0);
        const totalConvertedJobs = byBU.reduce((s, bu) => s + bu.convertedJobs, 0);
        const avgTicket = round(safeDivide(completedRevenue, totalConvertedJobs), 2);
        const overallConversionRate = round(
          safeDivide(totalConvertedJobs, totalOpportunities) * 100,
          1,
        );
        const productivityByBU = byBU.filter(hasProductivity);
        const salesByBU = byBU.filter(hasSales);

        // Collections only computed when explicitly requested
        const totalCollected = input.includeCollections
          ? round(sumBy(payments, paymentAmount), 2)
          : undefined;

        const result: Record<string, unknown> = {
          period: { start: input.startDate, end: input.endDate },
          totalRevenue,
          revenueBreakdown: {
            completedRevenue,
            nonJobRevenue,
            adjustmentRevenue,
          },
          productivity: {
            averageRevenuePerHour: averageBy(
              productivityByBU,
              (bu) => bu.productivity.revenuePerHour,
              2,
            ),
            averageBillableEfficiency: averageBy(
              productivityByBU,
              (bu) => bu.productivity.billableEfficiency,
              3,
            ),
            totalUpsold: round(sumBy(productivityByBU, (bu) => bu.productivity.upsold), 2),
            averageTasksPerOpportunity: averageBy(
              productivityByBU,
              (bu) => bu.productivity.tasksPerOpportunity,
              2,
            ),
            averageOptionsPerOpportunity: averageBy(
              productivityByBU,
              (bu) => bu.productivity.optionsPerOpportunity,
              2,
            ),
            totalRecallsCaused: productivityByBU.reduce(
              (sum, bu) => sum + bu.productivity.recallsCaused,
              0,
            ),
          },
          sales: {
            totalSales: round(sumBy(salesByBU, (bu) => bu.sales.totalSales), 2),
            averageClosedAvgSale: averageBy(salesByBU, (bu) => bu.sales.closedAvgSale, 2),
            averageCloseRate: averageBy(salesByBU, (bu) => bu.sales.closeRate, 1),
            totalSalesOpportunity: salesByBU.reduce(
              (sum, bu) => sum + bu.sales.salesOpportunity,
              0,
            ),
            averageOptionsPerOpportunity: averageBy(
              salesByBU,
              (bu) => bu.sales.optionsPerOpportunity,
              2,
            ),
          },
          paymentsReceivedInPeriod: totalCollected,
          metricDefinitions: {
            paymentsReceivedInPeriod: "Sum of payment amounts whose paidOn timestamp falls in the selected period; it is not accounts-receivable outstanding balance.",
            overallConversionRate: "Converted jobs divided by opportunities across all included business units.",
          },
          avgTicket,
          totalOpportunities,
          totalConvertedJobs,
          overallConversionRate,
          byBusinessUnit: byBU,
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
