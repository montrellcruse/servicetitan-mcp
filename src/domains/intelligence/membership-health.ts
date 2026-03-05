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
  revenue: number;
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
      revenue: 0,
    };

    if (!hasAnyReportActivity(summary)) {
      continue;
    }

    summaries.push(summary);
  }

  return summaries;
}

function normalizeTypeName(name: string): string {
  return name.trim().toLowerCase();
}

function membershipTypeId(source: GenericRecord): number {
  return Math.round(toNumber(firstValue(source, ["membershipTypeId", "membershipType.id", "typeId"])));
}

function invoiceMembershipTypeName(source: GenericRecord): string | null {
  return toText(
    firstValue(source, [
      "membershipType.name",
      "membershipTypeName",
      "membership.name",
      "type.name",
      "typeName",
    ]),
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
      "Membership health summary with active counts, signups, cancellations, renewals, retention rate, and member vs non-member revenue",
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

        const membershipSummaryReport = await fetchWithWarning(
          warnings,
          "Membership summary report (Report 182)",
          () =>
            client.post("/tenant/{tenant}/report-category/marketing/reports/182/data", {
              parameters: reportParams,
            }),
          null,
        );

        const membershipTypeStats = membershipSummaryReport
          ? parseMembershipSummaryReport(membershipSummaryReport)
          : [];

        const invoices = await fetchWithWarning(
          warnings,
          "Invoice data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/invoices", {
              invoicedOnOrAfter: startIso,
              invoicedOnBefore: endIso,
            }),
          [],
        );

        const statsByNormalizedName = new Map<string, MembershipTypeSummary>();
        for (const type of membershipTypeStats) {
          statsByNormalizedName.set(normalizeTypeName(type.name), type);
        }

        const reportTypeNameByInvoiceTypeId = new Map<number, string>();
        for (const invoice of invoices) {
          const typeId = membershipTypeId(invoice);
          if (typeId <= 0 || reportTypeNameByInvoiceTypeId.has(typeId)) {
            continue;
          }

          const typeName = invoiceMembershipTypeName(invoice);
          if (!typeName) {
            continue;
          }

          const normalizedName = normalizeTypeName(typeName);
          if (statsByNormalizedName.has(normalizedName)) {
            reportTypeNameByInvoiceTypeId.set(typeId, normalizedName);
          }
        }

        let memberRevenue = 0;
        let nonMemberRevenue = 0;
        let memberInvoiceCount = 0;
        let nonMemberInvoiceCount = 0;

        for (const invoice of invoices) {
          const total = invoiceTotal(invoice);
          const typeId = membershipTypeId(invoice);
          const isMemberInvoice = typeId > 0 || firstValue(invoice, ["isMember"]) === true;

          if (isMemberInvoice) {
            memberRevenue += total;
            memberInvoiceCount += 1;

            if (typeId > 0) {
              const directName = invoiceMembershipTypeName(invoice);
              const normalizedTypeName =
                directName && statsByNormalizedName.has(normalizeTypeName(directName))
                  ? normalizeTypeName(directName)
                  : reportTypeNameByInvoiceTypeId.get(typeId);

              if (normalizedTypeName) {
                const bucket = statsByNormalizedName.get(normalizedTypeName);
                if (bucket) {
                  bucket.revenue += total;
                }
              }
            }
          } else {
            nonMemberRevenue += total;
            nonMemberInvoiceCount += 1;
          }
        }

        const activeMemberships = Math.round(sumBy(membershipTypeStats, (type) => type.activeAtEnd));
        const newSignups = Math.round(sumBy(membershipTypeStats, (type) => type.newSales));
        const cancellations = Math.round(sumBy(membershipTypeStats, (type) => type.canceled));
        const expirations = Math.round(sumBy(membershipTypeStats, (type) => type.expired));
        const renewals = Math.round(sumBy(membershipTypeStats, (type) => type.renewed));
        const suspended = Math.round(sumBy(membershipTypeStats, (type) => type.suspended));
        const reactivated = Math.round(sumBy(membershipTypeStats, (type) => type.reactivated));
        const deleted = Math.round(sumBy(membershipTypeStats, (type) => type.deleted));

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
            revenue: round(type.revenue, 2),
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
          memberRevenue: round(memberRevenue, 2),
          nonMemberRevenue: round(nonMemberRevenue, 2),
          memberAverageTicket: round(safeDivide(memberRevenue, memberInvoiceCount), 2),
          nonMemberAverageTicket: round(safeDivide(nonMemberRevenue, nonMemberInvoiceCount), 2),
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
