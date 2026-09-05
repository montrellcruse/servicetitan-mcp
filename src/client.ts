import https from "node:https";
import axios, { type AxiosAdapter, type AxiosError, type AxiosInstance } from "axios";

import type { ServiceTitanConfig } from "./config.js";
import { findOfficialOperation } from "./contracts/operations.js";
import { resolveServiceTitanPath } from "./contracts/resolve-route.js";
import { redactSensitiveText } from "./audit.js";
import { awaitWithSignal, getRequestContext, sleepWithSignal, throwIfAborted } from "./request-context.js";
import { buildParams } from "./utils.js";

const TOKEN_EXPIRY_BUFFER_MS = 60_000;
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 10, timeout: 60_000 });

export const ENVIRONMENTS = {
  integration: { authUrl: "https://auth-integration.servicetitan.io", apiUrl: "https://api-integration.servicetitan.io" },
  production: { authUrl: "https://auth.servicetitan.io", apiUrl: "https://api.servicetitan.io" },
} as const;

type RequestPhase = "auth" | "resource" | "queue";
interface ErrorDetails {
  phase?: RequestPhase;
  code?: string;
  traceId?: string;
  retryAfterMs?: number;
  retryable?: boolean;
  outcomeUnknown?: boolean;
}

export class ServiceTitanApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly path: string,
    public readonly details: Readonly<ErrorDetails> = {},
  ) {
    super(message);
    this.name = "ServiceTitanApiError";
  }

  toJSON(): { status: number; message: string; path: string } & ErrorDetails {
    return { status: this.status, message: this.message, path: this.path, ...this.details };
  }
}

export interface ClientRequestEvent {
  method: string;
  path: string;
  elapsedMs: number;
  attempts: number;
  status: number;
  phase?: RequestPhase;
  traceId?: string;
}

export interface ServiceTitanClientOptions {
  maxConcurrentRequests?: number;
  maxQueuedRequests?: number;
  /** Reject a longer server-requested wait without retrying early. */
  maxRetryDelayMs?: number;
  requestTimeoutMs?: number;
  authTimeoutMs?: number;
  onRequestComplete?: (event: ClientRequestEvent) => void;
  /** Test/embedding adapters; URLs and credentials remain config-owned. */
  adapter?: AxiosAdapter;
  authAdapter?: AxiosAdapter;
}

interface GateWaiter { grant: () => void; cancel: () => void }

class RequestGate {
  active = 0;
  private readonly waiting: GateWaiter[] = [];
  constructor(private readonly limit: number, private readonly maxQueued: number) {}
  get queued(): number { return this.waiting.length; }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    throwIfAborted(signal);
    if (this.active < this.limit) {
      this.active += 1;
      return () => this.release();
    }
    if (this.waiting.length >= this.maxQueued) {
      throw new ServiceTitanApiError(0, "Request queue is full; retry after current requests finish.", "", { phase: "queue", code: "QUEUE_FULL", retryable: true });
    }
    return new Promise((resolve, reject) => {
      const waiter: GateWaiter = {
        grant: () => {
          signal?.removeEventListener("abort", waiter.cancel);
          this.active += 1;
          resolve(() => this.release());
        },
        cancel: () => {
          const index = this.waiting.indexOf(waiter);
          if (index !== -1) this.waiting.splice(index, 1);
          signal?.removeEventListener("abort", waiter.cancel);
          reject(new DOMException("Request cancelled", "AbortError"));
        },
      };
      this.waiting.push(waiter);
      signal?.addEventListener("abort", waiter.cancel, { once: true });
    });
  }

  private release(): void {
    this.active -= 1;
    this.waiting.shift()?.grant();
  }
}

interface TokenSnapshot { value: string; generation: number }
interface TokenFlight {
  promise: Promise<TokenSnapshot>;
  controller: AbortController;
  waiters: number;
  settled: boolean;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

/** Retry-After is delta-seconds or an HTTP date; never permissively parse prefixes. */
export function retryAfterMilliseconds(value: unknown, now = Date.now()): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value * 1000;
  if (typeof value !== "string") return 1000;
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    return Number.isFinite(seconds) ? seconds * 1000 : Number.POSITIVE_INFINITY;
  }
  // Only date-shaped values can enter Date.parse ("0"/"10oops" are not dates).
  if (/^[A-Za-z]{3},/.test(text)) {
    const date = Date.parse(text);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  return 1000;
}

