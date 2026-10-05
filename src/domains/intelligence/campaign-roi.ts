import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchAllPages,
  fetchAllPagesBlind,
  fetchWithWarning,
  firstValue,
  isRecord,
  round,
  toDateRange,
  toText,
} from "./helpers.js";
import { sumReport175TotalRevenue } from "./revenue.js";
import { executeReport } from "./report-executor.js";

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
  leadGenerationOpportunity: number | null;
  leadsSet: number | null;
  leadConversionRate: number | null;
  averageLeadSale: number | null;
  replacementOpportunity: number | null;
  replacementLeadsSet: number | null;
  replacementLeadConversionRate: number | null;
  membershipSales: number | null;
  adjustmentRevenue: number | null;
  totalRevenue: number | null;
  nonJobRevenue: number | null;
}

function numeric(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bookingRatio(bookings: number | null, calls: number | null): number | null {
  return bookings === null || calls === null || calls === 0 ? null : round(bookings / calls, 3);
}

const PER_CAMPAIGN_REVENUE_WARNING =
  "Per-campaign revenue unavailable (ServiceTitan invoices API does not support campaign-level filtering). Total period revenue shown in totals only.";

function campaignId(campaign: GenericRecord): number {
  const id = numeric(firstValue(campaign, ["id", "campaignId"]));
  return id !== null && Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function campaignName(campaign: GenericRecord, id: number): string {
  return toText(firstValue(campaign, ["name", "campaignName"])) ?? `Campaign ${id}`;
}

// Revenue now comes from Report 175, not invoice pagination

function recordCampaignId(source: GenericRecord): number {
  const id = numeric(firstValue(source, ["campaignId", "campaign.id", "leadCall.campaign.id"]));
  return id !== null && Number.isSafeInteger(id) && id > 0 ? id : 0;
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
    Object.entries(bu).some(([key, value]) => key !== "name" && value !== 0)
  );
}

function parseLeadGenerationReport(response: unknown): LeadGenerationByBusinessUnit[] {
  const rows = extractReportRows(response);
  const result: LeadGenerationByBusinessUnit[] = [];

  for (const row of rows) {
    const bu: LeadGenerationByBusinessUnit = {
      name: toText(row[LEAD_GENERATION_FIELD.Name]) ?? "Unknown",
      leadGenerationOpportunity: numeric(row[LEAD_GENERATION_FIELD.LeadGenerationOpportunity]),
      leadsSet: numeric(row[LEAD_GENERATION_FIELD.LeadsSet]),
      leadConversionRate: numeric(row[LEAD_GENERATION_FIELD.LeadConversionRate]),
      averageLeadSale: numeric(row[LEAD_GENERATION_FIELD.AverageLeadSale]),
      replacementOpportunity: numeric(row[LEAD_GENERATION_FIELD.ReplacementOpportunity]),
      replacementLeadsSet: numeric(row[LEAD_GENERATION_FIELD.ReplacementLeadsSet]),
      replacementLeadConversionRate: numeric(row[LEAD_GENERATION_FIELD.ReplacementLeadConversionRate]),
      membershipSales: numeric(row[LEAD_GENERATION_FIELD.MembershipSales]),
      adjustmentRevenue: numeric(row[LEAD_GENERATION_FIELD.AdjustmentRevenue]),
      totalRevenue: numeric(row[LEAD_GENERATION_FIELD.TotalRevenue]),
      nonJobRevenue: numeric(row[LEAD_GENERATION_FIELD.NonJobRevenue]),
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
      "Compare campaign-attributed call and booking counts over the selected date range using fetched campaign, call, and booking pages. Bookings per call is an independent-feed ratio, not a matched call-to-booking funnel. Report 175 adds tenant-wide unallocated revenue; per-campaign revenue, revenue per call, and ROI are unavailable. Report 176 adds business-unit lead metrics. campaignId narrows the campaign catalogue; missing feeds and cells return null with availability details." +
      '\n\nExamples:\n- "Which campaigns have call and booking activity?" -> startDate="2026-01-01", endDate="2026-03-10"\n- "How many calls are we getting from Google Ads?" -> startDate="2026-01-01", endDate="2026-03-10", campaignId=<Google Ads ID>\n- "How many independent bookings per campaign call?" -> startDate="2026-01-01", endDate="2026-03-10"',
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
              null,
            ),
            fetchWithWarning(
              warnings,
              "Call data",
              () =>
                fetchAllPages<GenericRecord>(client, "/v3/tenant/{tenant}/calls", {
                  createdOnOrAfter: startIso,
                  createdBefore: endIso,
                  active: "Any",
                }),
              null,
            ),
            fetchWithWarning(
              warnings,
              "Booking data",
              () =>
                fetchAllPagesBlind<GenericRecord>(client, "/tenant/{tenant}/bookings", {
                  createdOnOrAfter: startIso,
                  createdBefore: endIso,
                }),
              null,
            ),
            fetchWithWarning(
              warnings,
              "Revenue report (Report 175)",
              () => executeReport(client, "175", [
                      { name: "From", value: input.startDate },
                      { name: "To", value: input.endDate },
                    ], registry.reportBindings),
              null,
            ),
            fetchWithWarning(
              warnings,
              "Lead generation report (Report 176)",
              () => executeReport(client, "176", [
                      { name: "From", value: input.startDate },
                      { name: "To", value: input.endDate },
                    ], registry.reportBindings),
              null,
            ),
          ]);

        const campaigns = fetchedCampaigns;
        const callsByCampaignId = countByCampaign(calls ?? []);
        const bookingsByCampaignId = countByCampaign(bookings ?? []);
        const leadGeneration = leadGenerationReport
          ? parseLeadGenerationReport(leadGenerationReport)
          : null;

        const campaignRows: Array<{
          id: number;
          name: string;
          calls: number | null;
          bookings: number | null;
          bookingsPerCallRatio: number | null;
          revenue: null;
          revenuePerCall: null;
        }> = [];

        for (const campaign of campaigns ?? []) {
          const id = campaignId(campaign);
          if (id <= 0) {
            continue;
          }

          const name = campaignName(campaign, id);

          const callCount = calls === null ? null : callsByCampaignId.get(id) ?? 0;
          const bookingCount = bookings === null ? null : bookingsByCampaignId.get(id) ?? 0;

          campaignRows.push({
            id,
            name,
            calls: callCount,
            bookings: bookingCount,
            bookingsPerCallRatio: bookingRatio(bookingCount, callCount),
            revenue: null,
            revenuePerCall: null,
          });
        }

        campaignRows.sort((a, b) => (b.calls ?? 0) + (b.bookings ?? 0) - ((a.calls ?? 0) + (a.bookings ?? 0)));

        const totalAvailable = campaignRows.length;
        const limitedCampaignRows =
          campaignRows.length > maxCampaigns ? campaignRows.slice(0, maxCampaigns) : campaignRows;
        if (campaignRows.length > maxCampaigns) {
          warnings.push(
            `Limited to ${maxCampaigns} of ${totalAvailable} campaigns. Use 'limit' param to increase (max 50) or 'campaignId' for a specific campaign.`,
          );
        }

        warnings.push(PER_CAMPAIGN_REVENUE_WARNING);

        const totalsCalls = calls === null || campaigns === null ? null : campaignRows.reduce((total, row) => total + row.calls!, 0);
        const totalsBookings = bookings === null || campaigns === null ? null : campaignRows.reduce((total, row) => total + row.bookings!, 0);
        const unattributedCalls = calls === null || totalsCalls === null ? null : calls.length - totalsCalls;
        const unattributedBookings = bookings === null || totalsBookings === null ? null : bookings.length - totalsBookings;

        // Extract total revenue from Report 175 instead of paginating all invoices
        const totalsRevenue = revenueReport === null ? null : sumReport175TotalRevenue(revenueReport);

        const result: Record<string, unknown> = {
          period: {
            start: input.startDate,
            end: input.endDate,
          },
          campaigns: campaigns === null ? null : limitedCampaignRows,
          totals: {
            calls: totalsCalls,
            bookings: totalsBookings,
            bookingsPerCallRatio: bookingRatio(totalsBookings, totalsCalls),
            unattributedCalls,
            unattributedBookings,
            tenantRevenueForPeriod: totalsRevenue,
          },
          metricDefinitions: {
            bookingsPerCallRatio: "Campaign-attributed bookings divided by campaign-attributed calls; booking attribution is independent and this is not a funnel conversion rate.",
            tenantRevenueForPeriod: "Total tenant revenue for the period from Report 175; it is not attributed to the listed campaigns.",
          },
          leadGeneration,
          _sourceAvailability: {
            campaigns: { status: campaigns === null ? "failed" : "complete" },
            calls: { status: calls === null ? "failed" : "complete" },
            bookings: { status: bookings === null ? "failed" : "complete" },
            revenue: { status: revenueReport === null ? "failed" : "complete" },
            leadGeneration: { status: leadGenerationReport === null ? "failed" : "complete" },
          },
          _metricAvailability: {
            revenue: { available: false, reason: "No campaign-level revenue attribution is consumed; tenant revenue is unallocated." },
            revenuePerCall: { available: false, reason: "No campaign-level revenue attribution is consumed." },
            ...(totalsRevenue === null ? { "totals.tenantRevenueForPeriod": { available: false, reason: "Revenue source or TotalRevenue cells unavailable." } } : {}),
            ...(bookingRatio(totalsBookings, totalsCalls) === null ? { "totals.bookingsPerCallRatio": { available: false, reason: "Call/booking/catalogue coverage or a nonzero call denominator is unavailable." } } : {}),
          },
        };

        if (campaignRows.length > maxCampaigns) {
          result.totalsNote = "Totals include every campaign; the campaigns array is limited to the top N.";
        }

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
