import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { executeReport } from "./report-executor.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchAllPagesBlind,
  fetchWithWarning,
  isRecord,
  round,
  toDateRange,
  toText,
} from "./helpers.js";

const membershipHealthSchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  includeServiceRevenue: z.boolean().optional().default(false).describe("Include tenant-wide invoice totals as totalServiceRevenue by fetching invoice pages for the period; not membership-attributed or service-item-only. Default: false."),
});

const MEMBERSHIP_SUMMARY_FIELD = {
  Name: 0,
  Suspended: 1,
  Canceled: 2,
  Expired: 3,
  Deleted: 4,
  Renewed: 5,
  Reactivated: 6,
  NewSales: 7,
  ActiveAtEnd: 8,
} as const;

const MEMBERSHIP_CONVERSION_FIELD = {
  Name: 0,
  Opportunities: 1,
  Converted: 2,
  ConversionRate: 3,
} as const;

type GenericRecord = Record<string, unknown>;

interface MembershipTypeSummary {
  name: string;
  activeAtEnd: number | null;
  newSales: number | null;
  canceled: number | null;
  expired: number | null;
  renewed: number | null;
  suspended: number | null;
  reactivated: number | null;
  deleted: number | null;
}

interface BusinessUnitMembershipConversion {
  name: string;
  opportunities: number | null;
  converted: number | null;
  conversionRate: number | null;
}

function extractReportRows(response: unknown): unknown[][] {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    return [];
  }

  return response.data.filter(Array.isArray);
}

