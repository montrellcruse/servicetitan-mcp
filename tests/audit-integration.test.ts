import { describe, expect, it, vi } from "vitest";

import type { AuditLogger } from "../src/audit.js";
import { ServiceTitanApiError } from "../src/client.js";
import { loadConfig } from "../src/config.js";
import type { Logger } from "../src/logger.js";
import { ToolRegistry } from "../src/registry.js";
import type { ToolResponse } from "../src/types.js";
import { toolError, toolResult } from "../src/utils.js";

function fixture(handler: () => Promise<ToolResponse>) {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
  const audit = { log: vi.fn() };
  const registry = new ToolRegistry({ registerTool: vi.fn() } as never, loadConfig({
    ST_CLIENT_ID: "fixture", ST_CLIENT_SECRET: "fixture-secret", ST_APP_KEY: "fixture-key", ST_TENANT_ID: "42",
    ST_READONLY: "false", ST_EXPERIMENTAL_WRITES: "true", ST_CONFIRM_WRITES: "false", ST_MAX_RESPONSE_CHARS: "256",
  }), logger, audit as unknown as AuditLogger);
  registry.register({ name: "audit_fixture_create", domain: "_system", operation: "write", schema: {}, handler });
  return { call: () => registry.getRegisteredTools()[0]!.handler({}), audit };
}

describe("audit execution versus delivery outcomes", () => {
  it.each(["RESPONSE_TOO_LARGE", "INVALID_RESPONSE"])("a completed operation with %s delivery failure is audited as successful", async (code) => {
    const invalid: Record<string, unknown> = {}; invalid.self = invalid;
    const { call, audit } = fixture(async () => toolResult(code === "RESPONSE_TOO_LARGE" ? { result: "x".repeat(5000) } : invalid));
    const result = await call();
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: { code } });
    expect(audit.log).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ success: true, deliveryError: code }));
  });

  it.each(["thrown", "returned"])("a %s uncertain write remains unsuccessful with explicit unknown-outcome audit metadata", async (mode) => {
    const error = new ServiceTitanApiError(0, "Write may have completed. Verify before retrying.", "/crm/v2/tenant/42/customers", { phase: "resource", outcomeUnknown: true });
    const { call, audit } = fixture(async () => { if (mode === "thrown") throw error; return toolError(error); });
    const result = await call();
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: { outcomeUnknown: true } });
    expect(audit.log).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ success: false, outcomeUnknown: true }));
  });
});
