import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchAllPages,
  fetchAllPagesBlind,
  fetchWithWarning,
  firstValue,
  getErrorMessage,
  isRecord,
  round,
  safeDivide,
  sumBy,
  toDateRange,
  toNumber,
  toText,
} from "./helpers.js";
import { sumReport175TotalRevenue } from "./revenue.js";

const campaignPerformanceSchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  campaignId: z.number().int().optional().describe("Single campaign (omit for all)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max campaigns to analyze (default 20, max 50)."),
});

type GenericRecord = Record<string, unknown>;

const LEAD_GENERATION_FIELD = {
  Name: 0,
  LeadGenerationOpportunity: 1,
  LeadsSet: 2,
  LeadConversionRate: 3,
  AverageLeadSale: 4,
  ReplacementOpportunity: 5,
  ReplacementLeadsSet: 6,
  ReplacementLeadConversionRate: 7,
  MembershipSales: 8,
  AdjustmentRevenue: 9,
  TotalRevenue: 10,
  NonJobRevenue: 11,
} as const;

interface LeadGenerationByBusinessUnit {
  name: string;
  leadGenerationOpportunity: number;
  leadsSet: number;
  leadConversionRate: number;
  averageLeadSale: number;
  replacementOpportunity: number;
  replacementLeadsSet: number;
  replacementLeadConversionRate: number;
  membershipSales: number;
  adjustmentRevenue: number;
  totalRevenue: number;
  nonJobRevenue: number;
}

const PER_CAMPAIGN_REVENUE_WARNING =
  "Per-campaign revenue unavailable (ServiceTitan invoices API does not support campaign-level filtering). Total period revenue shown in totals only.";

function campaignId(campaign: GenericRecord): number {
  return toNumber(firstValue(campaign, ["id", "campaignId"]));
}

function campaignName(campaign: GenericRecord, id: number): string {
  return toText(firstValue(campaign, ["name", "campaignName"])) ?? `Campaign ${id}`;
}

// Revenue now comes from Report 175, not invoice pagination

function recordCampaignId(source: GenericRecord): number {
  return Math.round(toNumber(firstValue(source, ["campaignId", "campaign.id", "leadCall.campaign.id"])));
}

function countByCampaign(records: GenericRecord[]): Map<number, number> {
  const result = new Map<number, number>();

  for (const record of records) {
    const id = recordCampaignId(record);
    if (id <= 0) {
      continue;
    }

    result.set(id, (result.get(id) ?? 0) + 1);
  }

  return result;
}

function extractReportRows(response: unknown): unknown[][] {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    return [];
  }

  return response.data.filter(Array.isArray);
}

function hasAnyLeadActivity(bu: LeadGenerationByBusinessUnit): boolean {
  return (
    bu.leadGenerationOpportunity !== 0 ||
    bu.leadsSet !== 0 ||
    bu.replacementOpportunity !== 0 ||
    bu.replacementLeadsSet !== 0 ||
    bu.membershipSales !== 0 ||
    bu.totalRevenue !== 0
  );
}

function parseLeadGenerationReport(response: unknown): LeadGenerationByBusinessUnit[] {
  const rows = extractReportRows(response);
  const result: LeadGenerationByBusinessUnit[] = [];

  for (const row of rows) {
    const bu: LeadGenerationByBusinessUnit = {
      name: toText(row[LEAD_GENERATION_FIELD.Name]) ?? "Unknown",
      leadGenerationOpportunity: Math.round(
        toNumber(row[LEAD_GENERATION_FIELD.LeadGenerationOpportunity]),
      ),
      leadsSet: Math.round(toNumber(row[LEAD_GENERATION_FIELD.LeadsSet])),
      leadConversionRate: round(toNumber(row[LEAD_GENERATION_FIELD.LeadConversionRate]), 3),
      averageLeadSale: round(toNumber(row[LEAD_GENERATION_FIELD.AverageLeadSale]), 2),
      replacementOpportunity: Math.round(
        toNumber(row[LEAD_GENERATION_FIELD.ReplacementOpportunity]),
      ),
      replacementLeadsSet: Math.round(
        toNumber(row[LEAD_GENERATION_FIELD.ReplacementLeadsSet]),
      ),
      replacementLeadConversionRate: round(
        toNumber(row[LEAD_GENERATION_FIELD.ReplacementLeadConversionRate]),
        3,
      ),
      membershipSales: round(toNumber(row[LEAD_GENERATION_FIELD.MembershipSales]), 2),
      adjustmentRevenue: round(toNumber(row[LEAD_GENERATION_FIELD.AdjustmentRevenue]), 2),
      totalRevenue: round(toNumber(row[LEAD_GENERATION_FIELD.TotalRevenue]), 2),
      nonJobRevenue: round(toNumber(row[LEAD_GENERATION_FIELD.NonJobRevenue]), 2),
    };

    if (hasAnyLeadActivity(bu)) {
      result.push(bu);
    }
  }

  return result;
}

export function registerIntelligenceCampaignPerformanceTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "intel_campaign_performance",
    domain: "intelligence",
    operation: "read",
    description:
      "Marketing campaign performance summary with calls, bookings, conversion rate, revenue, and revenue per call" +
      '\n\nExamples:\n- "Which marketing campaigns are working?" -> startDate="2026-01-01", endDate="2026-03-10"\n- "How many calls are we getting from Google Ads?" -> startDate="2026-01-01", endDate="2026-03-10", campaignId=<Google Ads ID>\n- "What\'s our call-to-booking rate?" -> startDate="2026-01-01", endDate="2026-03-10"',
    schema: campaignPerformanceSchema.shape,
    handler: async (params) => {
      try {
        const input = campaignPerformanceSchema.parse(params);
        const { startIso, endIso } = toDateRange(input.startDate, input.endDate, registry.timezone);
        const warnings: string[] = [];

        const maxCampaigns = input.limit ?? 20;

        // Parallelize all data fetches — independent API calls
        // Report 175 for revenue (single POST vs paginating all invoices)
        const [fetchedCampaigns, calls, bookings, revenueReport, leadGenerationReport] =
          await Promise.all([
            fetchWithWarning(
              warnings,
              "Campaign data",
              () =>
                fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/campaigns", {
                  ids: input.campaignId === undefined ? undefined : String(input.campaignId),
                  active: input.campaignId === undefined ? "Any" : undefined,
                }),
              [],
            ),
            fetchWithWarning(
              warnings,
              "Call data",
              () =>
                fetchAllPagesBlind<GenericRecord>(client, "/v3/tenant/{tenant}/calls", {
                  createdOnOrAfter: startIso,
                  createdBefore: endIso,
                  active: "Any",
                }),
              [],
            ),
            fetchWithWarning(
              warnings,
              "Booking data",
              () =>
                fetchAllPagesBlind<GenericRecord>(client, "/tenant/{tenant}/bookings", {
                  createdOnOrAfter: startIso,
                  createdBefore: endIso,
                }),
              [],
            ),
            fetchWithWarning(
              warnings,
              "Revenue report (Report 175)",
              () =>
                client.post(
                  "/tenant/{tenant}/report-category/business-unit-dashboard/reports/175/data",
                  {
                    parameters: [
                      { name: "From", value: input.startDate },
                      { name: "To", value: input.endDate },
                    ],
                  },
                ),
              null,
            ),
            fetchWithWarning(
              warnings,
              "Lead generation report (Report 176)",
              () =>
                client.post(
                  "/tenant/{tenant}/report-category/business-unit-dashboard/reports/176/data",
                  {
                    parameters: [
                      { name: "From", value: input.startDate },
                      { name: "To", value: input.endDate },
                    ],
                  },
                ),
              null,
            ),
          ]);

        let campaigns =
          fetchedCampaigns.length > 0
            ? fetchedCampaigns
            : input.campaignId === undefined
              ? []
              : [{ id: input.campaignId, name: `Campaign ${input.campaignId}` }];

        const callsByCampaignId = countByCampaign(calls);
        const bookingsByCampaignId = countByCampaign(bookings);
        const leadGeneration = leadGenerationReport
          ? parseLeadGenerationReport(leadGenerationReport)
          : [];

        const campaignRows: Array<{
          id: number;
          name: string;
          calls: number;
          bookings: number;
          conversionRate: number;
          revenue: number;
          revenuePerCall: number;
        }> = [];

        for (const campaign of campaigns) {
          const id = campaignId(campaign);
          if (id <= 0) {
            continue;
          }

          const name = campaignName(campaign, id);

          const callCount = callsByCampaignId.get(id) ?? 0;
          const bookingCount = bookingsByCampaignId.get(id) ?? 0;

          campaignRows.push({
            id,
            name,
            calls: callCount,
            bookings: bookingCount,
            conversionRate: round(safeDivide(bookingCount, callCount), 3),
            revenue: 0,
            revenuePerCall: 0,
          });
        }

        campaignRows.sort((a, b) => b.calls + b.bookings - (a.calls + a.bookings));

        const totalAvailable = campaignRows.length;
        const limitedCampaignRows =
          campaignRows.length > maxCampaigns ? campaignRows.slice(0, maxCampaigns) : campaignRows;
        if (campaignRows.length > maxCampaigns) {
          warnings.push(
            `Limited to ${maxCampaigns} of ${totalAvailable} campaigns. Use 'limit' param to increase (max 50) or 'campaignId' for a specific campaign.`,
          );
        }

        warnings.push(PER_CAMPAIGN_REVENUE_WARNING);

        // Sum calls attributed to campaigns (not all calls — totalCount includes non-campaign)
        const totalsCalls = limitedCampaignRows.reduce((total, row) => total + row.calls, 0);
        const totalsBookings = limitedCampaignRows.reduce((total, row) => total + row.bookings, 0);

        // Extract total revenue from Report 175 instead of paginating all invoices
        const totalsRevenue = revenueReport === null ? 0 : sumReport175TotalRevenue(revenueReport);

        const result: Record<string, unknown> = {
          period: {
            start: input.startDate,
            end: input.endDate,
          },
          campaigns: limitedCampaignRows,
          totals: {
            calls: totalsCalls,
            bookings: totalsBookings,
            conversionRate: round(safeDivide(totalsBookings, totalsCalls), 3),
            revenue: totalsRevenue,
          },
          leadGeneration,
        };

        if (campaignRows.length > maxCampaigns) {
          result.totalsNote =
            "Revenue represents the full period; calls and bookings reflect only the top N listed campaigns.";
        }

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