export class ServiceTitanClient {
  private readonly http: AxiosInstance;
  private readonly authUrl: string;
  private readonly gate: RequestGate;
  private readonly maxRetryDelayMs: number;
  private readonly options: ServiceTitanClientOptions;
  private accessToken: TokenSnapshot | null = null;
  private tokenExpiration = 0;
  private tokenGeneration = 0;
  private tokenFlight: TokenFlight | null = null;
  private resourceCooldownUntil = 0;
  private authCooldownUntil = 0;
  private readonly counters = { requests: 0, failures: 0, resourceAttempts: 0, authAcquisitions: 0, retries401: 0, retries429: 0, authRetries429: 0 };

  constructor(private readonly config: ServiceTitanConfig, options: ServiceTitanClientOptions = {}) {
    this.options = options;
    const environment = ENVIRONMENTS[config.environment];
    this.authUrl = environment.authUrl;
    this.maxRetryDelayMs = positiveInteger(options.maxRetryDelayMs ?? 60_000, "maxRetryDelayMs");
    if (this.maxRetryDelayMs > 300_000) throw new Error("maxRetryDelayMs cannot exceed 300000");
    this.gate = new RequestGate(positiveInteger(options.maxConcurrentRequests ?? 8, "maxConcurrentRequests"), positiveInteger(options.maxQueuedRequests ?? 128, "maxQueuedRequests"));
    this.http = axios.create({
      baseURL: environment.apiUrl,
      timeout: positiveInteger(options.requestTimeoutMs ?? 60_000, "requestTimeoutMs"),
      httpsAgent,
      ...(options.adapter ? { adapter: options.adapter } : {}),
    });
    positiveInteger(options.authTimeoutMs ?? 15_000, "authTimeoutMs");
  }

  getMetrics(): Readonly<typeof this.counters & { activeRequests: number; queuedRequests: number }> {
    return { ...this.counters, activeRequests: this.gate.active, queuedRequests: this.gate.queued };
  }

  async get(path: string, params?: Record<string, unknown>): Promise<unknown> { return this.request("get", path, undefined, params); }
  async post(path: string, body?: unknown, params?: Record<string, unknown>): Promise<unknown> { return this.request("post", path, body, params); }
  async put(path: string, body?: unknown, params?: Record<string, unknown>): Promise<unknown> { return this.request("put", path, body, params); }
  async patch(path: string, body?: unknown, params?: Record<string, unknown>): Promise<unknown> { return this.request("patch", path, body, params); }
  async delete(path: string, params?: Record<string, unknown>): Promise<unknown> { return this.request("delete", path, undefined, params); }
  async deleteWithBody(path: string, body?: unknown, params?: Record<string, unknown>): Promise<unknown> { return this.request("delete", path, body, params); }
  async ensureToken(): Promise<void> { await this.getAccessToken(getRequestContext().signal); }

  async prewarm(): Promise<void> {
    try { await this.ensureToken(); } catch { /* Startup remains available for diagnostics/recovery. */ }
  }

