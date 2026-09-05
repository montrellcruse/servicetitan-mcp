import { afterEach, describe, expect, it, vi } from "vitest";

import { Logger } from "../src/logger.js";

afterEach(() => vi.restoreAllMocks());

function capture() {
  return vi.spyOn(process.stderr, "write").mockImplementation(() => true);
}

describe("diagnostic redaction at the final sink", () => {
  it("redacts message/query credentials, nested secrets, contact data, errors and stacks", () => {
    const write = capture();
    const logger = new Logger("info");
    logger.error("Request /mcp?api_key=QUERY_CANARY failed Bearer MESSAGE_CANARY", {
      requestId: "request-1", status: 500,
      headers: { authorization: "Bearer HEADER_CANARY", "ST-App-Key": "APP_CANARY" },
      nested: [{ clientSecret: "NESTED_CANARY", email: "person@example.com", error: "access_token=ERROR_CANARY", stack: "Error: Bearer STACK_CANARY\n at handler" }],
    });
    const output = String(write.mock.calls[0]![0]);
    for (const value of ["QUERY_CANARY", "MESSAGE_CANARY", "HEADER_CANARY", "APP_CANARY", "NESTED_CANARY", "person@example.com", "ERROR_CANARY", "STACK_CANARY"]) expect(output).not.toContain(value);
    expect(JSON.parse(output)).toMatchObject({ level: "error", requestId: "request-1", status: 500, headers: {} });
    expect(JSON.parse(output).nested[0].stack).toContain("at handler");
  });

  it("scrubs configured opaque secrets in messages, nested values, keys and stacks without global settings", () => {
    const write = capture();
    const secrets = ["OPAQUE_CLIENT_CANARY", "OPAQUE_APP_CANARY", "OPAQUE_MCP_CANARY"];
    const logger = new Logger("info", secrets);
    secrets.length = 0;
    logger.warn("Failure OPAQUE_CLIENT_CANARY", {
      error: "Opaque value OPAQUE_MCP_CANARY",
      nested: { diagnostic: "OPAQUE_APP_CANARY", stack: "at OPAQUE_CLIENT_CANARY", OPAQUE_MCP_CANARY: 1 },
    });
    const output = String(write.mock.calls[0]![0]);
    expect(output).not.toMatch(/OPAQUE_(CLIENT|APP|MCP)_CANARY/);
    expect(JSON.parse(output).level).toBe("warn");
  });

  it("preserves audit outcome metadata and trusted envelope fields at error verbosity", () => {
    const write = capture();
    const logger = new Logger("error");
    logger.info("Suppressed event");
    logger.audit("[AUDIT] WRITE fixture_update", {
      level: "debug", msg: "Forged Bearer FORGED_CANARY", ts: "forged",
      timestamp: "2026-09-04T12:00:00Z", tool: "fixture_update", operation: "write",
      domain: "fixture", resource: "items", resourceId: 7, params: { id: 7 },
      success: false, outcomeUnknown: true, deliveryError: "RESPONSE_TOO_LARGE",
    });
    expect(write).toHaveBeenCalledTimes(1);
    const output = JSON.parse(String(write.mock.calls[0]![0]));
    expect(output).toMatchObject({ level: "info", msg: "[AUDIT] WRITE fixture_update", timestamp: "2026-09-04T12:00:00Z", tool: "fixture_update", operation: "write", domain: "fixture", resource: "items", resourceId: 7, params: { id: 7 }, success: false, outcomeUnknown: true, deliveryError: "RESPONSE_TOO_LARGE" });
    expect(output.ts).not.toBe("forged");
    expect(Number.isFinite(Date.parse(output.ts))).toBe(true);
    expect(JSON.stringify(output)).not.toContain("FORGED_CANARY");
  });

  it("sanitizes circular data and BigInt without falling back to unsafe input", () => {
    const write = capture();
    const data: Record<string, unknown> = { id: 7, exact: 9007199254740993n, error: "Bearer CIRCULAR_CANARY" };
    data.self = data;
    new Logger("info").info("Circular fixture", data);
    const output = String(write.mock.calls[0]![0]);
    expect(JSON.parse(output)).toMatchObject({ id: 7, exact: "9007199254740993", self: "[OMITTED: circular]" });
    expect(output).not.toContain("CIRCULAR_CANARY");
  });

  it("does not invoke toJSON hooks that can bypass object sanitization", () => {
    const write = capture();
    const toJSON = vi.fn(() => ({ clientSecret: "SERIALIZER_CANARY" }));
    new Logger("info").info("Serializer fixture", { count: 1, toJSON, nested: { toJSON, count: 2 } });
    expect(toJSON).not.toHaveBeenCalled();
    const output = String(write.mock.calls[0]![0]);
    expect(JSON.parse(output)).toMatchObject({ count: 1, nested: { count: 2 } });
    expect(output).not.toContain("SERIALIZER_CANARY");
  });

  it("redacts fallback messages and omits input when a getter throws", () => {
    const write = capture();
    const data = { get failure(): never { throw new Error("GETTER_CANARY"); } };
    expect(() => new Logger("info", ["OPAQUE_FALLBACK_CANARY"]).info("Bearer FALLBACK_CANARY OPAQUE_FALLBACK_CANARY", data)).not.toThrow();
    const output = String(write.mock.calls[0]![0]);
    expect(output).not.toMatch(/GETTER_CANARY|FALLBACK_CANARY/);
    expect(JSON.parse(output)).toMatchObject({ level: "info", error: "Log serialization failed" });
  });

  it("never throws when both the ordinary and fallback sink writes fail", () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => { throw new Error("SINK_CANARY"); });
    expect(() => new Logger("error").error("Bearer SINK_MESSAGE_CANARY")).not.toThrow();
    expect(write).toHaveBeenCalledTimes(2);
    for (const [line] of write.mock.calls) expect(String(line)).not.toMatch(/SINK_CANARY|SINK_MESSAGE_CANARY/);
  });
});
