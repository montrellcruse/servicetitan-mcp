import { redactSensitiveText, sanitizeParams } from "./audit.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITIES: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  private readonly secrets: readonly string[];

  constructor(private readonly level: LogLevel, secrets: readonly string[] = []) {
    // Keep redaction configuration local to this sink; never read global env.
    this.secrets = secrets.filter(secret => secret.length > 0);
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    this.log("debug", msg, data);
  }

  info(msg: string, data?: Record<string, unknown>): void {
    this.log("info", msg, data);
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    this.log("warn", msg, data);
  }

  error(msg: string, data?: Record<string, unknown>): void {
    this.log("error", msg, data);
  }

  /** Audit events are independent of the diagnostic verbosity setting. */
  audit(msg: string, data?: Record<string, unknown>): void {
    this.log("info", msg, data, true);
  }

  private log(level: LogLevel, msg: string, data?: Record<string, unknown>, force = false): void {
    if (!force && !this.shouldLog(level)) {
      return;
    }

    // MCP uses stdout for protocol messages, so all logs must go to stderr.
    // Redact before serialization, including on the fallback path. Sanitization
    // is inside the try because an untrusted getter can throw while inspected.
    let safeMessage = "Log message unavailable";
    try {
      safeMessage = redactSensitiveText(msg, this.secrets);
      const entry = {
        ...this.redactData(sanitizeParams(data)),
        level,
        ts: new Date().toISOString(),
        msg: safeMessage,
      };
      process.stderr.write(`${JSON.stringify(entry)}\n`);
    } catch {
      // Fallback for circular references or other serialization failures
      try {
        process.stderr.write(`${JSON.stringify({ level, ts: new Date().toISOString(), msg: safeMessage, error: "Log serialization failed" })}\n`);
      } catch { /* A failed diagnostic sink must not turn a committed write into a retryable failure. */ }
    }
  }

  private redactData(data: Record<string, unknown>): Record<string, unknown> {
    const clean = (value: unknown): unknown => {
      if (typeof value === "string") return redactSensitiveText(value, this.secrets);
      // Do not carry a caller's toJSON function into the final serialization;
      // it could replace the sanitized object with unsanitized input.
      if (typeof value === "function" || typeof value === "symbol") return undefined;
      if (Array.isArray(value)) return value.map(clean);
      if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [redactSensitiveText(key, this.secrets), clean(item)]));
      }
      return value;
    };
    // sanitizeParams already bounds depth and replaces cycles/BigInt values.
    return clean(data) as Record<string, unknown>;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITIES[level] >= LOG_LEVEL_PRIORITIES[this.level];
  }
}
