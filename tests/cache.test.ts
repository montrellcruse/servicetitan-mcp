import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReferenceDataCache, TtlCache } from "../src/cache.js";
import type { ServiceTitanClient } from "../src/client.js";

// ---------------------------------------------------------------------------
// TtlCache
// ---------------------------------------------------------------------------

describe("TtlCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined for missing keys", () => {
    const cache = new TtlCache<string>(60_000);
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("stores and retrieves values", () => {
    const cache = new TtlCache<string>(60_000);
    cache.set("hello", "world");
    expect(cache.get("hello")).toBe("world");
  });

  it("returns undefined after TTL expires", () => {
    const ttlMs = 30_000;
    const cache = new TtlCache<string>(ttlMs);
    cache.set("key", "value");

    // Still present just before expiry
    vi.advanceTimersByTime(ttlMs - 1);
    expect(cache.get("key")).toBe("value");

    // Expired after TTL elapses
    vi.advanceTimersByTime(2);
    expect(cache.get("key")).toBeUndefined();
  });

  it("has() reflects live / expired state correctly", () => {
    const ttlMs = 5_000;
    const cache = new TtlCache<number>(ttlMs);
    cache.set("n", 42);

    expect(cache.has("n")).toBe(true);
    vi.advanceTimersByTime(ttlMs + 1);
    expect(cache.has("n")).toBe(false);
  });

  it("clear() empties the cache", () => {
    const cache = new TtlCache<string>(60_000);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
  });

  it("throws when constructed with non-positive TTL", () => {
    expect(() => new TtlCache(0)).toThrow();
    expect(() => new TtlCache(-1)).toThrow();
  });

  it("allows overwriting an existing key", () => {
    const cache = new TtlCache<string>(60_000);
    cache.set("key", "first");
    cache.set("key", "second");
    expect(cache.get("key")).toBe("second");
  });
});

// ---------------------------------------------------------------------------
// ReferenceDataCache — deduplication and error handling
// ---------------------------------------------------------------------------

function makeClient(
  handler: (path: string, params?: Record<string, unknown>) => Promise<unknown>,
): ServiceTitanClient {
  return { get: vi.fn(handler) } as unknown as ServiceTitanClient;
}

describe("ReferenceDataCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("caches result after first load (loader called only once)", async () => {
    const loader = vi.fn().mockResolvedValue({
      data: [{ id: 1, name: "Tech One" }],
      hasMore: false,
      page: 1,
    });
    const client = makeClient(loader);
    const cache = new ReferenceDataCache();

    const first = await cache.getTechnicians(client);
    const second = await cache.getTechnicians(client);

    expect(first).toEqual(second);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent in-flight requests for the same key", async () => {
    let resolve!: (v: unknown) => void;
    const pending = new Promise((r) => {
      resolve = r;
    });
    const loader = vi.fn().mockReturnValue(pending);
    const client = makeClient(loader);
    const cache = new ReferenceDataCache();

    // Fire two concurrent requests before the first one resolves
    const p1 = cache.getTechnicians(client);
    const p2 = cache.getTechnicians(client);

    resolve({ data: [{ id: 99, name: "Only Once" }], hasMore: false, page: 1 });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(r2);
  });

  it("does not cache loader errors — retry succeeds on second call", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce({
        data: [{ id: 5, name: "Recovered" }],
        hasMore: false,
        page: 1,
      });
    const client = makeClient(loader);
    const cache = new ReferenceDataCache();

    await expect(cache.getTechnicians(client)).rejects.toThrow("network blip");

    // Second call should retry the loader, not surface the cached error
    const result = await cache.getTechnicians(client);
    expect(result).toEqual([{ id: 5, name: "Recovered" }]);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("evicts entries after TTL expires and re-fetches on next access", async () => {
    const shortTtlMs = 1_000;
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 1, name: "First" }], hasMore: false, page: 1 })
      .mockResolvedValueOnce({ data: [{ id: 2, name: "Second" }], hasMore: false, page: 1 });
    const client = makeClient(loader);
    const cache = new ReferenceDataCache(shortTtlMs);

    const first = await cache.getTechnicians(client);
    expect(first).toEqual([{ id: 1, name: "First" }]);

    // Advance past TTL
    vi.advanceTimersByTime(shortTtlMs + 1);

    const second = await cache.getTechnicians(client);
    expect(second).toEqual([{ id: 2, name: "Second" }]);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("returns technician name from cache by ID", async () => {
    const loader = vi.fn().mockResolvedValue({
      data: [
        { id: 10, name: "Alex R" },
        { id: 11, firstName: "Jordan", lastName: "K" },
      ],
      hasMore: false,
      page: 1,
    });
    const client = makeClient(loader);
    const cache = new ReferenceDataCache();

    expect(await cache.getTechnicianName(client, 10)).toBe("Alex R");
    expect(await cache.getTechnicianName(client, 11)).toBe("Jordan K");
    expect(await cache.getTechnicianName(client, 999)).toBe("Technician 999");
  });

  it("clear() removes cached data and in-flight state", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 1, name: "BU One" }], hasMore: false, page: 1 })
      .mockResolvedValueOnce({ data: [{ id: 2, name: "BU Two" }], hasMore: false, page: 1 });
    const client = makeClient(loader);
    const cache = new ReferenceDataCache();

    await cache.getBusinessUnits(client);
    cache.clear();
    const second = await cache.getBusinessUnits(client);

    expect(second).toEqual([{ id: 2, name: "BU Two" }]);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("findTechniciansByName returns partial matches case-insensitively", async () => {
    const loader = vi.fn().mockResolvedValue({
      data: [
        { id: 1, name: "Alex Ramirez" },
        { id: 2, name: "raheem khan" },
        { id: 3, name: "John Smith" },
      ],
      hasMore: false,
      page: 1,
    });
    const client = makeClient(loader);
    const cache = new ReferenceDataCache();

    const hits = await cache.findTechniciansByName(client, "gonzalo");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: 1 });

    const raheem = await cache.findTechniciansByName(client, "RAHEEM");
    expect(raheem).toHaveLength(1);
    expect(raheem[0]).toMatchObject({ id: 2 });
  });

  it("findTechniciansByName returns empty array for blank query", async () => {
    const loader = vi.fn().mockResolvedValue({
      data: [{ id: 1, name: "Anyone" }],
      hasMore: false,
      page: 1,
    });
    const client = makeClient(loader);
    const cache = new ReferenceDataCache();

    expect(await cache.findTechniciansByName(client, "   ")).toEqual([]);
    expect(loader).not.toHaveBeenCalled();
  });
});
