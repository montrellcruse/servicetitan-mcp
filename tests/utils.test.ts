import { describe, expect, it } from "vitest";

import { buildParams, toolError, toolResult } from "../src/utils.js";

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
