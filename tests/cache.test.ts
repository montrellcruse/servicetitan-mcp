import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReferenceDataCache, TtlCache } from "../src/cache.js";
import type { ServiceTitanClient } from "../src/client.js";
import { awaitWithSignal, getRequestContext, withRequestContext } from "../src/request-context.js";

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

  it("does not share an abortable reference-data load between callers", async () => {
    const firstController=new AbortController(),secondController=new AbortController();
    let resolve!:()=>void;const source=new Promise<void>(done=>{resolve=done;});let calls=0;
    const client=makeClient(async()=>{calls+=1;await awaitWithSignal(source,getRequestContext().signal);return {data:[{id:calls}],hasMore:false};});
    const cache=new ReferenceDataCache();
    const first=withRequestContext({signal:firstController.signal},()=>cache.getTechnicians(client));
    const second=withRequestContext({signal:secondController.signal},()=>cache.getTechnicians(client));
    firstController.abort();resolve();
    await expect(first).rejects.toMatchObject({name:"AbortError"});
    await expect(second).resolves.toHaveLength(1);
    expect(calls).toBe(2);
  });

  it("isolates cached reference data between clients", async () => {
    const firstLoader = vi.fn().mockResolvedValue({ data: [{ id: 1, name: "Tenant A" }], hasMore: false });
    const secondLoader = vi.fn().mockResolvedValue({ data: [{ id: 2, name: "Tenant B" }], hasMore: false });
    const cache = new ReferenceDataCache();

    expect(await cache.getBusinessUnits(makeClient(firstLoader))).toEqual([{ id: 1, name: "Tenant A" }]);
    expect(await cache.getBusinessUnits(makeClient(secondLoader))).toEqual([{ id: 2, name: "Tenant B" }]);
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

  it("supports per-call TTL overrides on cached reference data", async () => {
    const defaultTtlMs = 60_000;
    const overrideTtlMs = 1_000;
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 1, name: "First" }], hasMore: false, page: 1 })
      .mockResolvedValueOnce({ data: [{ id: 2, name: "Second" }], hasMore: false, page: 1 });
    const client = makeClient(loader);
    const cache = new ReferenceDataCache(defaultTtlMs);

    const first = await cache.getTechnicians(client, overrideTtlMs);
    expect(first).toEqual([{ id: 1, name: "First" }]);

    vi.advanceTimersByTime(overrideTtlMs + 1);

    const second = await cache.getTechnicians(client, overrideTtlMs);
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

  it("does not match malformed string IDs when resolving cached records", async () => {
    const loader = vi.fn().mockResolvedValue({
      data: [
        { id: "12abc", name: "Malformed" },
        { id: "12", name: "Valid" },
      ],
      hasMore: false,
      page: 1,
    });
    const client = makeClient(loader);
    const cache = new ReferenceDataCache();

    expect(await cache.getTechnicianName(client, 12)).toBe("Valid");
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
        { id: 2, name: "jordan khan" },
        { id: 3, name: "John Smith" },
      ],
      hasMore: false,
      page: 1,
    });
    const client = makeClient(loader);
    const cache = new ReferenceDataCache();

    const hits = await cache.findTechniciansByName(client, "alex");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: 1 });

    const jordan = await cache.findTechniciansByName(client, "JORDAN");
    expect(jordan).toHaveLength(1);
    expect(jordan[0]).toMatchObject({ id: 2 });
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

  it("rejects and does not cache reference data truncated at the max page limit", async () => {
    const warn = vi.fn();
    const loader = vi.fn().mockImplementation(
      async (_path: string, params?: Record<string, unknown>) => {
        const page = Number(params?.page ?? 1);
        return {
          data: [{ id: page, name: `Tech ${page}` }],
          hasMore: true,
          page,
        };
      },
    );
    const client = makeClient(loader);
    const cache = new ReferenceDataCache(60_000, { warn });

    await expect(cache.getTechnicians(client)).rejects.toThrow(/refusing to cache incomplete data/);
    expect(loader).toHaveBeenCalledTimes(50);
    expect(warn).toHaveBeenCalledWith(
      "Reference data cache truncated at max pages, some records may be missing",
      expect.objectContaining({
        maxPages: 50,
        endpoint: "/tenant/{tenant}/technicians",
      }),
    );
    await expect(cache.getTechnicians(client)).rejects.toThrow(/refusing to cache incomplete data/);
    expect(loader).toHaveBeenCalledTimes(100);
  });

  it("rejects and does not cache an empty page that claims more data", async () => {
    const loader=vi.fn().mockResolvedValue({data:[],hasMore:true,page:1});
    const cache=new ReferenceDataCache(60_000,{warn:vi.fn()});
    const client=makeClient(loader);
    await expect(cache.getBusinessUnits(client)).rejects.toThrow(/empty page with hasMore=true/);
    await expect(cache.getBusinessUnits(client)).rejects.toThrow(/empty page with hasMore=true/);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
