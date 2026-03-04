import { beforeEach, describe, expect, it } from "vitest";

import {
  buildParams,
  sanitizeParams,
  setMaxResponseChars,
  toolError,
  toolResult,
} from "../src/utils.js";

beforeEach(() => {
  setMaxResponseChars(100000);
});

describe("toolResult", () => {
  it("wraps data correctly", () => {
    const payload = { id: 123, name: "Customer" };
    const result = toolResult(payload);

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(payload, null, 2),
        },
      ],
    });
  });

  it("truncates oversized responses with pagination hint", () => {
    setMaxResponseChars(80);
    const payload = { data: "x".repeat(500) };
    const result = toolResult(payload);
    const text = result.content[0]?.text ?? "";

    expect(text).toContain("[TRUNCATED - Response was");
    expect(text).toContain("Use pagination (page/pageSize)");
  });
});

describe("toolError", () => {
  it("wraps an error with isError flag", () => {
    expect(toolError("Something failed")).toEqual({
      content: [
        {
          type: "text",
          text: "Error: Something failed",
        },
      ],
      isError: true,
    });
  });
});

describe("buildParams", () => {
  it("strips undefined and null values", () => {
    expect(
      buildParams({
        a: 1,
        b: undefined,
        c: null,
        d: "value",
      }),
    ).toEqual({
      a: 1,
      d: "value",
    });
  });

  it("preserves valid falsy values", () => {
    expect(
      buildParams({
        count: 0,
        enabled: false,
        query: "",
      }),
    ).toEqual({
      count: 0,
      enabled: false,
      query: "",
    });
  });
});

describe("sanitizeParams", () => {
  it("strips sensitive fields and preserves others", () => {
    expect(
      sanitizeParams({
        username: "user",
        token: "hide-me",
        password: "hide-me-too",
        nested: {
          key: "hide",
          keep: "ok",
        },
      }),
    ).toEqual({
      username: "user",
      nested: {
        keep: "ok",
      },
    });
  });
});
