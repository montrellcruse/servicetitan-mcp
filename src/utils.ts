import { z } from "zod";

import { shapeResponse } from "./response-shaping.js";
import { getRequestContext, updateRequestContext } from "./request-context.js";
import { redactSensitiveText } from "./audit.js";
import type { ToolResponse } from "./types.js";
export { sanitizeParams } from "./audit.js";

export const DEFAULT_MAX_RESPONSE_CHARS = 100_000;
/** A smaller budget cannot reliably carry an explicit MCP error envelope. */
export const MIN_RESPONSE_CHARS = 256;

const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** @deprecated Scope configuration with withRequestContext at the server boundary. */
export function setMaxResponseChars(value: number): void {
  validateResponseBudget(value);
  updateRequestContext({ maxResponseChars: value });
}

export function validateResponseBudget(value: number): void {
  if (!Number.isSafeInteger(value) || value < MIN_RESPONSE_CHARS) {
    throw new Error(`maxResponseChars must be an integer of at least ${MIN_RESPONSE_CHARS}. Received: ${value}`);
  }
}

/** @deprecated Scope configuration with withRequestContext at the server boundary. */
export function setDisplayTimezone(timezone: string): void {
  const normalized = timezone.trim() || "UTC";
  new Intl.DateTimeFormat("en-US", { timeZone: normalized });
  updateRequestContext({ timezone: normalized });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isUtcTimezone(timezone: string): boolean {
  return timezone.trim().toUpperCase() === "UTC";
}

function getFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    fractionalSecondDigits: 3,
  });

  if (formatterCache.size >= 32) formatterCache.delete(formatterCache.keys().next().value!);
  formatterCache.set(timezone, formatter);
  return formatter;
}

function utcToLocal(isoString: string, timezone: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }

  const formatter = getFormatter(timezone);
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  const localIso =
    `${parts.year}-${parts.month}-${parts.day}` +
    `T${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond ?? "000"}`;
  const localDate = new Date(`${localIso}Z`);

  if (Number.isNaN(localDate.getTime())) {
    return isoString;
  }

  const offsetMin = Math.round((localDate.getTime() - date.getTime()) / 60000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMin);
  const offsetH = String(Math.floor(absMin / 60)).padStart(2, "0");
  const offsetM = String(absMin % 60).padStart(2, "0");

  // Date stores milliseconds, but ServiceTitan can return finer fractional precision.
  const fraction = /\.(\d+)/.exec(isoString)?.[1];
  const preciseLocalIso = fraction ? localIso.replace(/\.\d+$/, `.${fraction}`) : localIso;
  return `${preciseLocalIso}${sign}${offsetH}:${offsetM}`;
}

// When a key name explicitly signals UTC (e.g. startUtc, endUtc, createdOnUtc),
// preserve the value as-is. Converting these to local time while keeping the
// UTC-suffixed key name produces logically wrong output like
// `startUtc: "2026-05-01T12:00:00-04:00"` which downstream consumers cannot
// trust. ServiceTitan's capacity API is the most visible source of these.
const UTC_SUFFIXED_KEY = /(^|[a-z0-9_])utc\b/i;

function keyIndicatesUtc(key: string | undefined): boolean {
  if (!key) return false;
  return UTC_SUFFIXED_KEY.test(key);
}

export function convertTimestampsToLocal(
  data: unknown,
  timezone: string,
  parentKey?: string,
): unknown {
  if (isUtcTimezone(timezone)) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => convertTimestampsToLocal(item, timezone, parentKey));
  }

  if (isPlainObject(data)) {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        convertTimestampsToLocal(value, timezone, key),
      ]),
    );
  }

  if (typeof data === "string" && ISO_TIMESTAMP_PATTERN.test(data)) {
    if (keyIndicatesUtc(parentKey)) {
      return data;
    }
    return utcToLocal(data, timezone);
  }

  return data;
}

function responseEnvelope(payload: Record<string, unknown>, isError = false, compact = false): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, compact ? undefined : 2) }],
    structuredContent: payload,
    ...(isError ? { isError: true } : {}),
  };
}

