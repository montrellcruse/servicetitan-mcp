import axios, { AxiosError, CanceledError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ServiceTitanClient, ServiceTitanApiError, retryAfterMilliseconds } from "../src/client.js";
import { loadConfig } from "../src/config.js";
import { withRequestContext } from "../src/request-context.js";

const config = () => loadConfig({ ST_CLIENT_ID: "test-client", ST_CLIENT_SECRET: "test-client-secret", ST_APP_KEY: "test-app-key", ST_TENANT_ID: "42" });
const response = (request: InternalAxiosRequestConfig, data: unknown, status = 200, headers = {}) => ({ config: request, data, status, statusText: String(status), headers });
const rejection = (request: InternalAxiosRequestConfig, status: number, headers = {}, data: unknown = {}) => new AxiosError(`HTTP ${status}`, "ERR_BAD_RESPONSE", request, undefined, response(request, data, status, headers));
const tokenAdapter: AxiosAdapter = async (request) => response(request, { access_token: "test-token", expires_in: 900 });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

afterEach(() => vi.useRealTimers());

const mutationTargets = [
  { method: "post", path: "/tenant/{tenant}/customers" },
  { method: "put", path: "/tenant/{tenant}/contacts/00000000-0000-4000-8000-000000000007" },
  { method: "patch", path: "/tenant/{tenant}/customers/7" },
  { method: "delete", path: "/tenant/{tenant}/contacts/00000000-0000-4000-8000-000000000007" },
] as const;
const failureKinds = ["timeout", "network", "500", "503", "cancel"] as const;
type FailureKind = typeof failureKinds[number];
function failRequest(request: InternalAxiosRequestConfig, kind: FailureKind, controller: AbortController): never {
  if (kind === "cancel") { controller.abort(); throw new CanceledError("Fixture cancellation", request); }
  if (kind === "timeout") throw new AxiosError("Fixture timeout", "ECONNABORTED", request);
  if (kind === "network") throw new AxiosError("Fixture network failure", "ERR_NETWORK", request);
  throw rejection(request, Number(kind));
}
function callMutation(client: ServiceTitanClient, target: typeof mutationTargets[number]) {
  return target.method === "delete" ? client.delete(target.path) : client[target.method](target.path, { fixture: true });
}
function serializedError(error: unknown): Record<string, unknown> {
  expect(error).toBeInstanceOf(ServiceTitanApiError);
  return JSON.parse(JSON.stringify((error as ServiceTitanApiError).toJSON()));
}

describe("sent mutation flags", () => {
  it.each(mutationTargets.flatMap(target => failureKinds.map(kind => ({ ...target, kind }))))("$method $kind cannot be presented as safely retryable", async target => {
    const controller = new AbortController();
    const events: Array<{ attempts: number; method: string }> = [];
    const auth = vi.fn(tokenAdapter);
    const resource = vi.fn(async (request: InternalAxiosRequestConfig) => failRequest(request, target.kind, controller));
    const client = new ServiceTitanClient(config(), { authAdapter: auth, adapter: resource, onRequestComplete: event => events.push(event) });
    const error = await withRequestContext({ signal: controller.signal }, () => callMutation(client, target)).catch(value => value);
    expect(serializedError(error)).toMatchObject({ phase: "resource", status: target.kind === "500" || target.kind === "503" ? Number(target.kind) : 0, outcomeUnknown: true, retryable: false });
    expect((error as Error).message).toContain("Verify its result before retrying");
    expect(resource).toHaveBeenCalledTimes(1); expect(auth).toHaveBeenCalledTimes(1);
    expect(events).toEqual([expect.objectContaining({ method: target.method, attempts: 1 })]);
    expect(client.getMetrics()).toMatchObject({ resourceAttempts: 1, retries401: 0, retries429: 0 });
  });
});

