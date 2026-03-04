import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchAllPages,
  fetchWithWarning,
  firstValue,
  getErrorMessage,
  normalizeStatus,
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

type GenericRecord = Record<string, unknown>;

function membershipTypeId(source: GenericRecord): number {
  return toNumber(firstValue(source, ["membershipTypeId", "membershipType.id", "typeId"]));
}

function membershipTypeName(source: GenericRecord, fallbackId: number): string {
  return toText(firstValue(source, ["name", "membershipTypeName"])) ?? `Type ${fallbackId}`;
}

function customerId(source: GenericRecord): number {
  return toNumber(firstValue(source, ["customerId", "customer.id", "id"]));
}

function invoiceTotal(invoice: GenericRecord): number {
  return toNumber(firstValue(invoice, ["total", "amount", "invoiceTotal"]));
}

function isCustomerLikelyMember(customer: GenericRecord): boolean {
  const membershipStatus = normalizeStatus(customer, ["membershipStatus", "membership.status"]);
  if (membershipStatus.includes("active") || membershipStatus.includes("suspended")) {
    return true;
  }

  if (firstValue(customer, ["membershipId", "membershipTypeId", "customerMembershipId"]) !== undefined) {
    return true;
  }

  const memberships = firstValue(customer, ["memberships", "membershipList"]);
  if (Array.isArray(memberships) && memberships.length > 0) {
    return true;
  }

  return firstValue(customer, ["isMember", "hasMembership"]) === true;
}

function isActiveAgreement(status: string): boolean {
  return (
    status.includes("active") ||
    status.includes("activated") ||
    status.includes("autorenew") ||
    status.includes("accepted")
  );
}

function ensureTypeEntry(
  typeStats: Map<number, { name: string; active: number; revenue: number }>,
  id: number,
  fallbackName?: string,
): { name: string; active: number; revenue: number } {
  const existing = typeStats.get(id);
  if (existing) {
    return existing;
  }

  const created = {
    name: fallbackName ?? `Type ${id}`,
    active: 0,
    revenue: 0,
  };
  typeStats.set(id, created);
  return created;
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
        const { startIso, endIso } = toDateRange(input.startDate, input.endDate);
        const warnings: string[] = [];

        const membershipTypes = await fetchWithWarning(
          warnings,
          "Membership type data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/membership-types", {
              active: "Any",
            }),
          [],
        );

        const customers = await fetchWithWarning(
          warnings,
          "Customer data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/customers", {
              active: "Any",
            }),
          [],
        );

        const agreements = await fetchWithWarning(
          warnings,
          "Service agreement data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/service-agreements", {
              createdOnOrAfter: startIso,
              createdBefore: endIso,
            }),
          [],
        );

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

        const typeStats = new Map<number, { name: string; active: number; revenue: number }>();
        for (const type of membershipTypes) {
          const id = toNumber(firstValue(type, ["id", "membershipTypeId"]));
          if (id <= 0) {
            continue;
          }
          typeStats.set(id, {
            name: membershipTypeName(type, id),
            active: 0,
            revenue: 0,
          });
        }

        const memberCustomerIds = new Set<number>();
        const customerToTypeId = new Map<number, number>();

        for (const customer of customers) {
          const id = customerId(customer);
          if (id > 0 && isCustomerLikelyMember(customer)) {
            memberCustomerIds.add(id);
          }
        }

        let activeMemberships = 0;
        let newSignups = 0;
        let cancellations = 0;
        let expirations = 0;
        let renewals = 0;

        for (const agreement of agreements) {
          const status = normalizeStatus(agreement, ["statusValue"]);
          const agreementTypeId = membershipTypeId(agreement);
          const agreementCustomerId = customerId(agreement);

          if (status.includes("activated")) {
            newSignups += 1;
          }

          if (status.includes("canceled")) {
            cancellations += 1;
          }

          if (status.includes("expired")) {
            expirations += 1;
          }

          if (status.includes("autorenew")) {
            renewals += 1;
          }

          if (isActiveAgreement(status)) {
            activeMemberships += 1;

            if (agreementCustomerId > 0) {
              memberCustomerIds.add(agreementCustomerId);
              if (agreementTypeId > 0) {
                customerToTypeId.set(agreementCustomerId, agreementTypeId);
              }
            }

            if (agreementTypeId > 0) {
              const bucket = ensureTypeEntry(typeStats, agreementTypeId);
              bucket.active += 1;
            }
          }
        }

        let memberRevenue = 0;
        let nonMemberRevenue = 0;
        let memberInvoiceCount = 0;
        let nonMemberInvoiceCount = 0;

        for (const invoice of invoices) {
          const total = invoiceTotal(invoice);
          const invoiceCustomerId = customerId(invoice);
          const invoiceTypeId = membershipTypeId(invoice);

          const isMemberInvoice =
            invoiceTypeId > 0 ||
            memberCustomerIds.has(invoiceCustomerId) ||
            firstValue(invoice, ["isMember", "membershipApplied"]) === true;

          if (isMemberInvoice) {
            memberRevenue += total;
            memberInvoiceCount += 1;

            const resolvedTypeId =
              invoiceTypeId > 0
                ? invoiceTypeId
                : customerToTypeId.get(invoiceCustomerId) ?? 0;

            if (resolvedTypeId > 0) {
              const bucket = ensureTypeEntry(typeStats, resolvedTypeId);
              bucket.revenue += total;
            }
          } else {
            nonMemberRevenue += total;
            nonMemberInvoiceCount += 1;
          }
        }

        const membershipTypesResult = Array.from(typeStats.values())
          .map((item) => ({
            name: item.name,
            active: item.active,
            revenue: round(item.revenue, 2),
          }))
          .sort((a, b) => {
            if (b.revenue !== a.revenue) {
              return b.revenue - a.revenue;
            }
            return b.active - a.active;
          });

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
          retentionRate: round(
            safeDivide(activeMemberships - cancellations, activeMemberships),
            3,
          ),
          memberRevenue: round(memberRevenue, 2),
          nonMemberRevenue: round(nonMemberRevenue, 2),
          memberAverageTicket: round(safeDivide(memberRevenue, memberInvoiceCount), 2),
          nonMemberAverageTicket: round(safeDivide(nonMemberRevenue, nonMemberInvoiceCount), 2),
          membershipTypes: membershipTypesResult,
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