function numeric(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCount(value: unknown): number | null {
  return numeric(value);
}

function sumKnown(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  const sum = values.reduce<number>((total, value) => total + value!, 0);
  return Number.isFinite(sum) ? sum : null;
}

function hasAnyReportActivity(type: MembershipTypeSummary): boolean {
  return (
    type.activeAtEnd !== 0 ||
    type.newSales !== 0 ||
    type.canceled !== 0 ||
    type.expired !== 0 ||
    type.renewed !== 0 ||
    type.suspended !== 0 ||
    type.reactivated !== 0 ||
    type.deleted !== 0
  );
}

function parseMembershipSummaryReport(response: unknown): MembershipTypeSummary[] {
  const rows = extractReportRows(response);
  const summaries: MembershipTypeSummary[] = [];

  for (const row of rows) {
    const summary: MembershipTypeSummary = {
      name: toText(row[MEMBERSHIP_SUMMARY_FIELD.Name]) ?? "Unknown",
      suspended: parseCount(row[MEMBERSHIP_SUMMARY_FIELD.Suspended]),
      canceled: parseCount(row[MEMBERSHIP_SUMMARY_FIELD.Canceled]),
      expired: parseCount(row[MEMBERSHIP_SUMMARY_FIELD.Expired]),
      deleted: parseCount(row[MEMBERSHIP_SUMMARY_FIELD.Deleted]),
      renewed: parseCount(row[MEMBERSHIP_SUMMARY_FIELD.Renewed]),
      reactivated: parseCount(row[MEMBERSHIP_SUMMARY_FIELD.Reactivated]),
      newSales: parseCount(row[MEMBERSHIP_SUMMARY_FIELD.NewSales]),
      activeAtEnd: parseCount(row[MEMBERSHIP_SUMMARY_FIELD.ActiveAtEnd]),
    };

    if (!hasAnyReportActivity(summary)) {
      continue;
    }

    summaries.push(summary);
  }

  return summaries;
}

function parseMembershipConversionReport(response: unknown): BusinessUnitMembershipConversion[] {
  const rows = extractReportRows(response);
  const conversions: BusinessUnitMembershipConversion[] = [];

  for (const row of rows) {
    const opportunities = parseCount(row[MEMBERSHIP_CONVERSION_FIELD.Opportunities]);
    const converted = parseCount(row[MEMBERSHIP_CONVERSION_FIELD.Converted]);

    const rate = numeric(row[MEMBERSHIP_CONVERSION_FIELD.ConversionRate]);
    if (opportunities === 0 && converted === 0 && rate === 0) {
      continue;
    }

    conversions.push({
      name: toText(row[MEMBERSHIP_CONVERSION_FIELD.Name]) ?? "Unknown",
      opportunities,
      converted,
      conversionRate: rate === null ? null : rate * 100,
    });
  }

  return conversions.sort(
    (left, right) =>
      (right.opportunities ?? 0) - (left.opportunities ?? 0) || (right.converted ?? 0) - (left.converted ?? 0),
  );
}

function invoiceTotal(invoice: GenericRecord): number | null {
  return numeric(invoice.total);
}

export function registerIntelligenceMembershipHealthTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "intel_membership_health",
    domain: "intelligence",
    operation: "read",
    description:
      "Summarize membership activity from Report 182 and business-unit membership opportunities and conversions from Report 178 for the selected date range. Returns active-at-end counts, sales, cancellations, expirations, renewals, other status movements, and conversion metrics; it does not calculate cohort retention. includeServiceRevenue adds tenant-wide invoice totals, not membership-attributed or service-item-only revenue. Missing sources and cells return null with availability details; complete empty-source additive counts are zero." +
      '\n\nExamples:\n- "How are memberships doing this year?" -> startDate="2026-01-01", endDate="2026-03-10"\n- "Show membership status movements last quarter" -> startDate="2025-10-01", endDate="2026-01-01"\n- "How many new signups vs cancellations?" -> startDate="2026-01-01", endDate="2026-03-10"',
    schema: membershipHealthSchema.shape,
    handler: async (params) => {
      try {
        const input = membershipHealthSchema.parse(params);
        const { startIso, endIso } = toDateRange(input.startDate, input.endDate, registry.timezone);
        const warnings: string[] = [];

        const reportParams: Array<{ name: string; value: string }> = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        // Parallelize all data fetches — independent API calls
        // invoices only fetched when includeServiceRevenue=true (opt-in to avoid ~1-2s overhead)
        const fetches: [
          Promise<unknown>,
          Promise<unknown>,
          Promise<GenericRecord[] | null>,
        ] = [
          fetchWithWarning(
            warnings,
            "Membership summary report (Report 182)",
            () =>
              executeReport(client, "182", reportParams, registry.reportBindings),
            null,
          ),
          fetchWithWarning(
            warnings,
            "Business unit memberships report (Report 178)",
            () =>
              executeReport(client, "178", reportParams, registry.reportBindings),
            null,
          ),
          input.includeServiceRevenue
            ? fetchWithWarning(
                warnings,
                "Invoice data",
                () =>
                  // The invoices endpoint supports job/customer/BU filters, but not membership-level
                  // scoping, so this revenue is tenant-wide service revenue for the selected period.
                  fetchAllPagesBlind<GenericRecord>(client, "/tenant/{tenant}/invoices", {
                    invoicedOnOrAfter: startIso,
                    invoicedOnBefore: endIso,
                  }),
                null,
              )
            : Promise.resolve(null),
        ];

        const [membershipSummaryReport, membershipConversionReport, invoices] =
          await Promise.all(fetches);

        const membershipTypeStats = membershipSummaryReport
          ? parseMembershipSummaryReport(membershipSummaryReport)
          : null;
        const conversionByBusinessUnit = membershipConversionReport
          ? parseMembershipConversionReport(membershipConversionReport)
          : null;
        const totalServiceRevenue = invoices === null ? null : sumKnown(invoices.map(invoiceTotal));

        const summaryTotal = (key: Exclude<keyof MembershipTypeSummary, "name">) => membershipTypeStats === null ? null : sumKnown(membershipTypeStats.map((type) => type[key]));
        const activeMemberships = summaryTotal("activeAtEnd");
        const newSignups = summaryTotal("newSales");
        const cancellations = summaryTotal("canceled");
        const expirations = summaryTotal("expired");
        const renewals = summaryTotal("renewed");
        const suspended = summaryTotal("suspended");
        const reactivated = summaryTotal("reactivated");
        const deleted = summaryTotal("deleted");
        const conversionOpportunities = conversionByBusinessUnit === null ? null : sumKnown(conversionByBusinessUnit.map((bu) => bu.opportunities));
        const convertedMemberships = conversionByBusinessUnit === null ? null : sumKnown(conversionByBusinessUnit.map((bu) => bu.converted));
        const activeToCancellationRatio = activeMemberships === null || cancellations === null || activeMemberships + cancellations === 0 ? null : round(activeMemberships / (activeMemberships + cancellations), 3);
        const conversionRate = convertedMemberships === null || conversionOpportunities === null || conversionOpportunities === 0 ? null : round(convertedMemberships / conversionOpportunities * 100, 1);

        const membershipTypes = membershipTypeStats === null ? null : membershipTypeStats
          .map((type) => ({
            name: type.name,
            activeAtEnd: type.activeAtEnd,
            newSales: type.newSales,
            canceled: type.canceled,
            expired: type.expired,
            renewed: type.renewed,
            suspended: type.suspended,
            reactivated: type.reactivated,
            deleted: type.deleted,
          }))
          .sort((a, b) => (b.activeAtEnd ?? 0) - (a.activeAtEnd ?? 0));

        const result: Record<string, unknown> = {
          period: {
            start: input.startDate,
            end: input.endDate,
          },
          activeMemberships,
          newSignups,
          cancellations,
          expirations,
          renewals,
          suspended,
          reactivated,
          deleted,
          activeToCancellationRatio,
          metricDefinitions: {
            activeToCancellationRatio: "Active memberships at period end divided by active-at-end plus cancellations during the period; this is not cohort retention.",
            totalServiceRevenue: "Tenant-wide invoice total values for the period; includes the invoice total's components and is not membership-attributed or restricted to service items.",
          },
          totalServiceRevenue,
          conversionTotals: {
            opportunities: conversionOpportunities,
            converted: convertedMemberships,
            conversionRate,
          },
          conversionByBusinessUnit,
          membershipTypes,
          _sourceAvailability: {
            membershipSummary: { status: membershipSummaryReport === null ? "failed" : "complete" },
            membershipConversion: { status: membershipConversionReport === null ? "failed" : "complete" },
            serviceRevenue: { status: !input.includeServiceRevenue ? "not_requested" : invoices === null ? "failed" : "complete" },
          },
          _metricAvailability: {
            ...(activeToCancellationRatio === null ? { activeToCancellationRatio: { available: false, reason: "Summary source/cells or a nonzero active-plus-cancellation denominator unavailable." } } : {}),
            ...(conversionRate === null ? { "conversionTotals.conversionRate": { available: false, reason: "Conversion source/cells or a nonzero opportunity denominator unavailable." } } : {}),
            ...(totalServiceRevenue === null ? { totalServiceRevenue: { available: false, reason: input.includeServiceRevenue ? "Invoice source or invoice total cells unavailable." : "Optional invoice source not requested." } } : {}),
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
