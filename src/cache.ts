import type { ServiceTitanClient } from "./client.js";

export type GenericRecord = Record<string, unknown>;

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 50;

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
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
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
): Promise<GenericRecord[]> {
  const allItems: GenericRecord[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await client.get(path, {
      ...params,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      includeTotal: true,
    });

    const items = extractItems(response);
    allItems.push(...items);

    if (!hasMorePages(response) || items.length === 0) {
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
  private readonly cache: TtlCache<GenericRecord[]>;
  private readonly inFlight = new Map<string, Promise<GenericRecord[]>>();

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.cache = new TtlCache<GenericRecord[]>(ttlMs);
  }

  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
  }

  async getTechnicians(
    client: ServiceTitanClient,
    ttlMs?: number,
  ): Promise<GenericRecord[]> {
    return this.getOrLoad("technicians", () =>
      fetchAllPages(client, "/tenant/{tenant}/technicians", { active: "Any" }),
      ttlMs,
    );
  }

  async getBusinessUnits(
    client: ServiceTitanClient,
    ttlMs?: number,
  ): Promise<GenericRecord[]> {
    return this.getOrLoad("business-units", () =>
      fetchAllPages(client, "/tenant/{tenant}/business-units", { active: "Any" }),
      ttlMs,
    );
  }

  async getPaymentTypes(
    client: ServiceTitanClient,
    ttlMs?: number,
  ): Promise<GenericRecord[]> {
    return this.getOrLoad("payment-types", () =>
      fetchAllPages(client, "/tenant/{tenant}/payment-types", { active: "Any" }),
      ttlMs,
    );
  }

  async getMembershipTypes(
    client: ServiceTitanClient,
    ttlMs?: number,
  ): Promise<GenericRecord[]> {
    return this.getOrLoad("membership-types", () =>
      fetchAllPages(client, "/tenant/{tenant}/membership-types", { active: "Any" }),
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
    key: string,
    loader: () => Promise<GenericRecord[]>,
    ttlMs?: number,
  ): Promise<GenericRecord[]> {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const existingRequest = this.inFlight.get(key);
    if (existingRequest) {
      return existingRequest;
    }

    const request = loader()
      .then((value) => {
        this.cache.set(key, value, ttlMs);
        this.inFlight.delete(key);
        return value;
      })
      .catch((error: unknown) => {
        this.inFlight.delete(key);
        throw error;
      });

    this.inFlight.set(key, request);
    return request;
  }
}

export const referenceCache = new ReferenceDataCache();
