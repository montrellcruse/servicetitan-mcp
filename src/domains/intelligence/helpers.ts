import type { ServiceTitanClient } from "../../client.js";
import { buildParams } from "../../utils.js";

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchWithWarning<T>(
  warnings: string[],
  label: string,
  fetcher: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fetcher();
  } catch (error: unknown) {
    warnings.push(`${label} unavailable: ${getErrorMessage(error)}`);
    return fallback;
  }
}

export async function fetchAllPages<T>(
  client: ServiceTitanClient,
  path: string,
  params: Record<string, unknown>,
  maxPages: number = DEFAULT_MAX_PAGES,
): Promise<T[]> {
  const allData: T[] = [];
  let page = 1;

  while (page <= maxPages) {
    const response = await client.get(
      path,
      buildParams({
        ...params,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        includeTotal: true,
      }),
    );

    const items = extractItems<T>(response);
    allData.push(...items);

    const hasMore = isRecord(response) && response.hasMore === true;
    if (!hasMore || items.length === 0) {
      break;
    }

    page += 1;
  }

  return allData;
}

function extractItems<T>(response: unknown): T[] {
  if (Array.isArray(response)) {
    return response as T[];
  }

  if (isRecord(response) && Array.isArray(response.data)) {
    return response.data as T[];
  }

  return [];
}

function parseNumberish(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

export function sumBy<T>(items: T[], mapper: (item: T) => number): number {
  return items.reduce((total, item) => total + parseNumberish(mapper(item)), 0);
}

/**
 * Compute the UTC offset in milliseconds for a given IANA timezone at a specific date.
 * Uses Intl.DateTimeFormat to determine local time parts, then calculates the difference
 * between the UTC timestamp and what that timestamp represents in the target timezone.
 */
function getTimezoneOffsetMs(timezone: string, refDate: Date): number {
  if (timezone === "UTC") return 0;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(refDate);
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number.parseInt(part.value, 10) : 0;
  };

  // Reconstruct the local time as if it were UTC to find the offset
  const localAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );

  return localAsUtc - refDate.getTime();
}

export function toDateRange(
  startDate: string,
  endDate: string,
  timezone = "UTC",
): {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
} {
  const start = parseDateInput(startDate, false, timezone);
  const end = parseDateInput(endDate, true, timezone);

  if (end.getTime() < start.getTime()) {
    throw new Error("endDate must be on or after startDate");
  }

  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function toSingleDayRange(
  date: string,
  timezone = "UTC",
): {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  nextDayStartIso: string;
} {
  const start = parseDateInput(date, false, timezone);
  const end = parseDateInput(date, true, timezone);

  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    nextDayStartIso: new Date(start.getTime() + DAY_MS).toISOString(),
  };
}

/**
 * Convert a date string to an ISO boundary timestamp, respecting the tenant timezone.
 * Exported for tools that build their own date filters (e.g. pipeline).
 */
export function toBoundaryIso(value: string, endOfDay: boolean, timezone = "UTC"): string {
  return parseDateInput(value, endOfDay, timezone).toISOString();
}

function parseDateInput(value: string, endOfDay: boolean, timezone = "UTC"): Date {
  // If the value already has timezone info (ISO with Z or offset), parse directly
  if (!DATE_ONLY_PATTERN.test(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid date: ${value}`);
    }
    return parsed;
  }

  // For date-only values (YYYY-MM-DD), interpret as local midnight in the configured timezone.
  // First parse as UTC midnight, then shift by the timezone offset.
  const utcMidnight = new Date(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`,
  );

  if (Number.isNaN(utcMidnight.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  if (timezone === "UTC") {
    return utcMidnight;
  }

  // Shift: "Feb 1 00:00 EST" = "Feb 1 05:00 UTC" (offset = +5h for EST)
  const offsetMs = getTimezoneOffsetMs(timezone, utcMidnight);
  return new Date(utcMidnight.getTime() - offsetMs);
}

export function toNumber(value: unknown): number {
  return parseNumberish(value);
}

export function toText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

export function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function readPath(source: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = source;

  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(part, 10);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (!isRecord(current)) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

export function firstValue(source: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

export function normalizeStatus(source: unknown, extraPaths: string[] = []): string {
  const status = firstValue(source, [
    "status.name",
    "status.value",
    "status",
    "jobStatus",
    "appointmentStatus",
    "callStatus",
    ...extraPaths,
  ]);

  const statusText = toText(status);
  return statusText ? statusText.toLowerCase() : "";
}

export function countWeekdaysInclusive(start: Date, end: Date): number {
  if (end.getTime() < start.getTime()) {
    return 0;
  }

  let cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  let weekdays = 0;

  while (cursor <= endUtc) {
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) {
      weekdays += 1;
    }
    cursor += DAY_MS;
  }

  return weekdays;
}

export function dayDiff(from: Date, to: Date): number {
  const fromUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(0, Math.floor((toUtc - fromUtc) / DAY_MS));
}

export function formatCurrency(value: number): string {
  return round(value, 2).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
