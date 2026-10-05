import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { executeReport } from "./report-executor.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchWithWarning,
  formatCurrency,
  isRecord,
  round,
  toDateRange,
  toText,
} from "./helpers.js";
import { resolveBusinessUnitId } from "./resolvers.js";

const invoiceTrackingSchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  businessUnitId: z.number().int().optional().describe("Filter by business unit ID"),
  businessUnitName: z.string().optional().describe("Filter by business unit name (resolved via cache, e.g. 'HVAC'). Alternative to businessUnitId."),
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
  amount: number | null;
  businessUnit: string;
  technician: string;
}

interface BreakdownSummary {
  name: string;
  count: number;
  amount: number | null;
}

function numericAmount(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function totalAmount(invoices: InvoiceSummary[]): number | null {
  if (invoices.some(invoice => invoice.amount === null)) return null;
  const total = invoices.reduce((sum, invoice) => sum + (invoice.amount as number), 0);
  return Number.isFinite(total) ? total : null;
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
      amount: numericAmount(row[SENT_FIELD.Amount]),
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
      amount: numericAmount(row[NOT_SENT_FIELD.Amount]),
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
    breakdown.amount = breakdown.amount === null || invoice.amount === null ? null : breakdown.amount + invoice.amount;
    breakdownMap.set(key, breakdown);
  }

  return Array.from(breakdownMap.values())
    .map((breakdown) => ({
      name: breakdown.name,
      count: breakdown.count,
      amount: breakdown.amount === null || !Number.isFinite(breakdown.amount) ? null : breakdown.amount,
    }))
    .sort((a, b) => b.count - a.count || (b.amount ?? 0) - (a.amount ?? 0));
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
      "Track invoice email delivery for the selected date range by combining and deduplicating Reports 2281 and 2282. Returns sent and not-sent counts, send rate, invoice amounts, and unsent breakdowns by business unit and technician; an optional business-unit filter applies to both reports. Unavailable or incomplete deduplicated metrics are null with availability reasons; successful report observations and _warnings are preserved. Report calls may wait for per-report/client spacing." +
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

        const sentInvoices = sentReport ? parseSentInvoices(sentReport) : [];
        const sentInvoiceNumbers = new Set(
          sentInvoices
            .map((invoice) => invoice.invoiceNumber.trim().toLowerCase())
            .filter((n) => n.length > 0),
        );

        // Deduplicate: remove from not-sent any invoice that also appears in sent (by invoice number)
        const notSentRaw = notSentReportRaw ? parseNotSentInvoices(notSentReportRaw) : [];
        const notSentInvoices = notSentRaw.filter((invoice) => {
          const key = invoice.invoiceNumber.trim().toLowerCase();
          return key.length === 0 || !sentInvoiceNumbers.has(key);
        });
        const sentAvailable = sentReport !== null;
        const notSentAvailable = notSentReportRaw !== null;
        const notSentDeduplicationComplete = sentAvailable && notSentAvailable;
        const sourceAvailability = {
          invoicesSent: sentAvailable ? { status: "complete" } : { status: "failed", reason: "Invoices sent report unavailable." },
          invoicesNotSent: notSentAvailable ? { status: "complete" } : { status: "failed", reason: "Invoices not sent report unavailable." },
        };
        const metricAvailability: Record<string, { available: boolean; reason?: string }> = {};
        const metric = <T>(key: string, value: T | null, reason: string): T | null => {
          metricAvailability[key] = value === null ? { available: false, reason } : { available: true };
          return value;
        };
        const sentCount = metric("sentCount", sentAvailable ? sentInvoices.length : null, "Invoices sent report unavailable.");
        const notSentCount = metric("notSentCount", notSentDeduplicationComplete ? notSentInvoices.length : null, "Both invoice reports are required to deduplicate not-sent invoices.");
        const totalInvoices = metric("totalInvoices", sentCount !== null && notSentCount !== null ? sentCount + notSentCount : null, "Both invoice reports are required for the combined invoice count.");
        const totalAmountSent = metric("totalAmountSent", sentAvailable ? totalAmount(sentInvoices) : null, sentAvailable ? "One or more sent invoice amounts are missing or invalid." : "Invoices sent report unavailable.");
        const totalAmountNotSent = metric("totalAmountNotSent", notSentDeduplicationComplete ? totalAmount(notSentInvoices) : null, notSentDeduplicationComplete ? "One or more not-sent invoice amounts are missing or invalid." : "Both invoice reports are required to deduplicate not-sent invoice amounts.");
        const sendRate = metric("sendRate", totalInvoices !== null && totalInvoices > 0 && sentCount !== null ? round(sentCount / totalInvoices * 100, 1) : null,
          totalInvoices === null ? "Both invoice reports are required for a send-rate denominator." : "No invoices provide a send-rate denominator.");

        const byBusinessUnit = buildBreakdown(
          notSentInvoices,
          (invoice) => invoice.businessUnit,
        );
        const byTechnician = buildBreakdown(notSentInvoices, (invoice) => invoice.technician);

        const topBusinessUnit = byBusinessUnit[0];
        const topTechnician = byTechnician[0];

        const highlights = !notSentDeduplicationComplete
          ? [sentAvailable ? `${sentCount} sent invoices observed; not-sent coverage unavailable.` : notSentAvailable ? `${notSentRaw.length} invoice observations returned by the not-sent report; sent-source deduplication unavailable.` : "Invoice delivery data unavailable."]
          : totalInvoices === 0
            ? ["No invoices returned by either report for the period."]
            : notSentCount === 0
            ? [`All ${sentCount} invoices in the period were sent.`]
            : [
                `${sentCount} of ${totalInvoices} invoices were sent (${sendRate}%).`,
                topBusinessUnit
                  ? `${topBusinessUnit.name} has ${topBusinessUnit.count} unsent invoices${topBusinessUnit.amount === null ? "; amount unavailable" : ` totaling $${formatCurrency(topBusinessUnit.amount)}`}.`
                  : "No business unit breakdown available for unsent invoices.",
                topTechnician
                  ? `${topTechnician.name} owns ${topTechnician.count} unsent invoices${topTechnician.amount === null ? "; amount unavailable" : ` totaling $${formatCurrency(topTechnician.amount)}`}.`
                  : "No technician breakdown available for unsent invoices.",
              ];

        const result: Record<string, unknown> = {
          period: {
            start: input.startDate,
            end: input.endDate,
          },
          sentCount,
          notSentCount,
          totalInvoices,
          sendRate,
          totalAmountSent,
          totalAmountNotSent,
          notSentBreakdown: metric("notSentBreakdown", notSentDeduplicationComplete ? {
            byBusinessUnit,
            byTechnician,
          } : null, "Both invoice reports are required to deduplicate not-sent breakdowns."),
          reportedNotSentCount: metric("reportedNotSentCount", notSentAvailable ? notSentRaw.length : null, "Invoices not sent report unavailable."),
          reportedNotSentAmount: metric("reportedNotSentAmount", notSentAvailable ? totalAmount(notSentRaw) : null, notSentAvailable ? "One or more not-sent report amounts are missing or invalid." : "Invoices not sent report unavailable."),
          reportedNotSentBreakdown: metric("reportedNotSentBreakdown", notSentAvailable ? {
            byBusinessUnit: buildBreakdown(notSentRaw, invoice => invoice.businessUnit),
            byTechnician: buildBreakdown(notSentRaw, invoice => invoice.technician),
          } : null, "Invoices not sent report unavailable."),
          notSentDeduplicationComplete,
          highlights,
          _sourceAvailability: sourceAvailability,
          _metricAvailability: metricAvailability,
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
