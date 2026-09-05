/**
 * Name-to-ID resolvers using the reference data cache.
 * Lets tools accept human-readable names (e.g., "HVAC") in addition to numeric IDs.
 */
import type { ServiceTitanClient } from "../../client.js";
import { referenceCache } from "../../cache.js";

interface MatchSet<T> {
  data: T[];
  count: number;
}

function toMatchSet<T>(items: T[]): MatchSet<T> {
  return {
    data: items,
    count: items.length,
  };
}

/**
 * Resolve a business unit by name or ID. If `businessUnitName` is provided,
 * searches the cached BU list for a match. Returns the numeric ID or undefined.
 */
export async function resolveBusinessUnitId(
  client: ServiceTitanClient,
  businessUnitId: number | undefined,
  businessUnitName: string | undefined,
): Promise<{ id: number | undefined; resolvedName: string | undefined }> {
  if (businessUnitId !== undefined) {
    return { id: businessUnitId, resolvedName: undefined };
  }

  if (!businessUnitName || businessUnitName.trim().length === 0) {
    return { id: undefined, resolvedName: undefined };
  }

  const query = businessUnitName.trim().toLowerCase();
  const businessUnits = toMatchSet(await referenceCache.getBusinessUnits(client));

  // Exact match first, then require a unique fuzzy match. Analytics must not
  // silently broaden or select an arbitrary tenant record.
  for (const matcher of [
    (name: string) => name === query,
    (name: string) => name.startsWith(query),
    (name: string) => name.includes(query),
  ]) {
    const matches = businessUnits.data.filter((bu) => {
      const name = extractName(bu)?.toLowerCase();
      return name ? matcher(name) : false;
    });

    if (matches.length > 1) {
      throw new Error(`Business unit name "${businessUnitName}" is ambiguous. Use intel_lookup and pass businessUnitId.`);
    }
    const match = matches[0];
    if (match) {
      const id = extractId(match);
      const name = extractName(match);
      if (id === undefined) throw new Error(`Business unit "${businessUnitName}" has no valid numeric ID`);
      return { id, resolvedName: name ?? undefined };
    }
  }

  throw new Error(`Business unit "${businessUnitName}" was not found. Use intel_lookup to select a valid businessUnitId.`);
}

/**
 * Resolve a technician by name or ID. If `technicianName` is provided,
 * searches the cached technician list for a match.
 */
export async function resolveTechnicianId(
  client: ServiceTitanClient,
  technicianId: number | undefined,
  technicianName: string | undefined,
): Promise<{ id: number | undefined; resolvedName: string | undefined }> {
  if (technicianId !== undefined) {
    return { id: technicianId, resolvedName: undefined };
  }

  if (!technicianName || technicianName.trim().length === 0) {
    return { id: undefined, resolvedName: undefined };
  }

  const results = toMatchSet(await referenceCache.findTechniciansByName(client, technicianName));

  const query = businessUnitNameForComparison(technicianName);
  const exact = results.data.filter((record) =>
    businessUnitNameForComparison(extractName(record) ?? "") === query
  );
  const candidates = exact.length > 0 ? exact : results.data;
  if (candidates.length > 1) {
    throw new Error(`Technician name "${technicianName}" is ambiguous. Use intel_lookup and pass technicianId.`);
  }
  if (candidates.length === 1) {
    const id = extractId(candidates[0]);
    const name = extractName(candidates[0]);
    if (id === undefined) throw new Error(`Technician "${technicianName}" has no valid numeric ID`);
    return { id, resolvedName: name ?? undefined };
  }

  throw new Error(`Technician "${technicianName}" was not found. Use intel_lookup to select a valid technicianId.`);
}

function businessUnitNameForComparison(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractId(record: Record<string, unknown>): number | undefined {
  const raw = record.id ?? record.technicianId ?? record.businessUnitId;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }

  if (typeof raw === "string" && raw.trim().length > 0) {
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) return undefined;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }

  return undefined;
}

function extractName(record: Record<string, unknown>): string | undefined {
  for (const key of ["name", "displayName", "fullName"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  // Try firstName + lastName
  const first = typeof record.firstName === "string" ? record.firstName.trim() : "";
  const last = typeof record.lastName === "string" ? record.lastName.trim() : "";
  const combined = `${first} ${last}`.trim();
  return combined.length > 0 ? combined : undefined;
}
