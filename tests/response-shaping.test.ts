import { afterEach, describe, expect, it } from "vitest";

import { shapeResponse } from "../src/response-shaping.js";

const ORIGINAL_ST_RESPONSE_SHAPING = process.env.ST_RESPONSE_SHAPING;

afterEach(() => {
  if (ORIGINAL_ST_RESPONSE_SHAPING === undefined) {
    delete process.env.ST_RESPONSE_SHAPING;
    return;
  }

  process.env.ST_RESPONSE_SHAPING = ORIGINAL_ST_RESPONSE_SHAPING;
});

describe("shapeResponse", () => {
  it("recursively excludes configured fields", () => {
    const shaped = shapeResponse({
      requestId: "req-1",
      nested: {
        notes: "kept",
        keep: true,
      },
      items: [
        {
          id: 1,
          name: "kept",
        },
      ],
    });

    expect(shaped).toEqual({
      nested: {
        notes: "kept",
        keep: true,
      },
      items: [
        {
          id: 1,
          name: "kept",
        },
      ],
    });
  });

  it("truncates configured arrays", () => {
    const shaped = shapeResponse({
      staleEstimates: [
        { customerName: "A" },
        { customerName: "B" },
        { customerName: "C" },
        { customerName: "D" },
      ],
    });

    expect(shaped).toEqual({
      staleEstimates: [
        { customer: "A" },
        { customer: "B" },
        { customer: "C" },
      ],
      _truncated: true,
      _total: 4,
    });
  });

  it("abbreviates configured field names", () => {
    const shaped = shapeResponse({
      leadGenerationOpportunity: 12,
      membershipSales: 4,
      businessUnit: "Install",
      nested: {
        estimateValue: 1999,
      },
    });

    expect(shaped).toEqual({
      leadOpp: 12,
      memSales: 4,
      bu: "Install",
      nested: {
        estVal: 1999,
      },
    });
  });

  it("preserves zero-valued fields", () => {
    const shaped = shapeResponse({
      revenue: 0,
      ratio: 0.0,
      textZero: "0",
      items: [0, "0", 1],
      nested: {
        averageTicket: 0,
        keep: 2,
      },
    });

    expect(shaped).toEqual({
      revenue: 0,
      ratio: 0,
      textZero: "0",
      items: [0, "0", 1],
      nested: {
        avgTicket: 0,
        keep: 2,
      },
    });
  });

  it("does not truncate generic 'items' arrays", () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
    const shaped = shapeResponse({ items });

    expect((shaped as Record<string, unknown>).items).toHaveLength(25);
    expect((shaped as Record<string, unknown>)._truncated).toBeUndefined();
  });

  it("rounds currency values to two decimal places and ratios to one decimal place", () => {
    const shaped = shapeResponse({
      revenue: 1234.567,
      averageTicket: 89.5,
      conversionRate: 0.194,
      closeRatio: 47.44,
      billableHours: 7.25,
    });

    expect(shaped).toEqual({
      revenue: 1234.57,
      avgTicket: 89.5,
      conversionRate: 0.2,
      closeRatio: 47.4,
      billHrs: 7.25,
    });
  });

  it("preserves full timestamp precision for non-date-only fields", () => {
    const shaped = shapeResponse({
      createdOn: "2026-03-09T10:20:30Z",
      scheduledDate: "2026-03-10T14:45:00Z",
      nested: {
        startsAt: "2026-03-09T10:20:30.123-07:00",
      },
      unchanged: "2026-03-09",
    });

    expect(shaped).toEqual({
      createdOn: "2026-03-09T10:20:30Z",
      scheduledDate: "2026-03-10",
      nested: {
        startsAt: "2026-03-09T10:20:30.123-07:00",
      },
      unchanged: "2026-03-09",
    });
  });

  it("returns the original payload when shaping is disabled", () => {
    process.env.ST_RESPONSE_SHAPING = "false";
    const payload = {
      id: 123,
      requestId: "req-1",
      revenue: 12.5,
      createdOn: "2026-03-09T10:20:30Z",
    };

    expect(shapeResponse(payload)).toEqual(payload);
  });
});
