import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditLogger, redactSensitiveText, sanitizeParams, type AuditEntry } from "../src/audit.js";
import { Logger } from "../src/logger.js";

const auditEntry = (params: Record<string, unknown>): AuditEntry => ({
  timestamp: "2026-09-04T12:00:00Z", tool: "crm_customers_update", operation: "write",
  domain: "crm", resource: "customers", resourceId: 7, params, success: true,
});

afterEach(() => vi.restoreAllMocks());

describe("audit privacy at the final sink", () => {
  it("redacts typed contact values, untyped contact updates and nested free text while retaining useful IDs", () => {
    const params = {
      id: 7, amount: 2.34567, enabled: true, value: "Alice Person",
      contacts: [{ type: "Email", value: "alice@example.com" }, { type: "Phone", value: "+1 (602) 555-0182" }],
      body: { customerId: 42, name: "Alice Person", description: "Visit 123 Main Street", value: 12, clientSecret: "SECRET", nested: { keep: "safe" } },
    };
    expect(sanitizeParams(params)).toEqual({
      id: 7, amount: 2.34567, enabled: true, value: "[REDACTED]",
      contacts: [{ type: "Email", value: "[REDACTED]" }, { type: "Phone", value: "[REDACTED]" }],
      body: { customerId: 42, name: "[REDACTED]", description: "[REDACTED]", value: 12, nested: { keep: "safe" } },
    });
    expect(params.body.clientSecret).toBe("SECRET");
  });

  it("redacts errors and credentials embedded in text", () => {
    const text = "Rejected Bearer OPAQUE_AUTH_TOKEN, client_secret=FORM_SECRET access_token=ACCESS_TOKEN apiKey:API_SECRET alice@example.com +1 (602) 555-0182 eyJabc.def.ghi ak1.abcdef.ghi exact-secret";
    const result = redactSensitiveText(text, ["exact-secret"]);
    for (const sensitive of ["OPAQUE_AUTH_TOKEN", "FORM_SECRET", "ACCESS_TOKEN", "API_SECRET", "alice@example.com", "602", "eyJabc", "ak1.abcdef", "exact-secret"]) expect(result).not.toContain(sensitive);
    expect(result).toContain("Rejected");
  });

  it("sanitizes final audit inputs and emits when diagnostic verbosity is error", () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const logger = new Logger("error");
    logger.info("Suppressed diagnostic");
    new AuditLogger(logger).log({ ...auditEntry({ contacts: [{ type: "Email", value: "alice@example.com" }], accessToken: "SECRET" }), error: "Denied Bearer OPAQUE_AUTH_TOKEN" });
    expect(write).toHaveBeenCalledTimes(1);
    const event = JSON.parse(String(write.mock.calls[0]![0]));
    expect(event).toMatchObject({ level: "info", msg: "[AUDIT] WRITE crm_customers_update", success: true, params: { contacts: [{ type: "Email", value: "[REDACTED]" }] } });
    expect(JSON.stringify(event)).not.toMatch(/alice@example|OPAQUE_AUTH_TOKEN|SECRET/);
  });

  it("bounds large ID lists and tolerates circular and bigint input", () => {
    const audit = vi.fn();
    const sink = { audit } as unknown as Logger;
    const params: Record<string, unknown> = { id: 7, ids: Array.from({ length: 10_000 }, (_, i) => i), exact: 9007199254740993n };
    params.cycle = params;
    const sanitized = sanitizeParams(params);
    expect(sanitized.exact).toBe("9007199254740993");
    expect(sanitized.cycle).toBe("[OMITTED: circular]");
    new AuditLogger(sink).log(auditEntry(params));
    const logged = audit.mock.calls[0]![1].params;
    expect(logged).toMatchObject({ _truncated: true, id: 7, _idsCount: 10_000 });
    expect(JSON.stringify(logged).length).toBeLessThanOrEqual(2048);
  });

  it("treats __proto__ as data instead of mutating the sanitized prototype", () => {
    const sanitized = sanitizeParams(JSON.parse('{"__proto__":{"polluted":true},"id":7}'));
    expect(Object.getPrototypeOf(sanitized)).toBe(Object.prototype);
    expect(Object.hasOwn(sanitized, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("distinguishes delivery failure from uncertain execution using bounded code-only metadata", () => {
    const audit = vi.fn();
    const logger = new AuditLogger({ audit } as unknown as Logger);
    logger.log({ ...auditEntry({ id: 7 }), deliveryError: "RESPONSE_TOO_LARGE" });
    expect(audit.mock.calls[0]![1]).toMatchObject({ success: true, deliveryError: "RESPONSE_TOO_LARGE" });
    logger.log({ ...auditEntry({ id: 7 }), success: false, outcomeUnknown: true, deliveryError: "Bearer SECRET" });
    expect(audit.mock.calls[1]![1]).toMatchObject({ success: false, outcomeUnknown: true });
    expect(JSON.stringify(audit.mock.calls[1])).not.toContain("SECRET");
  });
});

describe("logger failure boundary", () => {
  it("a failed stderr sink cannot change a completed business outcome", () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => { throw new Error("EPIPE"); });
    expect(() => new AuditLogger(new Logger("error")).log(auditEntry({ id: 7 }))).not.toThrow();
  });

  it("caller data cannot forge log level or message", () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    new Logger("info").info("Actual event", { level: "error", msg: "Forged event", count: 1 });
    expect(JSON.parse(String(write.mock.calls[0]![0]))).toMatchObject({ level: "info", msg: "Actual event", count: 1 });
  });
});
