import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  asArray,
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

const revenueSummarySchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  businessUnitId: z.number().int().optional().describe("Filter by business unit"),
});

type GenericRecord = Record<string, unknown>;

function invoiceTotal(invoice: GenericRecord): number {
  return toNumber(firstValue(invoice, ["total", "amount", "invoiceTotal"]));
}

function paymentAmount(payment: GenericRecord): number {
  return toNumber(firstValue(payment, ["amount", "total", "paymentAmount"]));
}

function lineItemRevenue(item: GenericRecord): number {
  const directTotal = toNumber(firstValue(item, ["total", "amount", "price"]));
  if (directTotal > 0) {
    return directTotal;
  }

  const quantity = toNumber(firstValue(item, ["quantity", "qty"]));
  const unitPrice = toNumber(firstValue(item, ["unitPrice", "unitRate", "rate"]));

  if (quantity > 0 && unitPrice > 0) {
    return quantity * unitPrice;
  }

  return 0;
}

function lineItemName(item: GenericRecord): string {
  return (
    toText(firstValue(item, ["name", "description", "displayName", "skuName", "itemName"])) ??
    "Unknown"
  );
}

export function registerIntelligenceRevenueTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "intel_revenue_summary",
    domain: "intelligence",
    operation: "read",
    description:
      "Revenue summary for a date range: invoiced totals, collected totals, outstanding balance, average ticket, and top services by revenue",
    schema: revenueSummarySchema.shape,
    handler: async (params) => {
      try {
        const input = revenueSummarySchema.parse(params);
        const { startIso, endIso } = toDateRange(input.startDate, input.endDate);
        const warnings: string[] = [];

        const invoices = await fetchWithWarning(
          warnings,
          "Invoice data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/invoices", {
              invoicedOnOrAfter: startIso,
              invoicedOnBefore: endIso,
              businessUnitId: input.businessUnitId,
            }),
          [],
        );

        const payments = await fetchWithWarning(
          warnings,
          "Payment data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/payments", {
              paidOnAfter: startIso,
              paidOnBefore: endIso,
              businessUnitIds:
                input.businessUnitId === undefined ? undefined : String(input.businessUnitId),
            }),
          [],
        );

        const totalInvoiced = round(sumBy(invoices, invoiceTotal), 2);
        const totalCollected = round(sumBy(payments, paymentAmount), 2);
        const invoiceCount = invoices.length;
        const outstanding = round(totalInvoiced - totalCollected, 2);
        const averageTicket = round(safeDivide(totalInvoiced, invoiceCount), 2);

        const byService = new Map<string, { revenue: number; count: number }>();

        for (const invoice of invoices) {
          const items = asArray<GenericRecord>(
            firstValue(invoice, ["items", "invoiceItems", "lineItems"]),
          );

          for (const item of items) {
            const revenue = lineItemRevenue(item);
            if (revenue <= 0) {
              continue;
            }

            const name = lineItemName(item);
            const current = byService.get(name) ?? { revenue: 0, count: 0 };
            current.revenue += revenue;
            current.count += 1;
            byService.set(name, current);
          }
        }

        const topServicesByRevenue = Array.from(byService.entries())
          .map(([name, data]) => ({
            name,
            revenue: round(data.revenue, 2),
            count: data.count,
          }))
          .sort((a, b) => {
            if (b.revenue !== a.revenue) {
              return b.revenue - a.revenue;
            }

            return b.count - a.count;
          })
          .slice(0, 10);

        const result: Record<string, unknown> = {
          period: {
            start: input.startDate,
            end: input.endDate,
          },
          totalInvoiced,
          totalCollected,
          outstanding,
          invoiceCount,
          averageTicket,
          topServicesByRevenue,
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
