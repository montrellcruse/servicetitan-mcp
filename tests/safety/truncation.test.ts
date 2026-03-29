import { afterEach, describe, expect, it } from "vitest";

import { setDisplayTimezone, setMaxResponseChars, toolResult } from "../../src/utils.js";

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

  it("oversized responses are truncated as valid JSON with notice", () => {
    setMaxResponseChars(120);

    const payload = { data: "x".repeat(1000) };
    const result = toolResult(payload);
    const text = result.content[0]?.text ?? "";

    const parsed = JSON.parse(text);
    expect(parsed._truncated).toBe(true);
    expect(parsed._message).toContain("Use pagination (page/pageSize)");
  });

  it("truncation notice includes original size", () => {
    setMaxResponseChars(100);

    const payload = { data: "x".repeat(800) };
    const result = toolResult(payload);
    const text = result.content[0]?.text ?? "";
    const parsed = JSON.parse(text);

    const originalLength = JSON.stringify(payload, null, 2).length;
    expect(parsed._originalSize).toBe(originalLength);
  });
});
