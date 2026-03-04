import { z } from "zod";

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

export function toolResult(data: unknown): ToolResponse {
  const json = JSON.stringify(data, null, 2);

  if (json.length > maxResponseChars) {
    return {
      content: [
        {
          type: "text",
          text:
            json.slice(0, maxResponseChars) +
            `\n\n[TRUNCATED - Response was ${json.length.toLocaleString()} characters. Use pagination (page/pageSize) to get smaller result sets.]`,
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
    page: z.number().int().optional().describe("Page number (starts at 1)"),
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
  return {
    sort: z
      .string()
      .optional()
      .describe(
        `Sort: +Field (asc) or -Field (desc). Fields: ${fields.join(", ")}`,
      ),
  };
}

export function buildParams(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined && value !== null),
  );
}
