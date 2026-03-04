import { afterEach, describe, expect, it } from "vitest";

import { setMaxResponseChars, toolResult } from "../../src/utils.js";

afterEach(() => {
  setMaxResponseChars(100000);
});

describe("safety response truncation", () => {
  it("small responses are not truncated", () => {
    setMaxResponseChars(1000);

    const result = toolResult({ message: "ok" });
    const text = result.content[0]?.text ?? "";

    expect(text).toContain('"message": "ok"');
    expect(text).not.toContain("[TRUNCATED - Response was");
  });

  it("oversized responses are truncated with notice", () => {
    setMaxResponseChars(120);

    const payload = { data: "x".repeat(1000) };
    const result = toolResult(payload);
    const text = result.content[0]?.text ?? "";

    expect(text).toContain("[TRUNCATED - Response was");
    expect(text).toContain("Use pagination (page/pageSize)");
  });

  it("truncation notice includes original size", () => {
    setMaxResponseChars(100);

    const payload = { data: "x".repeat(800) };
    const result = toolResult(payload);
    const text = result.content[0]?.text ?? "";
    const originalLength = JSON.stringify(payload, null, 2).length;

    expect(text).toContain(`${originalLength.toLocaleString()} characters`);
  });
});
