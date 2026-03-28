import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchAllPages,
  fetchAllPagesParallel,
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

const membershipHealthSchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
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
  activeAtEnd: number;
  newSales: number;
  canceled: number;
  expired: number;
  renewed: number;
  suspended: number;
  reactivated: number;
  deleted: number;
}

interface BusinessUnitMembershipConversion {
  name: string;
  opportunities: number;
  converted: number;
  conversionRate: number;
}

function extractReportRows(response: unknown): unknown[][] {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    return [];
  }

  return response.data.filter(Array.isArray);
}

function parseCount(value: unknown): number {
  return Math.round(toNumber(value));
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

    if (opportunities === 0 && converted === 0) {
      continue;
    }

    conversions.push({
      name: toText(row[MEMBERSHIP_CONVERSION_FIELD.Name]) ?? "Unknown",
      opportunities,
      converted,
      conversionRate: round(toNumber(row[MEMBERSHIP_CONVERSION_FIELD.ConversionRate]) * 100, 1),
    });
  }

  return conversions.sort(
    (left, right) =>
      right.opportunities - left.opportunities || right.converted - left.converted,
  );
}

function invoiceTotal(invoice: GenericRecord): number {
  return toNumber(firstValue(invoice, ["total", "amount", "invoiceTotal"]));
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
      "Membership health summary with active counts, signups, cancellations, renewals, retention rate, total invoiced revenue, and business-unit membership conversion metrics" +
      '\n\nExamples:\n- "How are memberships doing this year?" -> startDate="2026-01-01", endDate="2026-03-10"\n- "Membership retention rate last quarter" -> startDate="2025-10-01", endDate="2026-01-01"\n- "How many new signups vs cancellations?" -> startDate="2026-01-01", endDate="2026-03-10"',
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
        const [membershipSummaryReport, membershipConversionReport, invoices] =
          await Promise.all([
            fetchWithWarning(
              warnings,
              "Membership summary report (Report 182)",
              () =>
                client.post("/tenant/{tenant}/report-category/marketing/reports/182/data", {
                  parameters: reportParams,
                }),
              null,
            ),
            fetchWithWarning(
              warnings,
              "Business unit memberships report (Report 178)",
              () =>
                client.post(
                  "/tenant/{tenant}/report-category/business-unit-dashboard/reports/178/data",
                  {
                    parameters: reportParams,
                  },
                ),
              null,
            ),
            fetchWithWarning(
              warnings,
              "Invoice data",
              () =>
                fetchAllPagesParallel<GenericRecord>(client, "/tenant/{tenant}/invoices", {
                  invoicedOnOrAfter: startIso,
                  invoicedOnBefore: endIso,
                }),
              [],
            ),
          ]);

        const membershipTypeStats = membershipSummaryReport
          ? parseMembershipSummaryReport(membershipSummaryReport)
          : [];
        const conversionByBusinessUnit = membershipConversionReport
          ? parseMembershipConversionReport(membershipConversionReport)
          : [];
        const totalRevenue = round(sumBy(invoices, invoiceTotal), 2);

        const activeMemberships = Math.round(sumBy(membershipTypeStats, (type) => type.activeAtEnd));
        const newSignups = Math.round(sumBy(membershipTypeStats, (type) => type.newSales));
        const cancellations = Math.round(sumBy(membershipTypeStats, (type) => type.canceled));
        const expirations = Math.round(sumBy(membershipTypeStats, (type) => type.expired));
        const renewals = Math.round(sumBy(membershipTypeStats, (type) => type.renewed));
        const suspended = Math.round(sumBy(membershipTypeStats, (type) => type.suspended));
        const reactivated = Math.round(sumBy(membershipTypeStats, (type) => type.reactivated));
        const deleted = Math.round(sumBy(membershipTypeStats, (type) => type.deleted));
        const conversionOpportunities = Math.round(
          sumBy(conversionByBusinessUnit, (businessUnit) => businessUnit.opportunities),
        );
        const convertedMemberships = Math.round(
          sumBy(conversionByBusinessUnit, (businessUnit) => businessUnit.converted),
        );

        const membershipTypes = membershipTypeStats
          .map((type) => ({
            name: type.name,
            activeAtEnd: type.activeAtEnd,
            newSales: type.newSales,
            canceled: type.canceled,
            expired: type.expired,
            renewed: type.renewed,
            suspended: type.suspended,
            reactivated: type.reactivated,
          }))
          .sort((a, b) => b.activeAtEnd - a.activeAtEnd);

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
          retentionRate: round(
            safeDivide(activeMemberships - cancellations, activeMemberships),
            3,
          ),
          totalRevenue,
          conversionTotals: {
            opportunities: conversionOpportunities,
            converted: convertedMemberships,
            conversionRate: round(
              safeDivide(convertedMemberships, conversionOpportunities) * 100,
              1,
            ),
          },
          conversionByBusinessUnit,
          membershipTypes,
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
