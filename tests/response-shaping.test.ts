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

  it("suppresses zero-valued fields without removing array items", () => {
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
      items: [0, "0", 1],
      nested: {
        keep: 2,
      },
    });
  });

  it("rounds currency values to whole numbers and ratios to one decimal place", () => {
    const shaped = shapeResponse({
      revenue: 1234.56,
      averageTicket: 89.5,
      conversionRate: 0.194,
      closeRatio: 47.44,
      billableHours: 7.25,
    });

    expect(shaped).toEqual({
      revenue: 1235,
      avgTicket: 90,
      conversionRate: 0.2,
      closeRatio: 47.4,
      billHrs: 7.25,
    });
  });

  it("compacts ISO dates to YYYY-MM-DD", () => {
    const shaped = shapeResponse({
      createdOn: "2026-03-09T10:20:30Z",
      nested: {
        startsAt: "2026-03-09T10:20:30.123-07:00",
      },
      unchanged: "2026-03-09",
    });

    expect(shaped).toEqual({
      createdOn: "2026-03-09",
      nested: {
        startsAt: "2026-03-09",
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
