import { describe, expect, it } from "vitest";
import { shapeResponse } from "../src/response-shaping.js";
import { toolResult } from "../src/utils.js";
import { withRequestContext } from "../src/request-context.js";

describe("v3 lossless response shaping", () => {
  it("preserves partial-source warnings, pagination/cursors and requested detail", () => {
    const payload = {
      _warnings: ["Calls feed unavailable: 429"], _meta: { complete: false },
      requestId: "req-1", page: 1, pageSize: 50, hasMore: true, continueFrom: "opaque-cursor",
      byBusinessUnit: [{ businessUnitId: 7, revenue: 12.3456 }],
      productivity: { billableHours: 7.123456 }, sales: { conversionRate: 0.194567 },
      upcomingJobs: 6, revenueBreakdown: { regular: 10.1 },
      technicians: Array.from({ length: 8 }, (_, i) => ({ id: i, customerName: "Stable name" })),
    };
    expect(shapeResponse(payload)).toBe(payload);
    const result = withRequestContext({ timezone: "UTC", maxResponseChars: 100_000 }, () => toolResult(payload, { shape: true }));
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(payload);
    expect(JSON.parse(result.content[0].text)).toEqual(payload);
  });

  it("does not rename semantic fields, round fractions/currency or turn timestamps into dates", () => {
    const payload = { averageTicket: 123.456789, conversionRate: 0.194, businessUnit: "Install", scheduledDate: "2026-03-10T14:45:00.1234567Z", totalHours: 0 };
    expect(shapeResponse(payload)).toEqual(payload);
  });
});
