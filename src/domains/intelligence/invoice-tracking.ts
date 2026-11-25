import { z } from "../../schema.js";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { executeReport, type ReportExecution } from "./report-executor.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchWithWarning,
  formatCurrency,
  round,
  safeDivide,
  sumBy,
  toDateRange,
  toNumber,
  toText,
} from "./helpers.js";
import { resolveBusinessUnitId } from "./resolvers.js";

const invoiceTrackingSchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  businessUnitId: z.number().int().optional().describe("Filter by business unit ID"),
  businessUnitName: z.string().optional().describe("Filter by business unit name (resolved via cache, e.g. 'HVAC'). Alternative to businessUnitId."),
});

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

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function parseInvoices(report: ReportExecution | null): InvoiceSummary[] {
  const rows = report?.data ?? [];
  const byInvoiceNumber = new Map<string, InvoiceSummary>();
  const withoutNumber: InvoiceSummary[] = [];

  for (const row of rows) {
    const invoice: InvoiceSummary = {
      invoiceNumber: toText(row.InvoiceNumber) ?? "",
      amount: round(toNumber(row.Amount), 2),
      businessUnit: toText(row.BusinessUnit) ?? "Unknown",
      technician: toText(row.Technician) ?? "Unassigned",
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
    reports: { required: ["2281", "2282"] },
    description:
      "Track invoice email delivery for the selected date range by combining and deduplicating Reports 2281 and 2282. Returns sent and not-sent counts, send rate, invoice amount and balance impact, and unsent breakdowns by business unit and technician; an optional business-unit filter applies to both reports. Report calls may wait for per-report/client spacing, and partial source failures are returned in _warnings." +
      '\n\nExamples:\n- "What percent of invoices were sent this week?" -> startDate="2026-03-02", endDate="2026-03-09"\n- "Which techs are not sending invoices?" -> startDate="2026-01-01", endDate="2026-03-10"\n- "Show invoice send rate for plumbing last month" -> startDate="2026-02-01", endDate="2026-03-01", businessUnitName="Plumbing"',
    schema: invoiceTrackingSchema.shape,
    handler: async (params) => {
      try {
        const input = invoiceTrackingSchema.parse(params);
        toDateRange(input.startDate, input.endDate, registry.timezone);
        const warnings: string[] = [];

        const buResolved = await resolveBusinessUnitId(client, input.businessUnitId, input.businessUnitName);
        const effectiveBuId = buResolved.id;
        if (input.businessUnitName && !effectiveBuId) {
          warnings.push(`Business unit "${input.businessUnitName}" not found. Showing all business units.`);
        }
        if (buResolved.resolvedName) {
          warnings.push(`Resolved "${input.businessUnitName}" → ${buResolved.resolvedName} (ID: ${effectiveBuId})`);
        }

        const baseParams: Array<{ name: string; value: string }> = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        if (effectiveBuId !== undefined) {
          baseParams.push({
            name: "BusinessUnitIds",
            value: String(effectiveBuId),
          });
        }

        // Run both reports in parallel — saves ~1-2s vs sequential
        // Report 2282 runs without ExcludeInvoices since we don't have Report 2281 results yet;
        // overlap is deduplicated in-memory after both complete.
        const [sentReport, notSentReportRaw] = await Promise.all([
          fetchWithWarning(
            warnings,
            "Invoices sent report (Report 2281)",
            () =>
              executeReport(client, "2281", baseParams, registry.reportBindings),
            null,
          ),
          fetchWithWarning(
            warnings,
            "Invoices not sent report (Report 2282)",
            () =>
              executeReport(client, "2282", baseParams, registry.reportBindings),
            null,
          ),
        ]);

        const sentInvoices = parseInvoices(sentReport);
        const sentInvoiceNumbers = new Set(
          sentInvoices
            .map((invoice) => invoice.invoiceNumber.trim().toLowerCase())
            .filter((n) => n.length > 0),
        );

        // Deduplicate: remove from not-sent any invoice that also appears in sent (by invoice number)
        const notSentRaw = parseInvoices(notSentReportRaw);
        const notSentInvoices = notSentRaw.filter((invoice) => {
          const key = invoice.invoiceNumber.trim().toLowerCase();
          return key.length === 0 || !sentInvoiceNumbers.has(key);
        });
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

        return toolResult(result, { shape: true });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
