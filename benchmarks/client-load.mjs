#!/usr/bin/env node
/**
 * Synthetic ServiceTitanClient load/fault benchmark. No .env, credentials or network.
 * node benchmarks/client-load.mjs --output /tmp/client-load.json
 * Optional: --requests 384 --warmup 20 --repetitions 2 --upstream-ms 20
 * Runs current source, bundled into an OS temporary directory; does not build the package.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { cpus, availableParallelism, tmpdir, totalmem } from "node:os";
import { dirname, resolve, join } from "node:path";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { build } from "esbuild";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const READ_PATH = "/tenant/{tenant}/customers";
const DEFAULT_ACTIVE = 8;
const DEFAULT_QUEUED = 128;
const CONCURRENCIES = [1, 8, 32, 128, 192];
const FIXTURE_SECRET = "benchmark-fixture-secret";
const FIXTURE_KEY = "benchmark-fixture-app-key";
const defaults = { requests: 384, warmup: 20, repetitions: 2, upstreamMs: 20, caseTimeoutMs: 60000 };

function argumentsFrom(argv) {
  const options = { ...defaults, output: undefined };
  const names = { "--requests": "requests", "--warmup": "warmup", "--repetitions": "repetitions", "--upstream-ms": "upstreamMs", "--case-timeout-ms": "caseTimeoutMs" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--help") {
      process.stdout.write("Usage: node benchmarks/client-load.mjs [--output path] [--requests 384] [--warmup 20] [--repetitions 2] [--upstream-ms 20] [--case-timeout-ms 60000]\n");
      return null;
    }
    const key = argv[i] === "--output" ? "output" : names[argv[i]];
    assert(key, `Unknown argument: ${argv[i]}`);
    const value = argv[++i];
    assert(value !== undefined, `Missing value for ${key}`);
    options[key] = key === "output" ? resolve(value) : Number(value);
  }
  for (const [key, maximum] of Object.entries({ requests: 10000, warmup: 1000, repetitions: 5, upstreamMs: 1000, caseTimeoutMs: 120000 })) {
    assert(Number.isSafeInteger(options[key]) && options[key] > 0 && options[key] <= maximum, `${key} must be an integer from 1 to ${maximum}`);
  }
  assert(options.requests >= 192, "requests must be at least 192 to exercise the largest concurrency");
  return options;
}

const rounded = value => Number(value.toFixed(3));
function distribution(values) {
  if (!values.length) return { count: 0, min: null, p50: null, p95: null, p99: null, max: null, mean: null };
  const ordered = [...values].sort((a, b) => a - b);
  const percentile = q => rounded(ordered[Math.max(0, Math.ceil(q * ordered.length) - 1)]);
  return { count: values.length, min: rounded(ordered[0]), p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: rounded(ordered.at(-1)), mean: rounded(values.reduce((a, b) => a + b, 0) / values.length) };
}

function deferred() {
  let resolvePromise;
  const promise = new Promise(resolve => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

function metricDifference(after, before) {
  return Object.fromEntries(Object.keys(after).map(key => [key, after[key] - (before[key] ?? 0)]));
}

async function timedCase(name, timeoutMs, operation) {
  process.stderr.write(`[client-load] ${name}\n`);
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error(`Scenario deadline exceeded: ${name}`)); }, timeoutMs);
  });
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const beforeCpu = process.cpuUsage();
  const beforeMemory = process.memoryUsage();
  const beforeElu = performance.eventLoopUtilization();
  let peakRss = beforeMemory.rss;
  let peakHeap = beforeMemory.heapUsed;
  let memorySamples = 0;
  const sampler = setInterval(() => {
    const memory = process.memoryUsage();
    peakRss = Math.max(peakRss, memory.rss);
    peakHeap = Math.max(peakHeap, memory.heapUsed);
    memorySamples++;
  }, 10);
  const start = performance.now();
  try {
    const result = await Promise.race([operation(controller.signal), timeout]);
    const elapsedMs = performance.now() - start;
    const cpu = process.cpuUsage(beforeCpu);
    const memory = process.memoryUsage();
    const elu = performance.eventLoopUtilization(beforeElu);
    const sampled = delay.count > 0;
    return {
      name, passed: true, elapsedMs: rounded(elapsedMs), ...result,
      resourceUsage: {
        cpuUserMs: rounded(cpu.user / 1000), cpuSystemMs: rounded(cpu.system / 1000), cpuPercentOneCore: rounded((cpu.user + cpu.system) / (elapsedMs * 10)),
        rssStartBytes: beforeMemory.rss, rssEndBytes: memory.rss, rssPeakSampledBytes: Math.max(peakRss, memory.rss),
        heapUsedStartBytes: beforeMemory.heapUsed, heapUsedEndBytes: memory.heapUsed, heapUsedPeakSampledBytes: Math.max(peakHeap, memory.heapUsed), memorySamples,
        eventLoopUtilization: rounded(elu.utilization),
        eventLoopDelayMs: { resolution: 10, samples: Number(delay.count), p50: sampled ? rounded(delay.percentile(50) / 1e6) : null, p95: sampled ? rounded(delay.percentile(95) / 1e6) : null, p99: sampled ? rounded(delay.percentile(99) / 1e6) : null, max: sampled ? rounded(delay.max / 1e6) : null },
      },
    };
  } finally {
    clearTimeout(timer);
    clearInterval(sampler);
    delay.disable();
    controller.abort();
  }
}

async function main(options) {
  const temporary = await mkdtemp(join(tmpdir(), "st-client-load-"));
  try {
    const bundleFile = join(temporary, "client.cjs");
    await build({ stdin: { contents: 'export { ServiceTitanClient } from "./src/client.ts"; export { loadConfig } from "./src/config.ts"; export { withRequestContext, awaitWithSignal } from "./src/request-context.ts"; export { AxiosError, CanceledError } from "axios";', resolveDir: ROOT }, bundle: true, platform: "node", target: "node22", format: "cjs", outfile: bundleFile, logLevel: "silent" });
    const bundled = await import(pathToFileURL(bundleFile).href);
    const { ServiceTitanClient, loadConfig, withRequestContext, awaitWithSignal, AxiosError, CanceledError } = bundled.default ?? bundled;
    const config = loadConfig({ ST_CLIENT_ID: "benchmark-fixture-client", ST_CLIENT_SECRET: FIXTURE_SECRET, ST_APP_KEY: FIXTURE_KEY, ST_TENANT_ID: "42", ST_ENVIRONMENT: "integration", ST_LOG_LEVEL: "error" });
    const metadata = {
      benchmark: "ServiceTitanClient controlled-adapter load and faults", version: 1, startedAt: new Date().toISOString(),
      runtime: process.version, platform: process.platform, architecture: process.arch, cpuModel: cpus()[0]?.model, availableParallelism: availableParallelism(), totalMemoryBytes: totalmem(),
      packageVersion: JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")).version,
      bundleSha256: createHash("sha256").update(await readFile(bundleFile)).digest("hex"),
      clientSourceSha256: createHash("sha256").update(await readFile(join(ROOT, "src/client.ts"))).digest("hex"),
      settings: { ...options, output: undefined, offeredConcurrencies: CONCURRENCIES, clientDefaultActiveLimit: DEFAULT_ACTIVE, clientDefaultQueueLimit: DEFAULT_QUEUED },
      methodology: {
        transport: "Real Axios pipeline with controlled adapters only; no network, DNS, TLS, or ServiceTitan credential access",
        load: "Closed-loop worker pool, fixed total requests; fast queue rejections immediately free an offered worker. Successful and rejected latency distributions are separate.",
        warmup: "Fresh client for each load repetition; warmup acquires one token and is excluded from measured resource metrics. Fault cases document their own setup.",
        percentiles: "Nearest-rank percentiles of per-request wall-clock milliseconds, including client queue wait",
        resources: "Process CPU deltas, 10ms sampled RSS/heap, perf_hooks event-loop histogram and utilization; includes harness overhead and the explicit recovery request. Load latency/throughput exclude warmup and recovery.",
        gates: "Exact correctness, concurrency, shedding, cancellation and replay invariants; no hard throughput or latency performance thresholds",
      },
    };
    const response = (request, data, status = 200, headers = {}) => ({ config: request, data, status, statusText: String(status), headers });
    const failure = (request, status, headers = {}) => new AxiosError(`Synthetic HTTP ${status}`, "ERR_BAD_RESPONSE", request, undefined, response(request, {}, status, headers));
    const token = generation => `benchmark-fixture-token-${generation}`;
    const sleep = async (ms, signal) => {
      try { await pause(ms, undefined, { signal }); }
      catch (error) { if (error?.name === "AbortError") throw new CanceledError("Synthetic request cancelled"); throw error; }
    };

    function fixture({ auth, resource } = {}) {
      const state = { authCalls: 0, resourceCalls: 0, activeUpstream: 0, maxUpstreamConcurrency: 0, maxQueuedRequests: 0, maxClientActiveRequests: 0 };
      const client = new ServiceTitanClient(config, {
        authAdapter: async request => {
          const attempt = ++state.authCalls;
          if (auth) return auth(request, attempt, state);
          await sleep(options.upstreamMs, request.signal);
          return response(request, { access_token: token(attempt), expires_in: 900 });
        },
        adapter: async request => {
          state.resourceCalls++;
          state.activeUpstream++;
          state.maxUpstreamConcurrency = Math.max(state.maxUpstreamConcurrency, state.activeUpstream);
          assert.equal(request.headers.get("ST-App-Key"), FIXTURE_KEY, "Synthetic app key was not attached");
          assert.match(String(request.headers.get("Authorization")), /^Bearer benchmark-fixture-token-\d+$/, "Synthetic resource authorization is invalid");
          assert.equal(request.url, "/crm/v2/tenant/42/customers", "Wrong resource route");
          try {
            if (resource) return await resource(request, state);
            await sleep(options.upstreamMs, request.signal);
            return response(request, { fixtureRequestId: request.params?.page });
          } finally { state.activeUpstream--; }
        },
      });
      return { client, state };
    }

    async function observedRequest(fixture, id, signal, { method = "get", body } = {}) {
      const started = performance.now();
      // A separate dependent signal per request avoids making the benchmark's
      // shared deadline itself a high-listener-count source of warning overhead.
      const requestSignal = AbortSignal.any([signal]);
      const promise = withRequestContext({ signal: requestSignal }, () => method === "post" ? fixture.client.post(READ_PATH, body) : fixture.client.get(READ_PATH, { page: id, pageSize: 1 }));
      const metrics = fixture.client.getMetrics();
      fixture.state.maxQueuedRequests = Math.max(fixture.state.maxQueuedRequests, metrics.queuedRequests);
      fixture.state.maxClientActiveRequests = Math.max(fixture.state.maxClientActiveRequests, metrics.activeRequests);
      try {
        const value = await promise;
        if (method === "get") assert.equal(value?.fixtureRequestId, id, "Business response did not match the requested fixture ID");
        return { ok: true, latencyMs: performance.now() - started };
      } catch (error) {
        if (error?.name === "AssertionError") throw error;
        return { ok: false, latencyMs: performance.now() - started, status: error?.status ?? null, code: error?.details?.code ?? error?.name ?? "UNKNOWN", phase: error?.details?.phase, retryable: error?.details?.retryable, outcomeUnknown: error?.details?.outcomeUnknown === true };
      }
    }

    function summarize(outcomes, elapsedMs) {
      const succeeded = outcomes.filter(result => result.ok);
      const failed = outcomes.filter(result => !result.ok);
      const failuresByCode = Object.fromEntries([...new Set(failed.map(result => result.code))].sort().map(code => [code, failed.filter(result => result.code === code).length]));
      return {
        offeredRequests: outcomes.length, successfulRequests: succeeded.length, failedRequests: failed.length, failuresByCode,
        successfulRequestsPerSecond: rounded(succeeded.length * 1000 / elapsedMs), completedAttemptsPerSecond: rounded(outcomes.length * 1000 / elapsedMs),
        successfulLatencyMs: distribution(succeeded.map(result => result.latencyMs)), rejectedLatencyMs: distribution(failed.map(result => result.latencyMs)), allAttemptLatencyMs: distribution(outcomes.map(result => result.latencyMs)),
        successfulRawMs: succeeded.map(result => rounded(result.latencyMs)), rejectedRawMs: failed.map(result => rounded(result.latencyMs)),
      };
    }

    async function pool(fixture, count, concurrency, signal) {
      let next = 1;
      const outcomes = new Array(count);
      await Promise.all(Array.from({ length: Math.min(count, concurrency) }, async () => {
        for (;;) {
          const id = next++;
          if (id > count) return;
          outcomes[id - 1] = await observedRequest(fixture, id, signal);
        }
      }));
      return outcomes;
    }

    function assertDrained(fixture) {
      assert.equal(fixture.state.activeUpstream, 0, "Synthetic upstream calls leaked");
      assert.equal(fixture.client.getMetrics().activeRequests, 0, "Client active slots leaked");
      assert.equal(fixture.client.getMetrics().queuedRequests, 0, "Client queue waiters leaked");
      assert(fixture.state.maxUpstreamConcurrency <= DEFAULT_ACTIVE, "Default upstream concurrency exceeded eight");
      assert(fixture.state.maxQueuedRequests <= DEFAULT_QUEUED, "Default client queue exceeded128");
    }

    const load = [];
    for (const offeredConcurrency of CONCURRENCIES) {
      for (let repetition = 1; repetition <= options.repetitions; repetition++) {
        const f = fixture();
        const warmController = new AbortController();
        const warmTimer = setTimeout(() => warmController.abort(), options.caseTimeoutMs);
        try { assert((await pool(f, options.warmup, Math.min(offeredConcurrency, DEFAULT_ACTIVE), warmController.signal)).every(result => result.ok), "Warmup failed"); }
        finally { clearTimeout(warmTimer); }
        const before = f.client.getMetrics();
        const beforeResources = f.state.resourceCalls;
        const measured = await timedCase(`load-c${offeredConcurrency}-r${repetition}`, options.caseTimeoutMs, async signal => {
          f.state.maxUpstreamConcurrency = 0; f.state.maxQueuedRequests = 0; f.state.maxClientActiveRequests = 0;
          const started = performance.now();
          const outcomes = await pool(f, options.requests, offeredConcurrency, signal);
          const elapsedMs = performance.now() - started;
          const summary = summarize(outcomes, elapsedMs);
          assert.equal(summary.offeredRequests, options.requests);
          if (offeredConcurrency <= DEFAULT_ACTIVE + DEFAULT_QUEUED) {
            assert.equal(summary.successfulRequests, options.requests, "Requests within bounded offered concurrency should complete");
            assert.equal(summary.failedRequests, 0);
          } else {
            // Rejected closed-loop workers exhaust the remaining fixed workload
            // in microtasks while admitted requests await their20ms timers.
            assert.equal(summary.successfulRequests, DEFAULT_ACTIVE + DEFAULT_QUEUED, "Unexpected admission count for one saturated fixed workload");
            assert.deepEqual(summary.failuresByCode, { QUEUE_FULL: options.requests - DEFAULT_ACTIVE - DEFAULT_QUEUED });
          }
          assert.equal(f.state.resourceCalls - beforeResources, summary.successfulRequests, "Failed admission reached the upstream adapter");
          assert.equal(f.state.authCalls, 1, "Warm token caused duplicate OAuth requests");
          assertDrained(f);
          const measuredMetrics = metricDifference(f.client.getMetrics(), before);
          const recovery = await observedRequest(f, options.requests + 1, signal);
          assert(recovery.ok, "Client did not recover after load/overload drained");
          assertDrained(f);
          return { offeredConcurrency, repetition, warmupRequests: options.warmup, measurementElapsedMs: rounded(elapsedMs), ...summary, clientMetrics: measuredMetrics, maxUpstreamConcurrency: f.state.maxUpstreamConcurrency, maxQueuedRequests: f.state.maxQueuedRequests, authCallsIncludingWarmup: f.state.authCalls, duplicateAuthCalls: f.state.authCalls - 1, recovery: { successfulRequests: 1, latencyMs: rounded(recovery.latencyMs) } };
        });
        load.push(measured);
      }
    }

    const faults = [];
    faults.push(await timedCase("cold-auth-single-flight-128", options.caseTimeoutMs, async signal => {
      const f = fixture(); const started = performance.now();
      const outcomes = await pool(f, 128, 128, signal);
      assert(outcomes.every(result => result.ok)); assert.equal(f.state.authCalls, 1); assert.equal(f.state.resourceCalls, 128); assertDrained(f);
      return { ...summarize(outcomes, performance.now() - started), authCalls: 1, duplicateAuthCalls: 0, maxUpstreamConcurrency: f.state.maxUpstreamConcurrency, clientMetrics: f.client.getMetrics() };
    }));

    faults.push(await timedCase("staggered-401-generation-recovery", options.caseTimeoutMs, async signal => {
      const releaseStale = deferred(); let oldAttempts = 0;
      const f = fixture({ resource: async request => {
        if (request.headers.get("Authorization") === `Bearer ${token(1)}`) {
          const oldIndex = oldAttempts++;
          if (oldIndex === 0) await sleep(options.upstreamMs, request.signal);
          else await awaitWithSignal(releaseStale.promise, request.signal);
          throw failure(request, 401);
        }
        await sleep(options.upstreamMs, request.signal);
        releaseStale.resolve();
        return response(request, { fixtureRequestId: request.params.page });
      } });
      try {
        const started = performance.now(); const outcomes = await pool(f, 32, 32, signal);
        assert(outcomes.every(result => result.ok)); assert.equal(oldAttempts, 8); assert.equal(f.state.authCalls, 2); assert.equal(f.state.resourceCalls, 40); assert.equal(f.client.getMetrics().retries401, 8); assertDrained(f);
        return { ...summarize(outcomes, performance.now() - started), rejectedOldTokenAttempts: oldAttempts, authCalls: 2, duplicateAuthCalls: 0, expectedTokenGenerations: 2, clientMetrics: f.client.getMetrics() };
      } finally { releaseStale.resolve(); }
    }));

    faults.push(await timedCase("queue-overload-cancel-and-recover", options.caseTimeoutMs, async signal => {
      const release = deferred(); const eightStarted = deferred();
      const f = fixture({ resource: async (request, state) => {
        if (state.activeUpstream === 8) eightStarted.resolve();
        await awaitWithSignal(release.promise, request.signal);
        await sleep(options.upstreamMs, request.signal);
        return response(request, { fixtureRequestId: request.params.page });
      } });
      await withRequestContext({ signal }, () => f.client.ensureToken());
      const controllers = Array.from({ length: 192 }, () => new AbortController());
      try {
        const started = performance.now();
        const pending = controllers.map((controller, index) => observedRequest(f, index + 1, AbortSignal.any([signal, controller.signal])));
        await awaitWithSignal(eightStarted.promise, signal);
        assert.equal(f.client.getMetrics().activeRequests, 8); assert.equal(f.client.getMetrics().queuedRequests, 128);
        for (const index of [...Array.from({ length: 4 }, (_, i) => i), ...Array.from({ length: 32 }, (_, i) => i + 8)]) controllers[index].abort();
        release.resolve();
        const outcomes = await Promise.all(pending); const summary = summarize(outcomes, performance.now() - started);
        assert.equal(summary.successfulRequests, 100); assert.deepEqual(summary.failuresByCode, { CANCELLED: 36, QUEUE_FULL: 56 }); assert.equal(f.state.resourceCalls, 104); assertDrained(f);
        const recovery = await observedRequest(f, 193, signal); assert(recovery.ok); assert.equal(f.state.authCalls, 1); assertDrained(f);
        return { ...summary, activeCancellations: 4, queuedCancellations: 32, maxUpstreamConcurrency: f.state.maxUpstreamConcurrency, maxQueuedRequests: f.state.maxQueuedRequests, recovery: { successfulRequests: 1, latencyMs: rounded(recovery.latencyMs) }, clientMetricsIncludingRecovery: f.client.getMetrics() };
      } finally { release.resolve(); controllers.forEach(controller => controller.abort()); }
    }));

    faults.push(await timedCase("resource-429-shared-retry-after", options.caseTimeoutMs, async signal => {
      let rejectedAt; let retryAt; let firstId;
      const f = fixture({ resource: async request => {
        if (rejectedAt === undefined) {
          firstId = request.params.page;
          rejectedAt = Date.now();
          throw failure(request, 429, { "retry-after": "1" });
        }
        if (request.params.page === firstId) retryAt = Date.now();
        await sleep(options.upstreamMs, request.signal);
        return response(request, { fixtureRequestId: request.params.page });
      } });
      const started = performance.now(); const outcomes = await pool(f, 16, 16, signal);
      assert(outcomes.every(result => result.ok)); assert.equal(f.state.resourceCalls, 17); assert.equal(f.client.getMetrics().retries429, 1); assert(retryAt - rejectedAt >= 1000, "Retry occurred before the server's mandatory Retry-After"); assertDrained(f);
      return { ...summarize(outcomes, performance.now() - started), requiredRetryAfterMs: 1000, observedRetryAfterMs: retryAt - rejectedAt, clientMetrics: f.client.getMetrics() };
    }));

    faults.push(await timedCase("excessive-retry-after-no-early-replay", options.caseTimeoutMs, async signal => {
      const f = fixture({ resource: async request => { throw failure(request, 429, { "retry-after": "120" }); } });
      const outcomes = [await observedRequest(f, 1, signal), await observedRequest(f, 2, signal)];
      assert(outcomes.every(result => result.code === "RETRY_DELAY_EXCEEDED" && result.status === 429)); assert.equal(f.state.resourceCalls, 1); assert.equal(f.state.authCalls, 1); assertDrained(f);
      return { requests: 2, rejectedRequests: 2, requiredRetryAfterMs: 120000, upstreamAttempts: 1, clientMetrics: f.client.getMetrics() };
    }));

    faults.push(await timedCase("oauth-401-isolated-from-business-recovery", options.caseTimeoutMs, async signal => {
      const f = fixture({ auth: async (request, attempt) => {
        await sleep(options.upstreamMs, request.signal);
        if (attempt === 1) throw failure(request, 401);
        return response(request, { access_token: token(attempt), expires_in: 900 });
      } });
      const rejected = await pool(f, 8, 8, signal);
      assert(rejected.every(result => !result.ok && result.status === 401 && result.phase === "auth")); assert.equal(f.state.resourceCalls, 0);
      const recovered = await pool(f, 32, 32, signal);
      assert(recovered.every(result => result.ok)); assert.equal(f.state.authCalls, 2); assert.equal(f.state.resourceCalls, 32); assertDrained(f);
      return { rejectedAuthRequests: 8, successfulRecoveryRequests: 32, authCalls: 2, resourceAttempts: 32, rejectedLatencyMs: distribution(rejected.map(result => result.latencyMs)), recoveryLatencyMs: distribution(recovered.map(result => result.latencyMs)), clientMetrics: f.client.getMetrics() };
    }));

    faults.push(await timedCase("oauth-429-write-executes-once", options.caseTimeoutMs, async signal => {
      const f = fixture({
        auth: async (request, attempt) => { if (attempt === 1) throw failure(request, 429, { "retry-after": "0" }); return response(request, { access_token: token(attempt), expires_in: 900 }); },
        resource: async request => { assert.equal(request.method, "post"); assert.deepEqual(JSON.parse(request.data), { name: "Synthetic fixture" }); await sleep(options.upstreamMs, request.signal); return response(request, { id: 7 }); },
      });
      const result = await observedRequest(f, 1, signal, { method: "post", body: { name: "Synthetic fixture" } });
      assert(result.ok); assert.equal(f.state.authCalls, 2); assert.equal(f.state.resourceCalls, 1); assertDrained(f);
      return { successfulMutations: 1, resourceAttempts: 1, authCalls: 2, latencyMs: rounded(result.latencyMs), clientMetrics: f.client.getMetrics() };
    }));

    for (const status of [0, 503]) {
      faults.push(await timedCase(`ambiguous-write-${status}-no-replay`, options.caseTimeoutMs, async signal => {
        const f = fixture({ resource: async request => {
          await sleep(options.upstreamMs, request.signal);
          if (request.method === "post") { if (status === 0) throw new AxiosError("Synthetic timeout", "ECONNABORTED", request); throw failure(request, status); }
          return response(request, { fixtureRequestId: request.params.page });
        } });
        const result = await observedRequest(f, 1, signal, { method: "post", body: { name: "Synthetic fixture" } });
        assert(!result.ok && result.status === status && result.outcomeUnknown); assert.equal(result.retryable, false, "Ambiguous mutation was marked retryable"); assert.equal(f.state.resourceCalls, 1, "Ambiguous mutation was replayed");
        const recovery = await observedRequest(f, 2, signal); assert(recovery.ok); assert.equal(f.state.resourceCalls, 2); assertDrained(f);
        return { mutationStatus: status, mutationAttempts: 1, outcomeUnknown: true, retryable: result.retryable, latencyMs: rounded(result.latencyMs), recovery: { successfulRequests: 1, latencyMs: rounded(recovery.latencyMs) }, clientMetrics: f.client.getMetrics() };
      }));
    }

    return { ...metadata, finishedAt: new Date().toISOString(), passed: true, load, faults, summary: { loadScenarios: load.length, faultScenarios: faults.length, measuredLoadOfferedRequests: load.reduce((n, row) => n + row.offeredRequests, 0), measuredLoadSuccessfulRequests: load.reduce((n, row) => n + row.successfulRequests, 0), measuredLoadQueueRejections: load.reduce((n, row) => n + (row.failuresByCode.QUEUE_FULL ?? 0), 0), correctness: "All declared invariants passed" } };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

let options;
try {
  options = argumentsFrom(process.argv.slice(2));
  if (options) {
    const result = await main(options);
    const json = `${JSON.stringify(result, null, 2)}\n`;
    if (options.output) {
      await mkdir(dirname(options.output), { recursive: true });
      await writeFile(options.output, json);
      process.stdout.write(`${JSON.stringify({ passed: true, output: options.output, ...result.summary })}\n`);
    } else process.stdout.write(json);
  }
} catch (error) {
  const safeMessage = String(error?.message ?? "Benchmark failed").replace(/benchmark-fixture-(?:secret|app-key|token-\d+)/g, "[REDACTED]");
  const failure = { benchmark: "ServiceTitanClient controlled-adapter load and faults", runtime: process.version, passed: false, error: { name: error?.name ?? "Error", message: safeMessage } };
  const json = `${JSON.stringify(failure, null, 2)}\n`;
  if (options?.output) { await mkdir(dirname(options.output), { recursive: true }); await writeFile(options.output, json); }
  process.stdout.write(json);
  process.exitCode = 1;
}
