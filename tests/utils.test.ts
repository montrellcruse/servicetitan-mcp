import { z } from "zod";
import { beforeEach, describe, expect, it } from "vitest";

import {
  buildParams,
  paginationParams,
  sanitizeParams,
  setMaxResponseChars,
  sortParam,
  toolError,
  toolResult,
} from "../src/utils.js";

beforeEach(() => {
  setMaxResponseChars(100000);
  delete process.env.ST_RESPONSE_SHAPING;
});

describe("toolResult", () => {
  it("wraps data correctly", () => {
    const payload = { name: "Customer" };
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

  it("truncates oversized responses as valid JSON with pagination hint", () => {
    setMaxResponseChars(80);
    const payload = { data: "x".repeat(500) };
    const result = toolResult(payload);
    const text = result.content[0]?.text ?? "";

    // Must be valid JSON
    const parsed = JSON.parse(text);
    expect(parsed._truncated).toBe(true);
    expect(parsed._originalSize).toBeGreaterThan(80);
    expect(parsed._message).toContain("Use pagination (page/pageSize)");
  });

  it("can disable response shaping via env", () => {
    process.env.ST_RESPONSE_SHAPING = "false";

    const payload = { id: 123, generatedAt: "2026-03-09T10:20:30Z" };
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

describe("paginationParams", () => {
  const schema = paginationParams(z.object({}));

  it("rejects page numbers below 1", () => {
    expect(schema.safeParse({ page: 0 }).success).toBe(false);
    expect(schema.safeParse({ page: -1 }).success).toBe(false);
  });

  it("rejects page sizes below 1", () => {
    expect(schema.safeParse({ pageSize: 0 }).success).toBe(false);
  });
});

describe("sortParam", () => {
  const schema = z.object(sortParam(["Id", "CreatedOn"]));

  it("accepts documented sort formats", () => {
    expect(schema.safeParse({ sort: "+CreatedOn" }).success).toBe(true);
    expect(schema.safeParse({ sort: "-Id" }).success).toBe(true);
    expect(schema.safeParse({ sort: "CreatedOn" }).success).toBe(true);
  });

  it("rejects malformed sort expressions", () => {
    expect(schema.safeParse({ sort: "0CreatedOn" }).success).toBe(false);
    expect(schema.safeParse({ sort: "+Created-On" }).success).toBe(false);
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
