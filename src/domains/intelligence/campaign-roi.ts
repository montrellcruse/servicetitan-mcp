import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchAllPages,
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
    .describe("Max campaigns to analyze (default 20, max 50). Only active campaigns are included."),
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

function campaignId(campaign: GenericRecord): number {
  return toNumber(firstValue(campaign, ["id", "campaignId"]));
}

function campaignName(campaign: GenericRecord, id: number): string {
  return toText(firstValue(campaign, ["name", "campaignName"])) ?? `Campaign ${id}`;
}

function invoiceRevenue(invoice: GenericRecord): number {
  return toNumber(firstValue(invoice, ["total", "amount", "invoiceTotal"]));
}

function recordCampaignId(source: GenericRecord): number {
  return Math.round(toNumber(firstValue(source, ["campaignId", "campaign.id"])));
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

function parseLeadGenerationReport(response: unknown): LeadGenerationByBusinessUnit[] {
  const rows = extractReportRows(response);
  const result: LeadGenerationByBusinessUnit[] = [];

  for (const row of rows) {
    result.push({
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
    });
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
      "Marketing campaign performance summary with calls, bookings, conversion rate, revenue, and revenue per call",
    schema: campaignPerformanceSchema.shape,
    handler: async (params) => {
      try {
        const input = campaignPerformanceSchema.parse(params);
        const { startIso, endIso } = toDateRange(input.startDate, input.endDate, registry.timezone);
        const warnings: string[] = [];

        const maxCampaigns = input.limit ?? 20;

        const fetchedCampaigns = await fetchWithWarning(
          warnings,
          "Campaign data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/campaigns", {
              ids: input.campaignId === undefined ? undefined : String(input.campaignId),
              active: input.campaignId === undefined ? "True" : "Any",
            }),
          [],
        );

        let campaigns =
          fetchedCampaigns.length > 0
            ? fetchedCampaigns
            : input.campaignId === undefined
              ? []
              : [{ id: input.campaignId, name: `Campaign ${input.campaignId}` }];

        const totalAvailable = campaigns.length;
        if (campaigns.length > maxCampaigns) {
          campaigns = campaigns.slice(0, maxCampaigns);
          warnings.push(
            `Limited to ${maxCampaigns} of ${totalAvailable} active campaigns. Use 'limit' param to increase (max 50) or 'campaignId' for a specific campaign.`,
          );
        }

        const calls = await fetchWithWarning(
          warnings,
          "Call data",
          () =>
            fetchAllPages<GenericRecord>(client, "/v3/tenant/{tenant}/calls", {
              createdOnOrAfter: startIso,
              createdBefore: endIso,
              active: "Any",
            }),
          [],
        );

        const bookings = await fetchWithWarning(
          warnings,
          "Booking data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/bookings", {
              createdOnOrAfter: startIso,
              createdBefore: endIso,
            }),
          [],
        );

        const leadGenerationReport = await fetchWithWarning(
          warnings,
          "Lead generation report (Report 176)",
          () =>
            client.post("/tenant/{tenant}/report-category/business-unit-dashboard/reports/176/data", {
              parameters: [
                { name: "From", value: input.startDate },
                { name: "To", value: input.endDate },
              ],
            }),
          null,
        );

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

          const invoices = await fetchWithWarning(
            warnings,
            `Revenue data for ${name}`,
            () =>
              fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/invoices", {
                campaignId: id,
                invoicedOnOrAfter: startIso,
                invoicedOnBefore: endIso,
              }),
            [],
          );

          const callCount = callsByCampaignId.get(id) ?? 0;
          const bookingCount = bookingsByCampaignId.get(id) ?? 0;
          const revenue = round(sumBy(invoices, invoiceRevenue), 2);

          campaignRows.push({
            id,
            name,
            calls: callCount,
            bookings: bookingCount,
            conversionRate: round(safeDivide(bookingCount, callCount), 3),
            revenue,
            revenuePerCall: round(safeDivide(revenue, callCount), 2),
          });
        }

        const totalsCalls = campaignRows.reduce((total, row) => total + row.calls, 0);
        const totalsBookings = campaignRows.reduce((total, row) => total + row.bookings, 0);
        const totalsRevenue = campaignRows.reduce((total, row) => total + row.revenue, 0);

        const result: Record<string, unknown> = {
          period: {
            start: input.startDate,
            end: input.endDate,
          },
          campaigns: campaignRows,
          totals: {
            calls: totalsCalls,
            bookings: totalsBookings,
            conversionRate: round(safeDivide(totalsBookings, totalsCalls), 3),
            revenue: round(totalsRevenue, 2),
          },
          leadGeneration,
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
