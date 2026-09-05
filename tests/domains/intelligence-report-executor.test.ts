import { describe, expect, it, vi } from "vitest";
import type { ServiceTitanClient } from "../../src/client.js";
import { executeReport, getReportContract, validateReportDefinition } from "../../src/domains/intelligence/report-executor.js";
import { toBoundaryIso } from "../../src/domains/intelligence/helpers.js";

const fields166 = ["EmployeeName", "Date", "RegularHours", "OvertimeHours", "DoubleOvertimeHours"];
const responseFields = (names = fields166) => names.map((name) => ({ name }));
const clientWith = (post: ReturnType<typeof vi.fn>) => ({ post } as unknown as ServiceTitanClient);
const params = (from: string) => [{ name: "From", value: from }, { name: "To", value: from }];

describe("intelligence report executor", () => {
  it("uses the offset on each boundary across DST changes", () => {
    expect(toBoundaryIso("2026-03-08", false, "America/New_York")).toBe("2026-03-08T05:00:00.000Z");
    expect(toBoundaryIso("2026-03-08", true, "America/New_York")).toBe("2026-03-09T03:59:59.999Z");
    expect(toBoundaryIso("2026-11-01", true, "America/New_York")).toBe("2026-11-02T04:59:59.999Z");
  });
  it("fetches every page and remaps reordered response fields by name", async () => {
    const names = [...fields166].reverse();
    const post = vi.fn()
      .mockResolvedValueOnce({ fields: responseFields(names), data: [[3, 2, 1, "2026-01-01", "Ada"]], hasMore: true, totalCount: 2 })
      .mockResolvedValueOnce({ fields: responseFields(names), data: [[6, 5, 4, "2026-01-02", "Lin"]], hasMore: false, totalCount: 2 });
    const result = await executeReport(clientWith(post), "166", params("2026-01-01"), undefined, { cooldownMs: 0, pageSize: 1 });
    expect(result.data).toEqual([["Ada", "2026-01-01", 1, 2, 3], ["Lin", "2026-01-02", 4, 5, 6]]);
    expect(result).toMatchObject({ complete: true, pagesFetched: 2, totalCount: 2 });
    expect(post).toHaveBeenNthCalledWith(2, expect.any(String), expect.any(Object), { page: 2, pageSize: 1, includeTotal: true });
  });

  it("does not collide cache entries for distinct nested parameter values", async () => {
    const post = vi.fn().mockImplementation(async (_path, body) => ({ fields: responseFields(), data: [[body.parameters[0].value, "d", 1, 0, 0]], hasMore: false, totalCount: 1 }));
    const client = clientWith(post);
    await executeReport(client, "166", params("2026-01-01"), undefined, { cooldownMs: 100, now: () => 1000, sleep: async () => {} });
    await executeReport(client, "166", params("2026-02-01"), undefined, { cooldownMs: 100, now: () => 1000, sleep: async () => {} });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("fails the whole execution when a later page fails", async () => {
    const post = vi.fn().mockResolvedValueOnce({ fields: responseFields(), data: [["Ada", "d", 1, 0, 0]], hasMore: true, totalCount: 2 }).mockRejectedValueOnce(new Error("page down"));
    await expect(executeReport(clientWith(post), "166", params("2026-03-01"), undefined, { cooldownMs: 0 })).rejects.toThrow("page 2 failed");
  });

  it("honors cancellation while queued", async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => { release = resolve; });
    const empty = { fields: responseFields(), data: [], hasMore: false, totalCount: 0 };
    const post = vi.fn().mockImplementationOnce(async () => { await first; return empty; }).mockResolvedValue(empty);
    const client = clientWith(post);
    const running = executeReport(client, "166", params("2026-04-01"), undefined, { cooldownMs: 0 });
    const controller = new AbortController();
    const queued = executeReport(client, "166", params("2026-05-01"), undefined, { cooldownMs: 0, signal: controller.signal });
    const third = executeReport(client, "166", params("2026-06-01"), undefined, { cooldownMs: 0 });
    controller.abort();
    await expect(queued).rejects.toThrow("cancelled");
    release();
    await running;
    await third;
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("uses tenant-specific bindings and validates required definition names", async () => {
    const post = vi.fn().mockResolvedValue({ fields: responseFields(), data: [], hasMore: false, totalCount: 0 });
    await executeReport(clientWith(post), "166", params("2026-06-01"), { "166": { category: "custom", reportId: 9001 } }, { cooldownMs: 0 });
    expect(post.mock.calls[0][0]).toContain("/custom/reports/9001/data");
    expect(validateReportDefinition(getReportContract("166"), { parameters: [{name:"From"},{name:"To"}], fields: responseFields([...fields166, "OptionalPay"]) })).toEqual([]);
    expect(validateReportDefinition(getReportContract("162"), {
      parameters: [{ name: "DateType", dataType: "String" }, { name: "From" }, { name: "To" }],
      fields: getReportContract("162").fields.map((name) => ({ name })),
    })).toContain("parameter DateType has type String; expected Number");
  });

  it("preserves a verified optional GrossPay column and rejects malformed rows", async () => {
    const names = [...fields166, "GrossPay"];
    const good = vi.fn().mockResolvedValue({ fields: responseFields(names), data: [["Ada", "d", 1, 0, 0, 125]], hasMore: false, totalCount: 1 });
    const result = await executeReport(clientWith(good), "166", params("2026-07-01"), undefined, { cooldownMs: 0 });
    expect(result.fields.at(-1)?.name).toBe("GrossPay");
    expect(result.data[0]?.at(-1)).toBe(125);

    const malformed = vi.fn().mockResolvedValue({ fields: responseFields(names), data: [["Ada", "d", 1]], hasMore: false, totalCount: 1 });
    await expect(executeReport(clientWith(malformed), "166", params("2026-07-01"), undefined, { cooldownMs: 0 })).rejects.toThrow("cells");
  });
});