describe("report data POST classification", () => {
  const paths = [
    "/tenant/{tenant}/report-category/operations/reports/162/data",
    "/tenant/{tenant}/report-category/accounting/reports/166/data",
    "/reporting/v2/tenant/42/report-category/accounting/reports/166/data",
  ];
  it.each(paths.flatMap(path => failureKinds.map(kind => ({ path, kind }))))("$path $kind remains a read without adding automatic retries", async ({ path, kind }) => {
    const controller = new AbortController();
    const events: Array<{ attempts: number }> = [];
    const resource = vi.fn(async (request: InternalAxiosRequestConfig) => failRequest(request, kind, controller));
    const client = new ServiceTitanClient(config(), { authAdapter: tokenAdapter, adapter: resource, onRequestComplete: event => events.push(event) });
    const error = await withRequestContext({ signal: controller.signal }, () => client.post(path, { parameters: [] })).catch(value => value);
    const json = serializedError(error);
    expect(json).toMatchObject({ phase: "resource", retryable: kind !== "cancel" });
    expect(json).not.toHaveProperty("outcomeUnknown");
    expect(json.path).toMatch(/^\/reporting\/v2\/tenant\/42\/report-category\/(operations|accounting)\/reports\/\d+\/data$/);
    expect((error as Error).message).not.toMatch(/write may have completed|Verify its result before retrying/i);
    expect(resource).toHaveBeenCalledTimes(1);
    expect(events).toEqual([expect.objectContaining({ attempts: 1 })]);
    expect(client.getMetrics()).toMatchObject({ resourceAttempts: 1, retries401: 0, retries429: 0 });
  });

  it("does not classify a different reporting POST operation as the allowlisted read", async () => {
    const resource = vi.fn(async (request: InternalAxiosRequestConfig) => { throw rejection(request, 503); });
    const client = new ServiceTitanClient(config(), { authAdapter: tokenAdapter, adapter: resource });
    const error = await client.post("/tenant/{tenant}/report-category/accounting/reports/166/data/query", { parameters: [] }).catch(value => value);
    expect(serializedError(error)).toMatchObject({ outcomeUnknown: true, retryable: false });
    expect(resource).toHaveBeenCalledTimes(1);
  });

  it("retains GET retry metadata without retrying its 503 automatically", async () => {
    const resource = vi.fn(async (request: InternalAxiosRequestConfig) => { throw rejection(request, 503); });
    const client = new ServiceTitanClient(config(), { authAdapter: tokenAdapter, adapter: resource });
    const error = await client.get("/tenant/{tenant}/customers").catch(value => value);
    expect(serializedError(error)).toMatchObject({ retryable: true, status: 503 });
    expect(serializedError(error)).not.toHaveProperty("outcomeUnknown");
    expect(resource).toHaveBeenCalledTimes(1);
  });
});

describe("mutation failures before resource dispatch", () => {
  it.each(mutationTargets.flatMap(target => (["network", "503", "cancel"] as const).map(kind => ({ ...target, kind }))))("$method auth $kind does not create mutation uncertainty", async target => {
    const controller = new AbortController();
    const events: Array<{ attempts: number }> = [];
    const resource = vi.fn(tokenAdapter);
    const auth = vi.fn(async (request: InternalAxiosRequestConfig) => failRequest(request, target.kind, controller));
    const client = new ServiceTitanClient(config(), { adapter: resource, authAdapter: auth, onRequestComplete: event => events.push(event) });
    const error = await withRequestContext({ signal: controller.signal }, () => callMutation(client, target)).catch(value => value);
    const json = serializedError(error);
    expect(json).not.toHaveProperty("outcomeUnknown");
    expect(json.retryable).toBe(target.kind !== "cancel");
    if (target.kind !== "cancel") expect(json.phase).toBe("auth");
    expect(auth).toHaveBeenCalledTimes(1); expect(resource).not.toHaveBeenCalled();
    expect(events).toEqual([expect.objectContaining({ attempts: 0 })]);
    expect(client.getMetrics().resourceAttempts).toBe(0);
  });

  it.each(mutationTargets)("$method queue overflow and cancellation are not sent mutations", async target => {
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    const controller = new AbortController();
    const events: Array<{ attempts: number; method: string }> = [];
    const resource = vi.fn(async (request: InternalAxiosRequestConfig) => { firstStarted.resolve(); await releaseFirst.promise; return response(request, { ok: true }); });
    const client = new ServiceTitanClient(config(), { maxConcurrentRequests: 1, maxQueuedRequests: 1, authAdapter: tokenAdapter, adapter: resource, onRequestComplete: event => events.push(event) });
    const first = client.get("/tenant/{tenant}/customers");
    await firstStarted.promise;
    try {
      const queued = withRequestContext({ signal: controller.signal }, () => callMutation(client, target)).catch(value => value);
      const overflow = await callMutation(client, target).catch(value => value);
      expect(serializedError(overflow)).toMatchObject({ phase: "queue", code: "QUEUE_FULL", retryable: true });
      expect(serializedError(overflow)).not.toHaveProperty("outcomeUnknown");
      controller.abort();
      const cancellation = serializedError(await queued);
      expect(cancellation).toMatchObject({ code: "CANCELLED", retryable: false });
      expect(cancellation).not.toHaveProperty("outcomeUnknown");
      expect(events).toEqual([expect.objectContaining({ method: target.method, attempts: 0 }), expect.objectContaining({ method: target.method, attempts: 0 })]);
      expect(resource).toHaveBeenCalledTimes(1);
    } finally { releaseFirst.resolve(); await first; }
    expect(client.getMetrics()).toMatchObject({ resourceAttempts: 1, activeRequests: 0, queuedRequests: 0 });
  });
});