function responseBudget(): number {
  const value = getRequestContext().maxResponseChars ?? DEFAULT_MAX_RESPONSE_CHARS;
  validateResponseBudget(value);
  return value;
}

function fitsBudget(response: ToolResponse, limit: number): boolean {
  return JSON.stringify(response).length <= limit;
}

function oversizedResponse(payload: Record<string, unknown>, originalSize: number, limit: number): ToolResponse {
  const pagination: Record<string, unknown> = {};
  for (const key of ["page", "pageSize", "totalCount", "hasMore", "continueFrom", "nextPageToken", "paginationToken"]) {
    if (payload[key] !== undefined) pagination[key] = payload[key];
  }
  const pageSize = typeof payload.pageSize === "number" ? payload.pageSize : undefined;
  const isExport = typeof payload.continueFrom === "string";
  const retrieval = isExport
    ? { instruction: "This export batch was not delivered. Repeat from the ORIGINAL input cursor with a larger response budget or a bulk-data client; do not advance to continueFrom.", cursorUnsafeToAdvance: true }
    : pageSize !== undefined && pageSize > 1
      ? { instruction: "Retry the same page with a smaller pageSize; no records from this page were delivered.", page: payload.page, pageSize: Math.max(1, Math.floor(pageSize * limit / originalSize * 0.8)) }
      : { instruction: "No records were delivered. Narrow the query, request less detail, or increase the response budget. A single record may exceed the budget." };
  const detailed = responseEnvelope({
    error: { code: "RESPONSE_TOO_LARGE", message: "Response unavailable within the configured budget.", originalSize, limit },
    complete: false,
    ...(Object.keys(pagination).length ? { upstreamPagination: pagination } : {}),
    ...(payload._warnings !== undefined ? { _warnings: payload._warnings } : {}),
    retrieval,
  }, true);
  if (fitsBudget(detailed, limit)) return detailed;
  // Metadata or a long cursor can exceed even the error budget. Never return a
  // partial record or an apparently successful cursor that skips omitted data.
  const compact = responseEnvelope({ error: { code: "RESPONSE_TOO_LARGE", message: "No data delivered. Narrow the query or raise the response budget." } }, true);
  if (fitsBudget(compact, limit)) return compact;
  return responseEnvelope({ error: { code: "RESPONSE_TOO_LARGE" } }, true);
}

export function toolResult(
  data: unknown,
  options?: { shape?: boolean; timezone?: string },
): ToolResponse {
  const limit = responseBudget();
  try {
    const shapedPayload = options?.shape ? shapeResponse(data) : data;
    const timezone = options?.timezone ?? getRequestContext().timezone ?? "UTC";
    const converted = convertTimestampsToLocal(shapedPayload, timezone);
    const payload = isPlainObject(converted) ? converted : { data: converted ?? null };
    // Normalize to the actual JSON contract so undefined fields cannot differ
    // between structuredContent and the text consumed by older MCP clients.
    const jsonPayload = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    const response = responseEnvelope(jsonPayload);
    const originalSize = JSON.stringify(response).length;
    if (originalSize <= limit) return response;
    const store = getRequestContext().storeOversized;
    if (store) {
      try {
        const metadata = store(jsonPayload);
        const stored = responseEnvelope({ ...metadata, delivery: "stored", complete: false });
        if (fitsBudget(stored, limit)) return stored;
      } catch { /* Full/unavailable storage retains the explicit unavailable fallback. */ }
    }
    return oversizedResponse(jsonPayload, originalSize, limit);
  } catch {
    const error = responseEnvelope({ error: { code: "INVALID_RESPONSE", message: "Response could not be represented as JSON." } }, true);
    return fitsBudget(error, limit) ? error : responseEnvelope({ error: { code: "INVALID_RESPONSE" } }, true);
  }
}

