import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchAllPages,
  fetchAllPagesParallel,
  fetchWithWarning,
  getErrorMessage,
  isRecord,
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
});

type GenericRecord = Record<string, unknown>;

/**
 * Revenue report field indices (Report 175: "Revenue" under business-unit-dashboard).
 * This is ServiceTitan's native revenue calculation — matches the dashboard exactly.
 *
 * TotalRevenue = CompletedRevenue + NonJobRevenue + AdjustmentRevenue
 */
const FIELD = {
  Name: 0,
  CompletedRevenue: 1,
  OpportunityJobAverage: 2,
  OpportunityConversionRate: 3,
  Opportunity: 4,
  ConvertedJobs: 5,
  CustomerSatisfaction: 6,
  AdjustmentRevenue: 7,
  TotalRevenue: 8,
  NonJobRevenue: 9,
} as const;

const PRODUCTIVITY_FIELD = {
  Name: 0,
  RevenuePerHour: 1,
  BillableEfficiency: 2,
  Upsold: 3,
  TasksPerOpportunity: 4,
  OptionsPerOpportunity: 5,
  RecallsCaused: 6,
  AdjustmentRevenue: 7,
  TotalRevenue: 8,
  NonJobRevenue: 9,
} as const;

const SALES_FIELD = {
  Name: 0,
  TotalSales: 1,
  ClosedAverageSale: 2,
  CloseRate: 3,
  SalesOpportunity: 4,
  OptionsPerOpportunity: 5,
  AdjustmentRevenue: 6,
  TotalRevenue: 7,
  NonJobRevenue: 8,
} as const;

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

function extractReportRows(response: unknown): unknown[][] {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    return [];
  }

  return response.data.filter(Array.isArray);
}

function parseReportRows(response: unknown): BURevenue[] {
  const rows = extractReportRows(response);
  const results: BURevenue[] = [];

  for (const row of rows) {
    const totalRevenue = toNumber(row[FIELD.TotalRevenue]);
    const completedRevenue = toNumber(row[FIELD.CompletedRevenue]);

    // Skip BUs with zero activity
    if (totalRevenue === 0 && completedRevenue === 0) continue;

    results.push({
      name: String(row[FIELD.Name] ?? "Unknown"),
      totalRevenue: round(totalRevenue, 2),
      completedRevenue: round(completedRevenue, 2),
      nonJobRevenue: round(toNumber(row[FIELD.NonJobRevenue]), 2),
      adjustmentRevenue: round(toNumber(row[FIELD.AdjustmentRevenue]), 2),
      opportunities: Math.round(toNumber(row[FIELD.Opportunity])),
      convertedJobs: Math.round(toNumber(row[FIELD.ConvertedJobs])),
      conversionRate: round(toNumber(row[FIELD.OpportunityConversionRate]) * 100, 1),
    });
  }

  return results.sort((a, b) => b.totalRevenue - a.totalRevenue);
}

function hasAnyProductivityActivity(row: unknown[]): boolean {
  return (
    toNumber(row[PRODUCTIVITY_FIELD.RevenuePerHour]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.BillableEfficiency]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.Upsold]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.TasksPerOpportunity]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.OptionsPerOpportunity]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.RecallsCaused]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.AdjustmentRevenue]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.TotalRevenue]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.NonJobRevenue]) !== 0
  );
}

function parseProductivityRows(response: unknown): BUProductivityRow[] {
  const rows = extractReportRows(response);
  const results: BUProductivityRow[] = [];

  for (const row of rows) {
    if (!hasAnyProductivityActivity(row)) {
      continue;
    }

    results.push({
      name: String(row[PRODUCTIVITY_FIELD.Name] ?? "Unknown"),
      productivity: {
        revenuePerHour: round(toNumber(row[PRODUCTIVITY_FIELD.RevenuePerHour]), 2),
        billableEfficiency: round(toNumber(row[PRODUCTIVITY_FIELD.BillableEfficiency]), 3),
        upsold: round(toNumber(row[PRODUCTIVITY_FIELD.Upsold]), 2),
        tasksPerOpportunity: round(toNumber(row[PRODUCTIVITY_FIELD.TasksPerOpportunity]), 2),
        optionsPerOpportunity: round(
          toNumber(row[PRODUCTIVITY_FIELD.OptionsPerOpportunity]),
          2,
        ),
        recallsCaused: Math.round(toNumber(row[PRODUCTIVITY_FIELD.RecallsCaused])),
      },
    });
  }

  return results;
}

