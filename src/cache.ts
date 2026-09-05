import type { ServiceTitanClient } from "./client.js";
import { getRequestContext, throwIfAborted } from "./request-context.js";

export type GenericRecord = Record<string, unknown>;

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 50;

interface CacheLogger {
  warn(message: string, context?: Record<string, unknown>): void;
}

const defaultCacheLogger: CacheLogger = {
  warn(message, context) {
    if (context) {
      console.warn(message, context);
      return;
    }

    console.warn(message);
  },
};

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

function isRecord(value: unknown): value is GenericRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractItems(response: unknown): GenericRecord[] {
  if (Array.isArray(response)) {
    return response.filter(isRecord);
  }

  if (isRecord(response) && Array.isArray(response.data)) {
    return response.data.filter(isRecord);
  }

  return [];
}

function hasMorePages(response: unknown): boolean {
  return isRecord(response) && response.hasMore === true;
}

function toText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function toInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  return null;
}

function getValue(record: GenericRecord, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = record;

  for (const segment of segments) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function firstValue(record: GenericRecord, paths: string[]): unknown {
  for (const path of paths) {
    const value = getValue(record, path);
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

function combineNames(parts: Array<string | null>): string | null {
  const joined = parts.filter((part): part is string => part !== null).join(" ").trim();
  return joined.length > 0 ? joined : null;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function recordId(record: GenericRecord): number | null {
  return toInteger(
    firstValue(record, ["id", "technicianId", "businessUnitId", "paymentTypeId", "membershipTypeId"]),
  );
}

function technicianName(record: GenericRecord, fallbackId?: number): string {
  const fullName = toText(firstValue(record, ["name", "displayName", "fullName"]));
  if (fullName) {
    return fullName;
  }

  const combined = combineNames([
    toText(firstValue(record, ["firstName"])),
    toText(firstValue(record, ["lastName"])),
  ]);
  if (combined) {
    return combined;
  }

  const nickname = toText(firstValue(record, ["nickname"]));
  if (nickname) {
    return nickname;
  }

  return fallbackId === undefined ? "Unknown Technician" : `Technician ${fallbackId}`;
}

function businessUnitName(record: GenericRecord, fallbackId?: number): string {
  const name = toText(firstValue(record, ["name", "displayName"]));
  if (name) {
    return name;
  }

  return fallbackId === undefined ? "Unknown Business Unit" : `Business Unit ${fallbackId}`;
}

function technicianSearchTerms(record: GenericRecord): string[] {
  const terms = new Set<string>();
  const id = recordId(record) ?? undefined;

  const add = (value: string | null): void => {
    if (!value) {
      return;
    }

    const normalized = normalizeText(value);
    if (normalized.length > 0) {
      terms.add(normalized);
    }
  };

  add(technicianName(record, id));
  add(combineNames([toText(firstValue(record, ["firstName"])), toText(firstValue(record, ["lastName"]))]));
  add(toText(firstValue(record, ["firstName"])));
  add(toText(firstValue(record, ["lastName"])));
  add(toText(firstValue(record, ["nickname"])));

  return [...terms];
}

async function fetchAllPages(
  client: ServiceTitanClient,
  path: string,
  params: Record<string, unknown> = {},
  maxPages: number = DEFAULT_MAX_PAGES,
  logger: CacheLogger = defaultCacheLogger,
): Promise<GenericRecord[]> {
  const allItems: GenericRecord[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await client.get(path, {
      ...params,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      includeTotal: true,
    });
    throwIfAborted(getRequestContext().signal);

    const items = extractItems(response);
    allItems.push(...items);

    const hasMore = hasMorePages(response);
    if (hasMore && items.length === 0) {
      throw new Error(`Reference data pagination returned an empty page with hasMore=true for ${path}; refusing to cache incomplete data`);
    }
    if (page === maxPages && hasMore) {
      logger.warn("Reference data cache truncated at max pages, some records may be missing", {
        maxPages,
        endpoint: path,
      });
      throw new Error(`Reference data pagination exceeded ${maxPages} pages for ${path}; refusing to cache incomplete data`);
    }

    if (!hasMore) {
      break;
    }
  }

  return allItems;
}

export class TtlCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number = DEFAULT_TTL_MS) {
    this.assertPositiveTtl(ttlMs);
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T, ttlMs: number = this.ttlMs): void {
    this.assertPositiveTtl(ttlMs);
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  clear(): void {
    this.store.clear();
  }

  private assertPositiveTtl(ttlMs: number): void {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error(`ttlMs must be a positive number. Received: ${ttlMs}`);
    }
  }
}

export class ReferenceDataCache {
  private clientStates = new WeakMap<object, { cache: TtlCache<GenericRecord[]>; inFlight: Map<string, Promise<GenericRecord[]>> }>();

  constructor(
    ttlMs: number = DEFAULT_TTL_MS,
    private readonly logger: CacheLogger = defaultCacheLogger,
  ) {
    this.ttlMs = ttlMs;
  }

  private readonly ttlMs: number;

  clear(): void {
    this.clientStates = new WeakMap();
  }

  async getTechnicians(
    client: ServiceTitanClient,
    ttlMs?: number,
  ): Promise<GenericRecord[]> {
    return this.getOrLoad(client, "technicians", () =>
      fetchAllPages(
        client,
        "/tenant/{tenant}/technicians",
        { active: "Any" },
        DEFAULT_MAX_PAGES,
        this.logger,
      ),
      ttlMs,
    );
  }

  async getBusinessUnits(
    client: ServiceTitanClient,
    ttlMs?: number,
  ): Promise<GenericRecord[]> {
    return this.getOrLoad(client, "business-units", () =>
      fetchAllPages(
        client,
        "/tenant/{tenant}/business-units",
        { active: "Any" },
        DEFAULT_MAX_PAGES,
        this.logger,
      ),
      ttlMs,
    );
  }

  async getPaymentTypes(
    client: ServiceTitanClient,
    ttlMs?: number,
  ): Promise<GenericRecord[]> {
    return this.getOrLoad(client, "payment-types", () =>
      fetchAllPages(
        client,
        "/tenant/{tenant}/payment-types",
        { active: "Any" },
        DEFAULT_MAX_PAGES,
        this.logger,
      ),
      ttlMs,
    );
  }

  async getMembershipTypes(
    client: ServiceTitanClient,
    ttlMs?: number,
  ): Promise<GenericRecord[]> {
    return this.getOrLoad(client, "membership-types", () =>
      fetchAllPages(
        client,
        "/tenant/{tenant}/membership-types",
        { active: "Any" },
        DEFAULT_MAX_PAGES,
        this.logger,
      ),
      ttlMs,
    );
  }

  async getTechnicianName(client: ServiceTitanClient, techId: number): Promise<string> {
    const technicians = await this.getTechnicians(client);
    const match = technicians.find((technician) => recordId(technician) === techId);
    return match ? technicianName(match, techId) : `Technician ${techId}`;
  }

  async getBusinessUnitName(client: ServiceTitanClient, buId: number): Promise<string> {
    const businessUnits = await this.getBusinessUnits(client);
    const match = businessUnits.find((businessUnit) => recordId(businessUnit) === buId);
    return match ? businessUnitName(match, buId) : `Business Unit ${buId}`;
  }

  async findTechniciansByName(
    client: ServiceTitanClient,
    name: string,
  ): Promise<GenericRecord[]> {
    const query = normalizeText(name);
    if (query.length === 0) {
      return [];
    }

    const technicians = await this.getTechnicians(client);
    return technicians.filter((technician) =>
      technicianSearchTerms(technician).some((term) => term.includes(query)),
    );
  }

  private async getOrLoad(
    client: ServiceTitanClient,
    namespace: string,
    loader: () => Promise<GenericRecord[]>,
    ttlMs?: number,
  ): Promise<GenericRecord[]> {
    throwIfAborted(getRequestContext().signal);
    let state = this.clientStates.get(client as object);
    if (!state) {
      state = { cache: new TtlCache<GenericRecord[]>(this.ttlMs), inFlight: new Map() };
      this.clientStates.set(client as object, state);
    }
    const cached = state.cache.get(namespace);
    if (cached !== undefined) {
      return cached;
    }

    const deduplicate = getRequestContext().signal === undefined;
    const existingRequest = deduplicate ? state.inFlight.get(namespace) : undefined;
    if (existingRequest) {
      return existingRequest;
    }

    const request = loader()
      .then((value) => {
        throwIfAborted(getRequestContext().signal);
        state!.cache.set(namespace, value, ttlMs);
        if (state!.inFlight.get(namespace) === request) state!.inFlight.delete(namespace);
        return value;
      })
      .catch((error: unknown) => {
        if (state!.inFlight.get(namespace) === request) state!.inFlight.delete(namespace);
        throw error;
      });

    if (deduplicate) state.inFlight.set(namespace, request);
    return request;
  }
}

export const referenceCache = new ReferenceDataCache();
