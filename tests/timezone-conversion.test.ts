import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { convertTimestampsToLocal, setDisplayTimezone, toolResult } from "../src/utils.js";

beforeEach(() => {
  setDisplayTimezone("UTC");
});

afterEach(() => {
  setDisplayTimezone("UTC");
});

describe("convertTimestampsToLocal", () => {
  it("returns the original data unchanged for UTC", () => {
    const payload = {
      createdAt: "2026-03-28T19:30:00Z",
      nested: [{ startedAt: "2026-03-28T19:30:00Z" }],
    };

    expect(convertTimestampsToLocal(payload, "UTC")).toBe(payload);
  });

  it("converts UTC timestamps to the target timezone with an offset", () => {
    expect(convertTimestampsToLocal("2026-03-28T19:30:00Z", "America/New_York")).toBe(
      "2026-03-28T15:30:00.000-04:00",
    );
  });

  it("uses DST-aware offsets for the same timezone", () => {
    expect(convertTimestampsToLocal("2026-01-15T12:00:00Z", "America/New_York")).toBe(
      "2026-01-15T07:00:00.000-05:00",
    );
    expect(convertTimestampsToLocal("2026-07-15T12:00:00Z", "America/New_York")).toBe(
      "2026-07-15T08:00:00.000-04:00",
    );
  });

  it("preserves milliseconds", () => {
    expect(convertTimestampsToLocal("2026-03-28T19:30:00.123Z", "America/New_York")).toBe(
      "2026-03-28T15:30:00.123-04:00",
    );
  });

  it("does not convert bare dates", () => {
    expect(convertTimestampsToLocal("2026-03-28", "America/New_York")).toBe("2026-03-28");
  });

  it("walks nested objects and arrays without mutating the input", () => {
    const payload = {
      createdAt: "2026-03-28T19:30:00Z",
      scheduledDate: "2026-03-28",
      items: [
        { startedAt: "2026-03-28T19:30:00Z" },
        ["2026-03-28T19:30:00Z", "2026-03-28"],
      ],
    };

    const result = convertTimestampsToLocal(payload, "America/New_York");

    expect(result).toEqual({
      createdAt: "2026-03-28T15:30:00.000-04:00",
      scheduledDate: "2026-03-28",
      items: [
        { startedAt: "2026-03-28T15:30:00.000-04:00" },
        ["2026-03-28T15:30:00.000-04:00", "2026-03-28"],
      ],
    });
    expect(payload).toEqual({
      createdAt: "2026-03-28T19:30:00Z",
      scheduledDate: "2026-03-28",
      items: [
        { startedAt: "2026-03-28T19:30:00Z" },
        ["2026-03-28T19:30:00Z", "2026-03-28"],
      ],
    });
  });

  it("passes through non-string values unchanged", () => {
    expect(
      convertTimestampsToLocal(
        {
          count: 0,
          enabled: false,
          value: null,
          nested: [1, true, null],
        },
        "America/New_York",
      ),
    ).toEqual({
      count: 0,
      enabled: false,
      value: null,
      nested: [1, true, null],
    });
  });

  it("converts timestamps that already have an offset into the target timezone", () => {
    expect(
      convertTimestampsToLocal("2026-03-28T15:30:00+05:30", "America/New_York"),
    ).toBe("2026-03-28T06:00:00.000-04:00");
  });

  it("returns invalid dates as-is", () => {
    expect(convertTimestampsToLocal("2026-13-28T19:30:00Z", "America/New_York")).toBe(
      "2026-13-28T19:30:00Z",
    );
  });
});

describe("toolResult timezone conversion", () => {
  it("applies timezone conversion after shaping so date-only fields stay compact", () => {
    const result = toolResult(
      {
        date: "2026-03-28T00:00:00Z",
        createdAt: "2026-03-28T04:00:00Z",
      },
      {
        shape: true,
        timezone: "America/New_York",
      },
    );

    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual({
      date: "2026-03-28",
      createdAt: "2026-03-28T00:00:00.000-04:00",
    });
  });

  it("uses the configured display timezone by default", () => {
    setDisplayTimezone("America/New_York");

    const result = toolResult({ createdAt: "2026-03-28T19:30:00Z" });

    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual({
      createdAt: "2026-03-28T15:30:00.000-04:00",
    });
  });
});
