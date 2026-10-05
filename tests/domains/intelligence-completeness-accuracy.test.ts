import { describe, expect, it, vi } from "vitest";
import type { ServiceTitanClient } from "../../src/client.js";
import { fetchAllPagesWithTotal, clearIntelCache, withIntelCache } from "../../src/domains/intelligence/helpers.js";
import { executeReport, getReportContract } from "../../src/domains/intelligence/report-executor.js";

const params = [{ name: "From", value: "2026-01-01" }, { name: "To", value: "2026-01-31" }];
const fields = getReportContract("166").fields.map(name => ({ name }));
const row = ["Example technician", "2026-01-01", 1, 0, 0];

describe("analytics completeness and unknown counts", () => {
  it("accepts documented null report counts and follows hasMore to completion", async () => {
    const post = vi.fn()
      .mockResolvedValueOnce({ fields, data: [row], totalCount: null, hasMore: true })
      .mockResolvedValueOnce({ fields, data: [row], totalCount: null, hasMore: false });
    const result = await executeReport({ post } as unknown as ServiceTitanClient, "166", params, undefined, { cooldownMs: 0 });
    expect(result.data).toHaveLength(2);
    expect(result.complete).toBe(true);
    expect(result.totalCount).toBeUndefined();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("rejects a non-array report row instead of dropping it and caching a complete subset", async () => {
    const post = vi.fn().mockResolvedValue({ fields, data: [row, { broken: true }], hasMore: false });
    const client = { post } as unknown as ServiceTitanClient;
    await expect(executeReport(client, "166", params, undefined, { cooldownMs: 1 })).rejects.toThrow("row");
    post.mockResolvedValue({ fields, data: [row], hasMore: false });
    expect((await executeReport(client, "166", params, undefined, { cooldownMs: 1 })).data).toHaveLength(1);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it.each([-1, 0, 0.5, Number.POSITIVE_INFINITY, Number.NaN])("rejects unsafe feed page limit %s before any read", async cap => {
    const get = vi.fn().mockResolvedValue({ data: [], hasMore: false });
    await expect(fetchAllPagesWithTotal({ get } as unknown as ServiceTitanClient, "/example", {}, cap)).rejects.toThrow("positive safe integer");
    expect(get).not.toHaveBeenCalled();
  });

  it.each([-1, 0, 0.5, Number.POSITIVE_INFINITY, Number.NaN])("rejects unsafe report page limit %s before any read", async cap => {
    const post = vi.fn().mockResolvedValue({ fields, data: [], hasMore: false });
    await expect(executeReport({ post } as unknown as ServiceTitanClient, "166", params, undefined, { cooldownMs: 0, maxPages: cap })).rejects.toThrow("positive safe integer");
    expect(post).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "false", 0])("does not treat invalid hasMore=%s as a complete feed", async hasMore => {
    const get = vi.fn().mockResolvedValue({ data: [{ id: 1 }], hasMore });
    await expect(fetchAllPagesWithTotal({ get } as unknown as ServiceTitanClient, "/example", {})).rejects.toThrow("hasMore");
  });

  it("rejects a prematurely terminated counted feed, while accepting a null unknown count", async () => {
    const get = vi.fn().mockResolvedValue({ data: [{ id: 1 }], totalCount: 2, hasMore: false });
    const client = { get } as unknown as ServiceTitanClient;
    await expect(fetchAllPagesWithTotal(client, "/example", {})).rejects.toThrow("totalCount");
    get.mockResolvedValue({ data: [{ id: 1 }], totalCount: null, hasMore: false });
    expect((await fetchAllPagesWithTotal(client, "/example", {})).data).toEqual([{ id: 1 }]);
  });

  it("preserves genuine complete empty feeds and explicit array responses", async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [], totalCount: 0, hasMore: false }).mockResolvedValueOnce([]);
    const client = { get } as unknown as ServiceTitanClient;
    expect((await fetchAllPagesWithTotal(client, "/example", {})).data).toEqual([]);
    expect((await fetchAllPagesWithTotal(client, "/example", {})).data).toEqual([]);
  });

  it("uses a numeric count appearing after an unknown count and rejects later count drift", async () => {
    const post = vi.fn()
      .mockResolvedValueOnce({ fields, data: [row], totalCount: null, hasMore: true })
      .mockResolvedValueOnce({ fields, data: [row], totalCount: 2, hasMore: false });
    const client = { post } as unknown as ServiceTitanClient;
    expect((await executeReport(client, "166", params, undefined, { cooldownMs: 0 })).totalCount).toBe(2);
    post.mockResolvedValueOnce({ fields, data: [row], totalCount: 2, hasMore: true })
      .mockResolvedValueOnce({ fields, data: [row], totalCount: 3, hasMore: false });
    await expect(executeReport(client, "166", params, undefined, { cooldownMs: 0 })).rejects.toThrow("totalCount changed");
    const get = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }], totalCount: null, hasMore: true })
      .mockResolvedValueOnce({ data: [{ id: 2 }], totalCount: 2, hasMore: false });
    expect((await fetchAllPagesWithTotal({ get } as unknown as ServiceTitanClient, "/example", {})).totalCount).toBe(2);
    get.mockResolvedValueOnce({ data: [{ id: 1 }], totalCount: 2, hasMore: true })
      .mockResolvedValueOnce({ data: [{ id: 2 }], totalCount: 3, hasMore: false });
    await expect(fetchAllPagesWithTotal({ get } as unknown as ServiceTitanClient, "/example", {})).rejects.toThrow("totalCount changed");
  });

  it.each([{ pageSize: 0 }, { pageSize: 0.5 }, { maxRows: 0 }, { maxRows: Number.POSITIVE_INFINITY }])("rejects invalid report bounds %j before a read", async options => {
    const post = vi.fn().mockResolvedValue({ fields, data: [], hasMore: false });
    await expect(executeReport({ post } as unknown as ServiceTitanClient, "166", params, undefined, { cooldownMs: 0, ...options })).rejects.toThrow("positive safe integer");
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps valid row and page safety stops visible", async () => {
    const post = vi.fn().mockResolvedValue({ fields, data: [row, row], hasMore: false });
    await expect(executeReport({ post } as unknown as ServiceTitanClient, "166", params, undefined, { cooldownMs: 0, maxRows: 1 })).rejects.toThrow("row safety limit");
    const get = vi.fn().mockResolvedValue({ data: [{ id: 1 }], hasMore: true });
    await expect(fetchAllPagesWithTotal({ get } as unknown as ServiceTitanClient, "/example", {}, 1)).rejects.toThrow("exceeded 1 pages");
  });

  it("does not cache a payload with an explicitly failed source even if warnings were omitted", async () => {
    clearIntelCache();
    const payload = { total: null, _sourceAvailability: { source: { status: "failed" } } };
    const loader = vi.fn().mockResolvedValue({ structuredContent: payload, content: [{ type: "text", text: JSON.stringify(payload) }] });
    await withIntelCache("accuracy-completeness", {}, loader);
    await withIntelCache("accuracy-completeness", {}, loader);
    expect(loader).toHaveBeenCalledTimes(2);
    clearIntelCache();
  });
});