/** Preserve useful API diagnostics without ever serializing Axios config/body. */
function errorPayload(error: unknown, fallbackCode: string): Record<string, unknown> {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "Tool execution failed";
  const payload: Record<string, unknown> = { code: fallbackCode, message: redactSensitiveText(message) };
  // Avoid a runtime dependency on client.ts (the client itself imports utils).
  // Only the known API error shape is considered, and every field is validated.
  if (!(error instanceof Error) || error.name !== "ServiceTitanApiError") return payload;
  const apiError = error as Error & { status?: unknown; path?: unknown; details?: unknown };
  if (typeof apiError.status === "number" && Number.isInteger(apiError.status) && apiError.status >= 0 && apiError.status <= 599) payload.status = apiError.status;
  if (typeof apiError.path === "string" && /^\/[A-Za-z0-9{}_~./-]{0,1000}$/.test(apiError.path)) payload.path = redactSensitiveText(apiError.path);
  if (!isPlainObject(apiError.details)) return payload;
  const details = apiError.details;
  if (typeof details.code === "string" && /^[A-Z0-9_]{1,80}$/.test(details.code)) payload.code = details.code;
  if (typeof details.phase === "string" && ["auth", "resource", "queue"].includes(details.phase)) payload.phase = details.phase;
  if (typeof details.traceId === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(details.traceId)) payload.traceId = details.traceId;
  if (typeof details.retryAfterMs === "number" && Number.isFinite(details.retryAfterMs) && details.retryAfterMs >= 0) payload.retryAfterMs = details.retryAfterMs;
  for (const flag of ["retryable", "outcomeUnknown"]) if (typeof details[flag] === "boolean") payload[flag] = details[flag];
  // An uncertain business outcome always requires verification before another
  // attempt, including errors supplied by embedders or older clients.
  if (payload.outcomeUnknown === true) payload.retryable = false;
  return payload;
}

export function toolError(error: unknown, code = "REQUEST_FAILED"): ToolResponse {
  const limit = responseBudget();
  const payload = errorPayload(error, code);
  const response = responseEnvelope({ error: payload }, true);
  if (fitsBudget(response, limit)) return response;
  // Uncertain writes keep their essential safety meaning even at the minimum
  // budget instead of degrading to a generic error that invites a replay.
  if (payload.outcomeUnknown === true) {
    const uncertain = responseEnvelope({ error: { code: "OUTCOME_UNKNOWN", outcomeUnknown: true, retryable: false } }, true, true);
    if (fitsBudget(uncertain, limit)) return uncertain;
  }
  const compact = responseEnvelope({ error: { code, message: "Request failed; error details exceed the response budget." } }, true);
  return fitsBudget(compact, limit) ? compact : responseEnvelope({ error: { code: "REQUEST_FAILED" } }, true);
}

export function paginationParams<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.extend({
    page: z.number().int().min(1).optional().describe("Page number (starts at 1)"),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .optional()
      .describe("Records per page (default 50)"),
    includeTotal: z
      .boolean()
      .optional()
      .describe("Include total count in response"),
  });
}

export function dateFilterParams<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.extend({
    createdBefore: z.string().datetime().optional(),
    createdOnOrAfter: z.string().datetime().optional(),
    modifiedBefore: z.string().datetime().optional(),
    modifiedOnOrAfter: z.string().datetime().optional(),
  });
}

export function activeFilterParam() {
  return {
    active: z
      .enum(["True", "Any", "False"])
      .optional()
      .default("True")
      .describe("Filter by active status"),
  };
}

export function sortParam(fields: string[]) {
  const fieldSet = new Set(fields);
  return {
    sort: z
      .string()
      .regex(/^[+-]?[A-Za-z][A-Za-z0-9_]*$/, "Sort must be Field, +Field (asc), or -Field (desc)")
      .refine(
        (value) => {
          const fieldName = value.replace(/^[+-]/, "");
          return fieldSet.has(fieldName);
        },
        {
          message: `Sort field must be one of: ${fields.join(", ")}`,
        },
      )
      .optional()
      .describe(
        `Sort: Field (default), +Field (asc), or -Field (desc). Fields: ${fields.join(", ")}`,
      ),
  };
}

export function getErrorMessage(error: unknown): string {
  // Sanitize Zod validation errors — don't expose schema internals to callers
  if (error instanceof z.ZodError) {
    const issues = error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    });
    return `Invalid input: ${issues.join("; ")}`;
  }

  return error instanceof Error ? error.message : String(error);
}

export function buildParams(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined && value !== null),
  );
}
