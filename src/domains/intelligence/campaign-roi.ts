import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchAllPages,
  fetchWithWarning,
  firstValue,
  getErrorMessage,
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

function campaignId(campaign: GenericRecord): number {
  return toNumber(firstValue(campaign, ["id", "campaignId"]));
}

function campaignName(campaign: GenericRecord, id: number): string {
  return toText(firstValue(campaign, ["name", "campaignName"])) ?? `Campaign ${id}`;
}

function invoiceRevenue(invoice: GenericRecord): number {
  return toNumber(firstValue(invoice, ["total", "amount", "invoiceTotal"]));
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
        const { startIso, endIso } = toDateRange(input.startDate, input.endDate);
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

          const calls = await fetchWithWarning(
            warnings,
            `Call data for ${name}`,
            () =>
              fetchAllPages<GenericRecord>(client, "/v3/tenant/{tenant}/calls", {
                campaignId: id,
                createdOnOrAfter: startIso,
                createdBefore: endIso,
                active: "Any",
              }),
            [],
          );

          const bookings = await fetchWithWarning(
            warnings,
            `Booking data for ${name}`,
            () =>
              fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/bookings", {
                campaignId: id,
                createdOnOrAfter: startIso,
                createdBefore: endIso,
              }),
            [],
          );

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

          const callCount = calls.length;
          const bookingCount = bookings.length;
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