  private async request(method: string, path: string, body?: unknown, params?: Record<string, unknown>): Promise<unknown> {
    const resolvedPath = resolveServiceTitanPath(path, this.config.tenantId, method);
    // This exact pinned Reporting operation reads data using POST. No caller
    // metadata or broader reporting prefix can declare another write safe.
    const reportOperation = method === "post" && resolvedPath.startsWith("/reporting/v2/")
      ? findOfficialOperation(method, resolvedPath) : undefined;
    const isReportDataRead = reportOperation?.id === "ReportCategoryReports_GetData"
      && reportOperation.document === "tenant-reporting-v2.json"
      && reportOperation.method === "POST"
      && reportOperation.fullPath === "/reporting/v2/tenant/{tenant}/report-category/{report_category}/reports/{reportId}/data";
    const mutation = method !== "get" && !isReportDataRead;
    const signal = getRequestContext().signal;
    const started = Date.now();
    let attempts = 0;
    let status = 0;
    let failure: ServiceTitanApiError | undefined;
    let retried401 = false;
    let retried429 = false;
    this.counters.requests += 1;
    try {
      for (;;) {
        throwIfAborted(signal);
        const release = await this.gate.acquire(signal);
        let rejectedGeneration: number | undefined;
        let rateLimitError: AxiosError | undefined;
        try {
          // Auth failure is outside the resource-response catch. Its config can
          // never be replayed as a business request or returned as business data.
          await this.waitForCooldown("resource", resolvedPath, signal);
          const token = await this.getAccessToken(signal);
          throwIfAborted(signal);
          attempts += 1;
          this.counters.resourceAttempts += 1;
          try {
            const response = await this.http.request({
              method, url: resolvedPath, params: params ? buildParams(params) : undefined, data: body, signal,
              headers: { Authorization: `Bearer ${token.value}`, "ST-App-Key": this.config.appKey },
            });
            status = response.status;
            return response.data;
          } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 401 && !retried401) {
              retried401 = true;
              rejectedGeneration = token.generation;
              this.counters.retries401 += 1;
            } else if (axios.isAxiosError(error) && error.response?.status === 429) {
              this.recordCooldown(error, "resource");
              if (retried429) throw this.sanitizeError(error, resolvedPath, "resource", mutation);
              retried429 = true;
              rateLimitError = error;
            } else {
              throw this.sanitizeError(error, resolvedPath, "resource", mutation);
            }
          }
        } finally {
          release();
        }
        if (rejectedGeneration !== undefined) {
          // A delayed 401 for an older token must not discard a newer token.
          if (this.accessToken?.generation === rejectedGeneration) {
            this.accessToken = null;
            this.tokenExpiration = 0;
          }
          continue;
        }
        if (rateLimitError) {
          this.retryDelay(rateLimitError, resolvedPath, "resource");
          this.counters.retries429 += 1;
        }
      }
    } catch (error) {
      failure = error instanceof ServiceTitanApiError ? error : this.sanitizeError(error, resolvedPath, "resource", false);
      status = failure.status;
      this.counters.failures += 1;
      throw failure;
    } finally {
      try {
        this.options.onRequestComplete?.({ method, path: resolvedPath, elapsedMs: Date.now() - started, attempts, status, phase: failure?.details.phase, traceId: failure?.details.traceId });
      } catch { /* Observability callbacks must not change a business outcome. */ }
    }
  }

  private async waitForCooldown(phase: "auth" | "resource", path: string, signal?: AbortSignal): Promise<void> {
    for (;;) {
      throwIfAborted(signal);
      const until = phase === "auth" ? this.authCooldownUntil : this.resourceCooldownUntil;
      const remaining = until - Date.now();
      if (remaining <= 0) return;
      // Remember even an excessive delay across calls, without allocating an
      // overflowing timer or allowing a new call to retry early.
      if (remaining > this.maxRetryDelayMs) throw this.retryBudgetError(remaining, path, phase);
      await sleepWithSignal(remaining, signal);
    }
  }

  private async getAccessToken(signal?: AbortSignal): Promise<TokenSnapshot> {
    throwIfAborted(signal);
    if (this.accessToken && Date.now() < this.tokenExpiration - TOKEN_EXPIRY_BUFFER_MS) return this.accessToken;
    let flight = this.tokenFlight;
    if (!flight || flight.controller.signal.aborted) {
      const controller = new AbortController();
      flight = { controller, waiters: 0, settled: false, promise: Promise.resolve({ value: "", generation: 0 }) };
      const current = flight;
      current.promise = this.fetchAccessToken(controller.signal).finally(() => {
        current.settled = true;
        if (this.tokenFlight === current) this.tokenFlight = null;
      });
      this.tokenFlight = current;
    }
    flight.waiters += 1;
    try {
      return await awaitWithSignal(flight.promise, signal);
    } finally {
      flight.waiters -= 1;
      if (flight.waiters === 0 && !flight.settled) flight.controller.abort();
    }
  }

  private async fetchAccessToken(signal: AbortSignal): Promise<TokenSnapshot> {
    const form = new URLSearchParams({ grant_type: "client_credentials", client_id: this.config.clientId, client_secret: this.config.clientSecret });
    for (let attempt = 0; ; attempt += 1) {
      throwIfAborted(signal);
      await this.waitForCooldown("auth", "/connect/token", signal);
      try {
        this.counters.authAcquisitions += 1;
        const response = await axios.post<{ access_token: string; expires_in: number }>(`${this.authUrl}/connect/token`, form.toString(), {
          headers: { "Content-Type": "application/x-www-form-urlencoded" }, httpsAgent, signal,
          timeout: this.options.authTimeoutMs ?? 15_000,
          ...(this.options.authAdapter ? { adapter: this.options.authAdapter } : {}),
        });
        const value = response.data?.access_token;
        const expires = Number(response.data?.expires_in ?? 0);
        if (typeof value !== "string" || !value || !Number.isFinite(expires) || expires <= 0) {
          throw new Error("Invalid token response from ServiceTitan auth endpoint");
        }
        throwIfAborted(signal);
        const token = { value, generation: ++this.tokenGeneration };
        this.accessToken = token;
        this.tokenExpiration = Date.now() + expires * 1000;
        return token;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          this.recordCooldown(error, "auth");
          if (attempt !== 0) throw this.sanitizeError(error, "/connect/token", "auth", false);
          this.retryDelay(error, "/connect/token", "auth");
          this.counters.authRetries429 += 1;
        } else {
          throw this.sanitizeError(error, "/connect/token", "auth", false);
        }
      }
    }
  }

  private retryDelay(error: AxiosError, path: string, phase: RequestPhase): number {
    const delay = retryAfterMilliseconds(error.response?.headers?.["retry-after"]);
    if (!Number.isFinite(delay) || delay > this.maxRetryDelayMs) {
      throw this.retryBudgetError(delay, path, phase);
    }
    return delay;
  }

  private recordCooldown(error: AxiosError, phase: "auth" | "resource"): void {
    const delay = retryAfterMilliseconds(error.response?.headers?.["retry-after"]);
    const until = Math.min(Number.MAX_SAFE_INTEGER, Date.now() + delay);
    if (phase === "auth") this.authCooldownUntil = Math.max(this.authCooldownUntil, until);
    else this.resourceCooldownUntil = Math.max(this.resourceCooldownUntil, until);
  }

  private retryBudgetError(delay: number, path: string, phase: RequestPhase): ServiceTitanApiError {
    return new ServiceTitanApiError(429, "ServiceTitan requested a retry delay beyond this request's wait budget; no early retry was made.", path, { phase, code: "RETRY_DELAY_EXCEEDED", retryAfterMs: Number.isFinite(delay) ? delay : undefined, retryable: true });
  }

  private sanitizeError(error: unknown, path: string, phase: RequestPhase, mutation: boolean): ServiceTitanApiError {
    if (error instanceof ServiceTitanApiError) return error;
    const cancelled = error instanceof Error && error.name === "AbortError" || axios.isCancel?.(error);
    const status = axios.isAxiosError(error) ? error.response?.status ?? 0 : 0;
    const message = cancelled ? "Request cancelled" : axios.isAxiosError(error) ? this.extractServiceTitanMessage(error) : error instanceof Error ? error.message : "Unknown request error";
    const data = axios.isAxiosError(error) ? error.response?.data : undefined;
    const trace = data && typeof data === "object" && typeof data.traceId === "string" ? data.traceId : undefined;
    const secrets = [this.config.clientSecret, this.config.appKey, this.accessToken?.value ?? ""];
    const outcomeUnknown = mutation && (status === 0 || status >= 500);
    const safeMessage = redactSensitiveText(message, secrets) + (outcomeUnknown
      ? " The write may have completed in ServiceTitan. Verify its result before retrying."
      : "");
    return new ServiceTitanApiError(status, safeMessage, path, {
      phase, code: cancelled ? "CANCELLED" : axios.isAxiosError(error) ? error.code : undefined,
      traceId: trace && /^[A-Za-z0-9_-]{1,200}$/.test(trace) ? trace : undefined,
      retryable: !outcomeUnknown && !cancelled && (status === 429 || status >= 500 || status === 0),
      // A sent write that times out/cancels can still have committed upstream.
      ...(outcomeUnknown ? { outcomeUnknown: true } : {}),
    });
  }

  private extractServiceTitanMessage(error: AxiosError): string {
    const data = error.response?.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      if (record.errors && typeof record.errors === "object") {
        const details = Object.entries(record.errors).map(([field, reasons]) => `${field}: ${Array.isArray(reasons) ? reasons.filter((item) => typeof item === "string").join("; ") : String(reasons)}`).join(" | ");
        if (details) return `${typeof record.title === "string" ? record.title : "Validation error"} — ${details}`;
      }
      if (typeof record.title === "string" && record.title.trim()) return `${record.title}${typeof record.detail === "string" ? ` — ${record.detail}` : ""}`;
      for (const field of ["message", "error_description", "error"]) {
        if (typeof record[field] === "string" && record[field].trim()) return record[field];
      }
    }
    return error.message || "Request failed";
  }
}
