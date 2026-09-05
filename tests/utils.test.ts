import { z } from "zod";
import { beforeEach, describe, expect, it } from "vitest";

import {
  buildParams,
  paginationParams,
  sanitizeParams,
  setDisplayTimezone,
  setMaxResponseChars,
  sortParam,
  toolError,
  toolResult,
} from "../src/utils.js";

beforeEach(() => {
  setDisplayTimezone("UTC");
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
      structuredContent: payload,
    });
  });

  it("returns an explicit bounded error for oversized single records", () => {
    setMaxResponseChars(1000);
    const result = toolResult({ data: "x".repeat(5000) });
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(result.isError).toBe(true);
    expect(parsed.error.code).toBe("RESPONSE_TOO_LARGE");
    expect(result.structuredContent).toEqual(parsed);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1000);
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
      structuredContent: payload,
    });
  });
});

describe("toolError", () => {
  it("provides a consistent machine-readable error in both representations", () => {
    const result = toolError("Something failed");
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ error: { code: "REQUEST_FAILED", message: "Something failed" } });
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
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