describe("real Axios request boundaries", () => {
  it.each([401, 403])("an auth %s fails the business call and recovery only sends the intended resource", async (status) => {
    let authCalls = 0;
    const dispatched: string[] = [];
    const client = new ServiceTitanClient(config(), {
      authAdapter: async (request) => {
        if (++authCalls === 1) throw rejection(request, status);
        return response(request, { access_token: "AUTH_TOKEN_MUST_NOT_LEAK", expires_in: 900 });
      },
      adapter: async (request) => { dispatched.push(request.url!); return response(request, { id: 7 }); },
    });
    await expect(client.get("/tenant/{tenant}/customers/7")).rejects.toMatchObject({ status, details: { phase: "auth" } });
    expect(dispatched).toEqual([]);
    const recovered = await client.get("/tenant/{tenant}/customers/7");
    expect(recovered).toEqual({ id: 7 });
    expect(JSON.stringify(recovered)).not.toContain("AUTH_TOKEN");
    expect(dispatched).toEqual(["/crm/v2/tenant/42/customers/7"]);
  });

  it("retries an auth 429 inside auth; a write executes exactly once at its original resource", async () => {
    let authCalls = 0;
    const mutations: unknown[] = [];
    const client = new ServiceTitanClient(config(), {
      authAdapter: async (request) => {
        if (++authCalls === 1) throw rejection(request, 429, { "retry-after": "0" });
        return response(request, { access_token: "AUTH_TOKEN_MUST_NOT_LEAK", expires_in: 900 });
      },
      adapter: async (request) => { mutations.push({ url: request.url, method: request.method, body: JSON.parse(request.data) }); return response(request, { id: 9 }); },
    });
    expect(await client.post("/tenant/{tenant}/customers", { name: "Test" })).toEqual({ id: 9 });
    expect(authCalls).toBe(2);
    expect(mutations).toEqual([{ url: "/crm/v2/tenant/42/customers", method: "post", body: { name: "Test" } }]);
  });

  it("a delayed 401 reuses the newer token instead of refreshing it again", async () => {
    let authCalls = 0;
    const late401 = deferred<void>();
    const seen: string[] = [];
    const client = new ServiceTitanClient(config(), {
      authAdapter: async (request) => response(request, { access_token: `token-${++authCalls}`, expires_in: 900 }),
      adapter: async (request) => {
        const token = String(request.headers.get("Authorization"));
        seen.push(token);
        if (token === "Bearer token-1") {
          if (request.url!.endsWith("/2")) await late401.promise;
          throw rejection(request, 401);
        }
        return response(request, { ok: true });
      },
    });
    const first = client.get("/tenant/{tenant}/customers/1");
    const second = client.get("/tenant/{tenant}/customers/2");
    await first;
    late401.resolve();
    await second;
    expect(authCalls).toBe(2);
    expect(seen).toEqual(["Bearer token-1", "Bearer token-1", "Bearer token-2", "Bearer token-2"]);
  });

  it("does not retry a second resource 401", async () => {
    let authCalls = 0;
    const client = new ServiceTitanClient(config(), {
      authAdapter: async (request) => response(request, { access_token: `token-${++authCalls}`, expires_in: 900 }),
      adapter: async (request) => { throw rejection(request, 401); },
    });
    await expect(client.get("/tenant/{tenant}/customers")).rejects.toMatchObject({ status: 401, details: { phase: "resource" } });
    expect(authCalls).toBe(2);
    expect(client.getMetrics().resourceAttempts).toBe(2);
  });

  it.each([500, 503, 0])("does not replay a potentially committed write after status %s", async (status) => {
    let attempts = 0;
    const client = new ServiceTitanClient(config(), {
      authAdapter: tokenAdapter,
      adapter: async (request) => {
        attempts++;
        if (status === 0) throw new AxiosError("timeout", "ECONNABORTED", request);
        throw rejection(request, status);
      },
    });
    await expect(client.post("/tenant/{tenant}/customers", { name: "Test" })).rejects.toMatchObject({ status, message: expect.stringContaining("Verify its result before retrying"), details: { outcomeUnknown: true } });
    expect(attempts).toBe(1);
  });

  it("preserves safe diagnostics without including credentials/config in errors or events", async () => {
    const events: unknown[] = [];
    const client = new ServiceTitanClient(config(), {
      authAdapter: tokenAdapter,
      onRequestComplete: (event) => { events.push(event); throw new Error("diagnostic sink down"); },
      adapter: async (request) => { throw rejection(request, 400, {}, { title: "Invalid test-client-secret test-app-key Bearer test-token alice@example.com", traceId: "trace-123" }); },
    });
    let failure: unknown;
    try { await client.get("/tenant/{tenant}/customers"); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ServiceTitanApiError);
    expect((failure as ServiceTitanApiError).toJSON()).toMatchObject({ status: 400, phase: "resource", traceId: "trace-123" });
    const serialized = JSON.stringify({ failure, events });
    for (const secret of ["test-client-secret", "test-app-key", "test-token", "alice@example.com"]) expect(serialized).not.toContain(secret);
    expect(client.getMetrics()).toMatchObject({ requests: 1, failures: 1, activeRequests: 0, queuedRequests: 0 });
  });
});

