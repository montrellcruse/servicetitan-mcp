import type { Logger } from "./logger.js";

export interface AuditEntry {
  timestamp: string;
  tool: string;
  operation: "write" | "delete";
  domain: string;
  resource: string;
  resourceId?: number | string;
  params: Record<string, unknown>;
  success: boolean;
  error?: string;
}

const SENSITIVE_SUBSTRINGS = [
  "secret",
  "password",
  "token",
  "key",
  "auth",
  "credential",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (isRecord(value)) {
    return sanitizeObject(value);
  }

  return value;
}

function sanitizeObject(value: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(value)) {
    if (
      SENSITIVE_SUBSTRINGS.some((substring) =>
        key.toLowerCase().includes(substring),
      )
    ) {
      continue;
    }

    sanitized[key] = sanitizeValue(val);
  }

  return sanitized;
}

export function sanitizeParams(params: unknown): Record<string, unknown> {
  if (!isRecord(params)) {
    return {};
  }

  return sanitizeObject(params);
}

export class AuditLogger {
  constructor(private readonly logger: Logger) {}

  log(entry: AuditEntry): void {
    this.logger.info(`[AUDIT] ${entry.operation.toUpperCase()} ${entry.tool}`, {
      timestamp: entry.timestamp,
      tool: entry.tool,
      operation: entry.operation,
      domain: entry.domain,
      resource: entry.resource,
      resourceId: entry.resourceId,
      params: entry.params,
      success: entry.success,
      error: entry.error,
    });
  }
}