function hasAnySalesActivity(row: unknown[]): boolean {
  return (
    toNumber(row[SALES_FIELD.TotalSales]) !== 0 ||
    toNumber(row[SALES_FIELD.ClosedAverageSale]) !== 0 ||
    toNumber(row[SALES_FIELD.CloseRate]) !== 0 ||
    toNumber(row[SALES_FIELD.SalesOpportunity]) !== 0 ||
    toNumber(row[SALES_FIELD.OptionsPerOpportunity]) !== 0 ||
    toNumber(row[SALES_FIELD.AdjustmentRevenue]) !== 0 ||
    toNumber(row[SALES_FIELD.TotalRevenue]) !== 0 ||
    toNumber(row[SALES_FIELD.NonJobRevenue]) !== 0
  );
}

function parseSalesRows(response: unknown): BUSalesRow[] {
  const rows = extractReportRows(response);
  const results: BUSalesRow[] = [];

  for (const row of rows) {
    if (!hasAnySalesActivity(row)) {
      continue;
    }

    results.push({
      name: String(row[SALES_FIELD.Name] ?? "Unknown"),
      sales: {
        totalSales: round(toNumber(row[SALES_FIELD.TotalSales]), 2),
        closedAvgSale: round(toNumber(row[SALES_FIELD.ClosedAverageSale]), 2),
        closeRate: round(toNumber(row[SALES_FIELD.CloseRate]) * 100, 1),
        salesOpportunity: Math.round(toNumber(row[SALES_FIELD.SalesOpportunity])),
        optionsPerOpportunity: round(toNumber(row[SALES_FIELD.OptionsPerOpportunity]), 2),
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
  const productivityByName = buildBusinessUnitMap(productivityRows);
  const salesByName = buildBusinessUnitMap(salesRows);

  return revenueRows.map((revenueRow) => {
    const key = normalizeBusinessUnitName(revenueRow.name);
    const merged: BURevenue = { ...revenueRow };

    const productivity = productivityByName.get(key);
    if (productivity) {
      merged.productivity = productivity.productivity;
    }

    const sales = salesByName.get(key);
    if (sales) {
      merged.sales = sales.sales;
    }

    return merged;
  });
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
    description:
      "Revenue summary using ServiceTitan's native reporting engine (matches the ST dashboard). Returns total revenue, breakdown by business unit (completed, non-job, adjustment), collections, outstanding balance, opportunities, conversion rates, plus BU-level productivity and sales metrics." +
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

        // Compute date range for payments (needed alongside reports)
        const { startIso, endIso } = toDateRange(input.startDate, input.endDate, registry.timezone);

        // Parallelize ALL fetches — 3 reports + payments are independent
        const [reportResponse, productivityReportResponse, salesReportResponse, payments] =
          await Promise.all([
            fetchWithWarning(
              warnings,
              "Revenue report (Report 175)",
              () =>
                client.post(
                  "/tenant/{tenant}/report-category/business-unit-dashboard/reports/175/data",
                  { parameters: reportParams },
                ),
              null,
            ),
            fetchWithWarning(
              warnings,
              "Productivity report (Report 177)",
              () =>
                client.post(
                  "/tenant/{tenant}/report-category/business-unit-dashboard/reports/177/data",
                  { parameters: reportParams },
                ),
              null,
            ),
            fetchWithWarning(
              warnings,
              "Sales report (Report 179)",
              () =>
                client.post(
                  "/tenant/{tenant}/report-category/business-unit-dashboard/reports/179/data",
                  { parameters: reportParams },
                ),
              null,
            ),
            fetchWithWarning(
              warnings,
              "Payment data",
              () =>
                fetchAllPagesParallel<GenericRecord>(client, "/tenant/{tenant}/payments", {
                  paidOnAfter: startIso,
                  paidOnBefore: endIso,
                  businessUnitIds:
                    effectiveBuId === undefined
                      ? undefined
                      : String(effectiveBuId),
                }),
              [],
            ),
          ]);

        const revenueRows = reportResponse ? parseReportRows(reportResponse) : [];
        const productivityRows = productivityReportResponse
          ? parseProductivityRows(productivityReportResponse)
          : [];
        const salesRows = salesReportResponse ? parseSalesRows(salesReportResponse) : [];
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

        const totalCollected = round(sumBy(payments, paymentAmount), 2);
        const outstanding = round(totalRevenue - totalCollected, 2);

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
          totalCollected,
          outstanding,
          avgTicket,
          totalOpportunities,
          totalConvertedJobs,
          overallConversionRate,
          byBusinessUnit: byBU,
        };

        if (warnings.length > 0) {
          result._warnings = warnings;
        }

        return toolResult(result);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
