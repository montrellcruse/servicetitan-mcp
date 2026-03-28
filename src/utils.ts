import { z } from "zod";

import { shapeResponse } from "./response-shaping.js";
import type { ToolResponse } from "./types.js";
export { sanitizeParams } from "./audit.js";

const DEFAULT_MAX_RESPONSE_CHARS = 100_000;
let maxResponseChars = DEFAULT_MAX_RESPONSE_CHARS;

export function setMaxResponseChars(value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`maxResponseChars must be a positive integer. Received: ${value}`);
  }

  maxResponseChars = value;
}

export function toolResult(data: unknown, options?: { shape?: boolean }): ToolResponse {
  const payload = options?.shape ? shapeResponse(data) : data;
  const json = JSON.stringify(payload, null, 2);

  if (json.length > maxResponseChars) {
    // Return a valid JSON object with a truncation marker instead of slicing mid-JSON
    const truncationNotice = {
      _truncated: true,
      _originalSize: json.length,
      _message: `Response was ${json.length.toLocaleString()} characters (limit: ${maxResponseChars.toLocaleString()}). Use pagination (page/pageSize) to get smaller result sets.`,
      _preview: json.slice(0, Math.min(maxResponseChars - 256, maxResponseChars)),
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
