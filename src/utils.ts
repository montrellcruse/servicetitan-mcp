import { z } from "zod";

import { shapeResponse } from "./response-shaping.js";
import type { ToolResponse } from "./types.js";
export { sanitizeParams } from "./audit.js";

const DEFAULT_MAX_RESPONSE_CHARS = 100_000;
let maxResponseChars = DEFAULT_MAX_RESPONSE_CHARS;
let displayTimezone = "UTC";

const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function setMaxResponseChars(value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`maxResponseChars must be a positive integer. Received: ${value}`);
  }

  maxResponseChars = value;
}

export function setDisplayTimezone(timezone: string): void {
  displayTimezone = timezone.trim() === "" ? "UTC" : timezone;
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

  return `${localIso}${sign}${offsetH}:${offsetM}`;
}

export function convertTimestampsToLocal(data: unknown, timezone: string): unknown {
  if (isUtcTimezone(timezone)) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => convertTimestampsToLocal(item, timezone));
  }

  if (isPlainObject(data)) {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, convertTimestampsToLocal(value, timezone)]),
    );
  }

  if (typeof data === "string" && ISO_TIMESTAMP_PATTERN.test(data)) {
    return utcToLocal(data, timezone);
  }

  return data;
}

export function toolResult(
  data: unknown,
  options?: { shape?: boolean; timezone?: string },
): ToolResponse {
  const shapedPayload = options?.shape ? shapeResponse(data) : data;
  const timezone = options?.timezone ?? displayTimezone;
  const payload = convertTimestampsToLocal(shapedPayload, timezone);
  const json = JSON.stringify(payload, null, 2);

  if (json.length > maxResponseChars) {
    // Return a valid JSON object with a truncation marker instead of slicing mid-JSON
    const truncationNotice = {
      _truncated: true,
      _originalSize: json.length,
      _message: `Response was ${json.length.toLocaleString()} characters (limit: ${maxResponseChars.toLocaleString()}). Use pagination (page/pageSize) to get smaller result sets.`,
      _preview: json.slice(0, Math.max(0, maxResponseChars - 256)),
    };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(truncationNotice, null, 2),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: json,
      },
    ],
  };
}

export function toolError(message: string): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: `Error: ${message}`,
      },
    ],
    isError: true,
  };
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
