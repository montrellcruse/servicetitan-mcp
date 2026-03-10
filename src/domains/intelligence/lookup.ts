/**
 * Reference data lookup tool — cached technicians, business units, payment types,
 * and membership types. Use this to discover IDs before calling other intel tools,
 * or to search by name.
 */
import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import { referenceCache } from "../../cache.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";

const lookupSchema = z.object({
  type: z
    .enum(["technicians", "business-units", "payment-types", "membership-types"])
    .describe("Type of reference data to look up"),
  search: z
    .string()
    .optional()
    .describe("Search by name (partial match). Omit to list all."),
});

type GenericRecord = Record<string, unknown>;

function extractId(record: GenericRecord): number | undefined {
  const raw =
    record.id ??
    record.technicianId ??
    record.businessUnitId ??
    record.paymentTypeId ??
    record.membershipTypeId;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }

  if (typeof raw === "string" && raw.trim().length > 0) {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function extractName(record: GenericRecord): string | null {
  for (const key of ["name", "displayName", "fullName"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  const first = typeof record.firstName === "string" ? record.firstName.trim() : "";
  const last = typeof record.lastName === "string" ? record.lastName.trim() : "";
  const combined = `${first} ${last}`.trim();
  return combined.length > 0 ? combined : null;
}

function isActive(record: GenericRecord): boolean {
  if (typeof record.active === "boolean") {
    return record.active;
  }

  return true;
}

interface SummaryItem {
  id: number;
  name: string;
  active: boolean;
}

function summarize(records: GenericRecord[]): SummaryItem[] {
  const items: SummaryItem[] = [];

  for (const record of records) {
    const id = extractId(record);
    const name = extractName(record);
    if (id !== undefined && name !== null) {
      items.push({ id, name, active: isActive(record) });
    }
  }

  return items.sort((a, b) => a.name.localeCompare(b.name));
}

function filterByName(items: SummaryItem[], search: string): SummaryItem[] {
  const query = search.trim().toLowerCase();
  if (query.length === 0) {
    return items;
  }

  return items.filter((item) => item.name.toLowerCase().includes(query));
}

export function registerIntelligenceLookupTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "intel_lookup",
    domain: "intelligence",
    operation: "read",
    description:
      "Look up reference data (technicians, business units, payment types, membership types). " +
      "Returns IDs and names from a 30-minute cache. Use this to find IDs for other intel tool filters." +
      '\n\nExamples:\n- "What are our business units?" -> type="business-units"' +
      '\n- "Find technician named Omar" -> type="technicians", search="Omar"' +
      '\n- "List all payment types" -> type="payment-types"' +
      '\n- "What membership types do we have?" -> type="membership-types"',
    schema: lookupSchema.shape,
    handler: async (params) => {
      try {
        const input = lookupSchema.parse(params);
        let records: GenericRecord[];

        switch (input.type) {
          case "technicians":
            records = await referenceCache.getTechnicians(client);
            break;
          case "business-units":
            records = await referenceCache.getBusinessUnits(client);
            break;
          case "payment-types":
            records = await referenceCache.getPaymentTypes(client);
            break;
          case "membership-types":
            records = await referenceCache.getMembershipTypes(client);
            break;
        }

        let items = summarize(records);

        if (input.search) {
          items = filterByName(items, input.search);
        }

        return toolResult({
          type: input.type,
          search: input.search ?? null,
          count: items.length,
          items,
          _cache: "Results cached for 30 minutes. Subsequent lookups are instant.",
        });
      } catch (error: unknown) {
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  });
}
