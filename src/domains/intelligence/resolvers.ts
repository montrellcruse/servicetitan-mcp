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

  // Exact match first, then prefix, then contains
  for (const matcher of [
    (name: string) => name === query,
    (name: string) => name.startsWith(query),
    (name: string) => name.includes(query),
  ]) {
    const match = businessUnits.data.find((bu) => {
      const name = extractName(bu)?.toLowerCase();
      return name ? matcher(name) : false;
    });

    if (match) {
      const id = extractId(match);
      const name = extractName(match);
      return id !== undefined ? { id, resolvedName: name ?? undefined } : { id: undefined, resolvedName: undefined };
    }
  }

  return { id: undefined, resolvedName: undefined };
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

  if (results.count > 0) {
    const id = extractId(results.data[0]);
    const name = extractName(results.data[0]);
    return id !== undefined ? { id, resolvedName: name ?? undefined } : { id: undefined, resolvedName: undefined };
  }

  return { id: undefined, resolvedName: undefined };
}

function extractId(record: Record<string, unknown>): number | undefined {
  const raw = record.id ?? record.technicianId ?? record.businessUnitId;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }

  if (typeof raw === "string" && raw.trim().length > 0) {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
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