describe("Retry-After and cancellation", () => {
  it("strictly parses Retry-After and does not truncate large delays", () => {
    expect(retryAfterMilliseconds("120")).toBe(120_000);
    expect(retryAfterMilliseconds("0")).toBe(0);
    expect(retryAfterMilliseconds("12garbage")).toBe(1000);
    expect(retryAfterMilliseconds("Fri, 04 Sep 2026 12:02:00 GMT", Date.parse("2026-09-04T12:00:00Z"))).toBe(120_000);
    expect(retryAfterMilliseconds("Fri, 04 Sep 2026 11:00:00 GMT", Date.parse("2026-09-04T12:00:00Z"))).toBe(0);
  });

  it("waits the server delay, then retries a rejected request once", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const client = new ServiceTitanClient(config(), {
      authAdapter: tokenAdapter,
      adapter: async (request) => { if (++attempts === 1) throw rejection(request, 429, { "retry-after": "2" }); return response(request, { ok: true }); },
    });
    const result = client.get("/tenant/{tenant}/customers");
    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ ok: true });
    expect(attempts).toBe(2);
  });

  it("rejects excessive Retry-After without retrying early or overflowing timers", async () => {
    let attempts = 0;
    const client = new ServiceTitanClient(config(), { authAdapter: tokenAdapter, adapter: async (request) => { attempts++; throw rejection(request, 429, { "retry-after": "999999999999" }); } });
    await expect(client.get("/tenant/{tenant}/customers")).rejects.toMatchObject({ status: 429, details: { code: "RETRY_DELAY_EXCEEDED", retryable: true } });
    await expect(client.get("/tenant/{tenant}/customers")).rejects.toMatchObject({ status: 429, details: { code: "RETRY_DELAY_EXCEEDED", phase: "resource" } });
    expect(attempts).toBe(1);
  });

  it("preserves an auth rate-limit cooldown across independent calls", async () => {
    let attempts = 0;
    const client = new ServiceTitanClient(config(), {
      authAdapter: async (request) => { attempts++; throw rejection(request, 429, { "retry-after": "120" }); },
      adapter: async () => { throw new Error("Resource must not execute"); },
    });
    for (let call = 0; call < 2; call++) {
      await expect(client.get("/tenant/{tenant}/customers")).rejects.toMatchObject({ status: 429, details: { code: "RETRY_DELAY_EXCEEDED", phase: "auth" } });
    }
    expect(attempts).toBe(1);
  });

  it("remembers the final 429 even when that call has exhausted its retry", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const client = new ServiceTitanClient(config(), {
      authAdapter: tokenAdapter,
      adapter: async (request) => {
        attempts++;
        if (attempts <= 2) throw rejection(request, 429, { "retry-after": attempts === 1 ? "0" : "2" });
        return response(request, { ok: true });
      },
    });
    await expect(client.get("/tenant/{tenant}/customers")).rejects.toMatchObject({ status: 429 });
    const next = client.get("/tenant/{tenant}/customers");
    await vi.advanceTimersByTimeAsync(1999);
    expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(await next).toEqual({ ok: true });
    expect(attempts).toBe(3);
  });

  it("cancels a 429 wait without sending a retry", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let attempts = 0;
    const client = new ServiceTitanClient(config(), { authAdapter: tokenAdapter, adapter: async (request) => { attempts++; throw rejection(request, 429, { "retry-after": "30" }); } });
    const outcome = withRequestContext({ signal: controller.signal }, () => client.get("/tenant/{tenant}/customers")).catch((error) => error);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(await outcome).toMatchObject({ details: { code: "CANCELLED" } });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(attempts).toBe(1);
    expect(client.getMetrics().activeRequests).toBe(0);
  });

  it("one cancelled auth waiter does not abort another caller's shared token", async () => {
    const controller = new AbortController();
    const releaseAuth = deferred<void>();
    const authStarted = deferred<void>();
    let sharedSignal: AbortSignal | undefined;
    let authCalls = 0;
    const client = new ServiceTitanClient(config(), {
      authAdapter: async (request) => { authCalls++; sharedSignal = request.signal as AbortSignal; authStarted.resolve(); await releaseAuth.promise; return response(request, { access_token: "token", expires_in: 900 }); },
      adapter: async (request) => response(request, { id: 1 }),
    });
    const cancelled = withRequestContext({ signal: controller.signal }, () => client.get("/tenant/{tenant}/customers")).catch((error) => error);
    const survivor = client.get("/tenant/{tenant}/customers");
    await authStarted.promise;
    controller.abort();
    expect(await cancelled).toMatchObject({ details: { code: "CANCELLED" } });
    expect(sharedSignal?.aborted).toBe(false);
    releaseAuth.resolve();
    expect(await survivor).toEqual({ id: 1 });
    expect(authCalls).toBe(1);
  });

  it("cancels the underlying auth request when its last waiter leaves", async () => {
    const controller = new AbortController();
    const started = deferred<void>();
    let authSignal: AbortSignal | undefined;
    const client = new ServiceTitanClient(config(), {
      authAdapter: async (request) => { authSignal = request.signal as AbortSignal; started.resolve(); await new Promise((_, reject) => authSignal!.addEventListener("abort", () => reject(new CanceledError()), { once: true })); return response(request, {}); },
      adapter: async (request) => response(request, { ok: true }),
    });
    const outcome = withRequestContext({ signal: controller.signal }, () => client.get("/tenant/{tenant}/customers")).catch((error) => error);
    await started.promise;
    controller.abort();
    expect(await outcome).toMatchObject({ details: { code: "CANCELLED" } });
    expect(authSignal?.aborted).toBe(true);
  });

  it("passes cancellation into an already dispatched mutation and marks its outcome unknown", async () => {
    const controller = new AbortController();
    const started = deferred<void>();
    const client = new ServiceTitanClient(config(), {
      authAdapter: tokenAdapter,
      adapter: async (request) => { started.resolve(); await new Promise((_, reject) => request.signal!.addEventListener!("abort", () => reject(new CanceledError()), { once: true })); return response(request, {}); },
    });
    const outcome = withRequestContext({ signal: controller.signal }, () => client.post("/tenant/{tenant}/customers", { name: "Test" })).catch((error) => error);
    await started.promise;
    controller.abort();
    expect(await outcome).toMatchObject({ details: { code: "CANCELLED", outcomeUnknown: true } });
    expect(client.getMetrics().resourceAttempts).toBe(1);
  });
});

