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

export function toDateRange(startDate: string, endDate: string): {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
} {
  const start = parseDateInput(startDate, false);
  const end = parseDateInput(endDate, true);

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

export function toSingleDayRange(date: string): {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  nextDayStartIso: string;
} {
  const start = parseDateInput(date, false);
  const end = parseDateInput(date, true);

  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    nextDayStartIso: new Date(start.getTime() + DAY_MS).toISOString(),
  };
}

function parseDateInput(value: string, endOfDay: boolean): Date {
  const normalized = DATE_ONLY_PATTERN.test(value)
    ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : value;

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return parsed;
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
