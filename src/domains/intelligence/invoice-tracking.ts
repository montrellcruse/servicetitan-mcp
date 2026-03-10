import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchWithWarning,
  formatCurrency,
  getErrorMessage,
  isRecord,
  round,
  safeDivide,
  sumBy,
  toDateRange,
  toNumber,
  toText,
} from "./helpers.js";

const invoiceTrackingSchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  businessUnitId: z.number().int().optional().describe("Filter by business unit ID"),
});

const SENT_FIELD = {
  InvoiceNumber: 0,
  Customer: 1,
  EMail: 2,
  Amount: 3,
  InvoiceBalance: 4,
  CustomerBalance: 5,
  Project: 6,
  ProjectEmailed: 7,
  JobNumber: 8,
  JobType: 9,
  BusinessUnit: 10,
  Technician: 11,
  InvoicedOn: 12,
  EmailedOn: 13,
} as const;

const NOT_SENT_FIELD = {
  InvoiceNumber: 0,
  Customer: 1,
  EMail: 2,
  Amount: 3,
  InvoiceBalance: 4,
  CustomerBalance: 5,
  Project: 6,
  ProjectEmailed: 7,
  JobNumber: 8,
  JobType: 9,
  BusinessUnit: 10,
  Technician: 11,
  InvoicedOn: 12,
} as const;

interface InvoiceSummary {
  invoiceNumber: string;
  amount: number;
  businessUnit: string;
  technician: string;
}

interface BreakdownSummary {
  name: string;
  count: number;
  amount: number;
}

function extractReportRows(response: unknown): unknown[][] {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    return [];
  }

  return response.data.filter(Array.isArray);
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function parseSentInvoices(response: unknown): InvoiceSummary[] {
  const rows = extractReportRows(response);
  const byInvoiceNumber = new Map<string, InvoiceSummary>();
  const withoutNumber: InvoiceSummary[] = [];

  for (const row of rows) {
    const invoice: InvoiceSummary = {
      invoiceNumber: toText(row[SENT_FIELD.InvoiceNumber]) ?? "",
      amount: round(toNumber(row[SENT_FIELD.Amount]), 2),
      businessUnit: toText(row[SENT_FIELD.BusinessUnit]) ?? "Unknown",
      technician: toText(row[SENT_FIELD.Technician]) ?? "Unassigned",
    };

    const key = normalizeKey(invoice.invoiceNumber);
    if (key.length === 0) {
      withoutNumber.push(invoice);
      continue;
    }

    if (!byInvoiceNumber.has(key)) {
      byInvoiceNumber.set(key, invoice);
    }
  }

  return [...byInvoiceNumber.values(), ...withoutNumber];
}

function parseNotSentInvoices(response: unknown): InvoiceSummary[] {
  const rows = extractReportRows(response);
  const byInvoiceNumber = new Map<string, InvoiceSummary>();
  const withoutNumber: InvoiceSummary[] = [];

  for (const row of rows) {
    const invoice: InvoiceSummary = {
      invoiceNumber: toText(row[NOT_SENT_FIELD.InvoiceNumber]) ?? "",
      amount: round(toNumber(row[NOT_SENT_FIELD.Amount]), 2),
      businessUnit: toText(row[NOT_SENT_FIELD.BusinessUnit]) ?? "Unknown",
      technician: toText(row[NOT_SENT_FIELD.Technician]) ?? "Unassigned",
    };

    const key = normalizeKey(invoice.invoiceNumber);
    if (key.length === 0) {
      withoutNumber.push(invoice);
      continue;
    }

    if (!byInvoiceNumber.has(key)) {
      byInvoiceNumber.set(key, invoice);
    }
  }

  return [...byInvoiceNumber.values(), ...withoutNumber];
}

function buildBreakdown(
  invoices: InvoiceSummary[],
  selector: (invoice: InvoiceSummary) => string,
): BreakdownSummary[] {
  const breakdownMap = new Map<string, BreakdownSummary>();

  for (const invoice of invoices) {
    const name = selector(invoice);
    const key = normalizeKey(name);
    const breakdown =
      breakdownMap.get(key) ??
      {
        name,
        count: 0,
        amount: 0,
      };

    breakdown.count += 1;
    breakdown.amount += invoice.amount;
    breakdownMap.set(key, breakdown);
  }

  return Array.from(breakdownMap.values())
    .map((breakdown) => ({
      name: breakdown.name,
      count: breakdown.count,
      amount: round(breakdown.amount, 2),
    }))
    .sort((a, b) => b.count - a.count || b.amount - a.amount);
}

export function registerIntelligenceInvoiceTrackingTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "intel_invoice_tracking",
    domain: "intelligence",
    operation: "read",
    description:
      "Invoice email tracking with sent vs not-sent counts, send rate, dollar impact, and unsent breakdown by business unit and technician" +
      '\n\nExamples:\n- "What percent of invoices were sent this week?" -> startDate="2026-03-02", endDate="2026-03-09"\n- "Which techs are not sending invoices?" -> startDate="2026-01-01", endDate="2026-03-10"\n- "Show invoice send rate for plumbing last month" -> startDate="2026-02-01", endDate="2026-03-01", businessUnitId=<Plumbing BU ID>',
    schema: invoiceTrackingSchema.shape,
    handler: async (params) => {
      try {
        const input = invoiceTrackingSchema.parse(params);
        toDateRange(input.startDate, input.endDate, registry.timezone);
        const warnings: string[] = [];

        const baseParams: Array<{ name: string; value: string }> = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        if (input.businessUnitId !== undefined) {
          baseParams.push({
            name: "BusinessUnitIds",
            value: String(input.businessUnitId),
          });
        }

        const sentReport = await fetchWithWarning(
          warnings,
          "Invoices sent report (Report 2281)",
          () =>
            client.post("/tenant/{tenant}/report-category/operations/reports/2281/data", {
              parameters: baseParams,
            }),
          null,
        );

        const sentInvoices = sentReport ? parseSentInvoices(sentReport) : [];
        const excludeInvoiceNumbers = Array.from(
          new Set(
            sentInvoices
              .map((invoice) => invoice.invoiceNumber.trim())
              .filter((invoiceNumber) => invoiceNumber.length > 0),
          ),
        );

        const notSentParams = [...baseParams];
        const excludeInvoicesValue = excludeInvoiceNumbers.join(",");
        if (excludeInvoicesValue.length > 0) {
          if (excludeInvoicesValue.length <= 10_000) {
            notSentParams.push({
              name: "ExcludeInvoices",
              value: excludeInvoicesValue,
            });
          } else {
            warnings.push(
              "ExcludeInvoices omitted because the sent invoice list was too large; not-sent results may include overlap.",
            );
          }
        }

        const notSentReport = await fetchWithWarning(
          warnings,
          "Invoices not sent report (Report 2282)",
          () =>
            client.post("/tenant/{tenant}/report-category/operations/reports/2282/data", {
              parameters: notSentParams,
            }),
          null,
        );

        const notSentInvoices = notSentReport ? parseNotSentInvoices(notSentReport) : [];
        const sentCount = sentInvoices.length;
        const notSentCount = notSentInvoices.length;
        const totalInvoices = sentCount + notSentCount;
        const totalAmountSent = round(sumBy(sentInvoices, (invoice) => invoice.amount), 2);
        const totalAmountNotSent = round(sumBy(notSentInvoices, (invoice) => invoice.amount), 2);
        const sendRate = round(safeDivide(sentCount, totalInvoices) * 100, 1);

        const byBusinessUnit = buildBreakdown(
          notSentInvoices,
          (invoice) => invoice.businessUnit,
        );
        const byTechnician = buildBreakdown(notSentInvoices, (invoice) => invoice.technician);

        const topBusinessUnit = byBusinessUnit[0];
        const topTechnician = byTechnician[0];

        const highlights =
          notSentCount === 0
            ? [`All ${sentCount} invoices in the period were sent.`]
            : [
                `${sentCount} of ${totalInvoices} invoices were sent (${sendRate}%).`,
                topBusinessUnit
                  ? `${topBusinessUnit.name} has ${topBusinessUnit.count} unsent invoices totaling $${formatCurrency(topBusinessUnit.amount)}.`
                  : "No business unit breakdown available for unsent invoices.",
                topTechnician
                  ? `${topTechnician.name} owns ${topTechnician.count} unsent invoices totaling $${formatCurrency(topTechnician.amount)}.`
                  : "No technician breakdown available for unsent invoices.",
              ];

        const result: Record<string, unknown> = {
          period: {
            start: input.startDate,
            end: input.endDate,
          },
          sentCount,
          notSentCount,
          sendRate,
          totalAmountSent,
          totalAmountNotSent,
          notSentBreakdown: {
            byBusinessUnit,
            byTechnician,
          },
          highlights,
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