describe("bounded request concurrency", () => {
  it("bounds queued work during shared rate-limit waits as well as network requests", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let attempts = 0;
    const client = new ServiceTitanClient(config(), {
      maxConcurrentRequests: 1, maxQueuedRequests: 1, authAdapter: tokenAdapter,
      adapter: async (request) => { attempts++; throw rejection(request, 429, { "retry-after": "30" }); },
    });
    const first = withRequestContext({ signal: controller.signal }, () => client.get("/tenant/{tenant}/customers")).catch((error) => error);
    await vi.advanceTimersByTimeAsync(0);
    const second = withRequestContext({ signal: controller.signal }, () => client.get("/tenant/{tenant}/customers")).catch((error) => error);
    await vi.advanceTimersByTimeAsync(0);
    await expect(client.get("/tenant/{tenant}/customers")).rejects.toMatchObject({ details: { code: "QUEUE_FULL" } });
    expect(client.getMetrics()).toMatchObject({ activeRequests: 1, queuedRequests: 1 });
    controller.abort();
    for (const result of await Promise.all([first, second])) expect(result).toMatchObject({ details: { code: "CANCELLED" } });
    expect(attempts).toBe(1);
    expect(client.getMetrics()).toMatchObject({ activeRequests: 0, queuedRequests: 0 });
  });

  it("queues and cancels requests without occupying a slot or leaking a waiter", async () => {
    const releaseFirst = deferred<void>();
    const firstStarted = deferred<void>();
    const controller = new AbortController();
    let active = 0;
    let peak = 0;
    let calls = 0;
    const client = new ServiceTitanClient(config(), {
      maxConcurrentRequests: 1, maxQueuedRequests: 1, authAdapter: tokenAdapter,
      adapter: async (request) => { calls++; active++; peak = Math.max(active, peak); if (calls === 1) { firstStarted.resolve(); await releaseFirst.promise; } active--; return response(request, { ok: true }); },
    });
    const first = client.get("/tenant/{tenant}/customers");
    await firstStarted.promise;
    const second = withRequestContext({ signal: controller.signal }, () => client.get("/tenant/{tenant}/customers")).catch((error) => error);
    await Promise.resolve();
    await expect(client.get("/tenant/{tenant}/customers")).rejects.toMatchObject({ details: { code: "QUEUE_FULL" } });
    controller.abort();
    expect(await second).toMatchObject({ details: { code: "CANCELLED" } });
    releaseFirst.resolve();
    await first;
    await client.get("/tenant/{tenant}/customers");
    expect(peak).toBe(1);
    expect(calls).toBe(2);
    expect(client.getMetrics()).toMatchObject({ activeRequests: 0, queuedRequests: 0 });
  });

  it("does not dispatch a request whose signal is already aborted", async () => {
    const adapter = vi.fn(tokenAdapter);
    const client = new ServiceTitanClient(config(), { adapter, authAdapter: adapter });
    const signal = AbortSignal.abort();
    await expect(withRequestContext({ signal }, () => client.get("/tenant/{tenant}/customers"))).rejects.toMatchObject({ details: { code: "CANCELLED" } });
    expect(adapter).not.toHaveBeenCalled();
  });
});
