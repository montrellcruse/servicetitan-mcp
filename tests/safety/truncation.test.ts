import { afterEach, describe, expect, it } from "vitest";

import { setDisplayTimezone, setMaxResponseChars, toolResult } from "../../src/utils.js";
import { withRequestContext } from "../../src/request-context.js";

afterEach(() => {
  setDisplayTimezone("UTC");
  setMaxResponseChars(100000);
});

describe("safety response truncation", () => {
  it("small responses are not truncated", () => {
    setMaxResponseChars(1000);

    const result = toolResult({ message: "ok" });
    const text = result.content[0]?.text ?? "";

    expect(text).toContain('"message": "ok"');
    expect(JSON.parse(text)).not.toHaveProperty("_truncated");
  });

  it("oversized responses return a bounded explicit delivery error with no partial records", () => {
    setMaxResponseChars(1000);

    const payload = { data: "x".repeat(1000) };
    const result = toolResult(payload);
    const text = result.content[0]?.text ?? "";

    const parsed = JSON.parse(text);
    expect(parsed.error.code).toBe("RESPONSE_TOO_LARGE");
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(parsed);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1000);
    expect(parsed).not.toHaveProperty("data");
    expect(parsed).not.toHaveProperty("_preview");
  });

  it("delivery error includes the full original envelope size when metadata fits", () => {
    const payload = { data: "x".repeat(5000) };
    const originalLength = withRequestContext({ maxResponseChars: 100000, timezone: "UTC", storeOversized: undefined }, () => JSON.stringify(toolResult(payload)).length);

    const result = withRequestContext({ maxResponseChars: 2200, timezone: "UTC", storeOversized: undefined }, () => toolResult(payload));
    const text = result.content[0]?.text ?? "";
    const parsed = JSON.parse(text);

    expect(parsed.error.originalSize).toBe(originalLength);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(2200);
  });
});
