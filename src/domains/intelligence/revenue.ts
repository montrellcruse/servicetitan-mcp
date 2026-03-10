import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchAllPages,
  fetchWithWarning,
  getErrorMessage,
  isRecord,
  round,
  safeDivide,
  sumBy,
  toDateRange,
  toNumber,
} from "./helpers.js";

const revenueSummarySchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  businessUnitId: z.number().int().optional().describe("Filter by business unit ID"),
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

interface BURevenue {
  name: string;
  totalRevenue: number;
  completedRevenue: number;
  nonJobRevenue: number;
  adjustmentRevenue: number;
  opportunities: number;
  convertedJobs: number;
  conversionRate: number;
}

function parseReportRows(response: unknown): BURevenue[] {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    return [];
  }

  const results: BURevenue[] = [];

  for (const row of response.data) {
    if (!Array.isArray(row)) continue;

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
      "Revenue summary using ServiceTitan's native reporting engine (matches the ST dashboard). Returns total revenue, breakdown by business unit (completed, non-job, adjustment), collections, outstanding balance, opportunities, and conversion rates." +
      '\n\nExamples:\n- "What was our total revenue last month?" -> startDate="2026-02-01", endDate="2026-03-01"\n- "How much did HVAC bring in this quarter?" -> startDate="2026-01-01", endDate="2026-04-01", businessUnitId=<HVAC BU ID>\n- "Revenue year to date" -> startDate="2026-01-01", endDate="2026-03-10"',
    schema: revenueSummarySchema.shape,
    handler: async (params) => {
      try {
        const input = revenueSummarySchema.parse(params);
        const warnings: string[] = [];

        // ── Revenue from ST's native reporting engine (Report 175) ──
        // This uses the same calculation as the ST dashboard.
        // TotalRevenue = CompletedRevenue + NonJobRevenue + AdjustmentRevenue
        const reportParams: { name: string; value: string }[] = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        if (input.businessUnitId !== undefined) {
          reportParams.push({
            name: "BusinessUnitIds",
            value: String(input.businessUnitId),
          });
        }

        const reportResponse = await fetchWithWarning(
          warnings,
          "Revenue report (Report 175)",
          () =>
            client.post(
              "/tenant/{tenant}/report-category/business-unit-dashboard/reports/175/data",
              { parameters: reportParams },
            ),
          null,
        );

        const byBU = reportResponse ? parseReportRows(reportResponse) : [];

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

        // ── Payments for collections data ──
        const { startIso, endIso } = toDateRange(input.startDate, input.endDate, registry.timezone);

        const payments = await fetchWithWarning(
          warnings,
          "Payment data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/payments", {
              paidOnAfter: startIso,
              paidOnBefore: endIso,
              businessUnitIds:
                input.businessUnitId === undefined
                  ? undefined
                  : String(input.businessUnitId),
            }),
          [],
        );

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
