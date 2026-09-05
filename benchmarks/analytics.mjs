#!/usr/bin/env node
import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const args = Object.fromEntries(process.argv.slice(2).map((arg, index, all) => {
  if (!arg.startsWith("--")) return [arg, true];
  const [key, inline] = arg.slice(2).split("=", 2);
  return [key, inline ?? (all[index + 1]?.startsWith("--") ? true : all[index + 1])];
}));
const samples = Number(args.samples ?? 40);
const modeledDelayMs = Number(args["modeled-delay-ms"] ?? 20);
const outputPath = args.output ? resolve(String(args.output)) : null;
if (!Number.isSafeInteger(samples) || samples < 10 || samples > 10_000 || !Number.isFinite(modeledDelayMs) || modeledDelayMs < 0 || modeledDelayMs > 1_000) {
  throw new Error("Use 10 <= --samples <= 10000 and 0 <= --modeled-delay-ms <= 1000");
}

const tempDir = resolve(tmpdir(), `st-analytics-benchmark-${process.pid}`);
await mkdir(tempDir, { recursive: true });
const entry = resolve(tempDir, "entry.ts");
const bundle = resolve(tempDir, "bundle.mjs");
const repo = resolve(import.meta.dirname, "..");
await writeFile(entry, [
  `export { executeReport } from ${JSON.stringify(resolve(repo, "src/domains/intelligence/report-executor.ts"))};`,
  `export { withIntelCache, clearIntelCache } from ${JSON.stringify(resolve(repo, "src/domains/intelligence/helpers.ts"))};`,
  `export { ReferenceDataCache } from ${JSON.stringify(resolve(repo, "src/cache.ts"))};`,
  `export { withRequestContext } from ${JSON.stringify(resolve(repo, "src/request-context.ts"))};`,
].join("\n"));

try {
  await build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: "node", format: "esm", target: "node22", sourcemap: false, logLevel: "silent" });
  const { executeReport, withIntelCache, clearIntelCache, ReferenceDataCache, withRequestContext } = await import(`${pathToFileURL(bundle).href}?v=${Date.now()}`);

  const fields = ["EmployeeName", "Date", "RegularHours", "OvertimeHours", "DoubleOvertimeHours"].map(name => ({ name, dataType: name.includes("Hours") ? "Number" : "String" }));
  const parameters = date => [{ name: "From", value: date }, { name: "To", value: date }];
  const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
  const percentile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
  };
  const distribution = values => ({ samples: values.length, rawMs: values, p50Ms: percentile(values, 50), p95Ms: percentile(values, 95), p99Ms: percentile(values, 99), minMs: Math.min(...values), maxMs: Math.max(...values) });
  const timed = async fn => { const start = performance.now(); const value = await fn(); return { value, ms: performance.now() - start }; };
  const fakeReportClient = ({ pages = 3, delayMs = 0, rowPrefix = "Employee" } = {}) => {
    let calls = 0;
    return {
      client: { post: async (_path, _body, query) => {
        calls += 1;
        if (delayMs) await delay(delayMs);
        const page = Number(query.page);
        return { fields, data: [[`${rowPrefix} ${page}`, "2026-01-05", page, 0, 0]], page, pageSize: query.pageSize, hasMore: page < pages, totalCount: pages };
      } },
      calls: () => calls,
    };
  };

  const cold = fakeReportClient();
  const coldTimes = [];
  for (let index = 0; index < samples; index += 1) {
    const day = String((index % 28) + 1).padStart(2, "0");
    const run = await timed(() => executeReport(cold.client, "166", parameters(`2026-02-${day}`), undefined, { cooldownMs: 0, pageSize: 1 }));
    if (run.value.data.length !== 3 || run.value.complete !== true) throw new Error("Cold report completeness invariant failed");
    coldTimes.push(run.ms);
  }
  if (cold.calls() !== samples * 3) throw new Error("Cold report upstream-call invariant failed");

  const warm = fakeReportClient();
  const warmParams = parameters("2026-03-01");
  const seeded = await executeReport(warm.client, "166", warmParams, undefined, { cooldownMs: 60_000, pageSize: 1, now: () => 10_000, sleep: async () => {} });
  const callsAfterSeed = warm.calls();
  const warmTimes = [];
  for (let index = 0; index < samples; index += 1) {
    const run = await timed(() => executeReport(warm.client, "166", warmParams, undefined, { cooldownMs: 60_000, pageSize: 1, now: () => 10_001, sleep: async () => {} }));
    if (run.value.complete !== true || run.value.data.length !== 3) throw new Error("Warm report correctness invariant failed");
    warmTimes.push(run.ms);
  }
  if (seeded.data.length !== 3 || warm.calls() !== callsAfterSeed) throw new Error("Warm report cache invariant failed");

  const fan = fakeReportClient();
  const fanResults = await Promise.all(Array.from({ length: 20 }, () => executeReport(fan.client, "166", parameters("2026-04-01"), undefined, { cooldownMs: 60_000, pageSize: 1, now: () => 20_000, sleep: async () => {} })));
  if (fan.calls() !== 3 || fanResults.some(result => result.data.length !== 3)) throw new Error("Duplicate fan-in invariant failed");

  let lookupCalls = 0;
  const lookupClient = { get: async () => { lookupCalls += 1; return { data: [{ id: 7, name: "Technician Seven" }], hasMore: false }; } };
  const lookupColdTimes = [];
  for (let index = 0; index < samples; index += 1) {
    const run = await timed(() => new ReferenceDataCache(60_000, { warn() {} }).getTechnicians(lookupClient));
    if (run.value.length !== 1) throw new Error("Cold lookup correctness invariant failed");
    lookupColdTimes.push(run.ms);
  }
  const lookupCache = new ReferenceDataCache(60_000, { warn() {} });
  await lookupCache.getTechnicians(lookupClient);
  const lookupWarmTimes = [];
  for (let index = 0; index < samples; index += 1) lookupWarmTimes.push((await timed(() => lookupCache.getTechnicians(lookupClient))).ms);
  if (lookupCalls !== samples + 1) throw new Error("Lookup cache invariant failed");

  let responseColdLoads = 0;
  const responseColdTimes = [];
  for (let index = 0; index < samples; index += 1) {
    clearIntelCache();
    const run = await timed(() => withRequestContext({ timezone: "UTC", maxResponseChars: 100_000 }, () => withIntelCache("benchmark_response", { range: "fixed" }, async () => ({ rows: Array.from({ length: 50 }, (_, id) => ({ id })), load: ++responseColdLoads }), 60_000)));
    if (run.value.rows.length !== 50) throw new Error("Cold response-cache correctness invariant failed");
    responseColdTimes.push(run.ms);
  }
  clearIntelCache();
  let responseWarmLoads = 0;
  const responseLoad = async () => ({ rows: Array.from({ length: 50 }, (_, id) => ({ id })), load: ++responseWarmLoads });
  await withRequestContext({ timezone: "UTC", maxResponseChars: 100_000 }, () => withIntelCache("benchmark_response", { range: "fixed" }, responseLoad, 60_000));
  const responseWarmTimes = [];
  for (let index = 0; index < samples; index += 1) responseWarmTimes.push((await timed(() => withRequestContext({ timezone: "UTC", maxResponseChars: 100_000 }, () => withIntelCache("benchmark_response", { range: "fixed" }, responseLoad, 60_000)))).ms);
  if (responseColdLoads !== samples || responseWarmLoads !== 1) throw new Error("Response cache invariant failed");

  clearIntelCache();
  let ttlLoads = 0;
  const ttlLoad = async () => ({ load: ++ttlLoads });
  await withIntelCache("benchmark_ttl", {}, ttlLoad, 5);
  await delay(8);
  await withIntelCache("benchmark_ttl", {}, ttlLoad, 5);
  if (ttlLoads !== 2) throw new Error("Cache TTL invalidation invariant failed");

  const clientA = fakeReportClient({ pages: 1, rowPrefix: "Tenant A" });
  const clientB = fakeReportClient({ pages: 1, rowPrefix: "Tenant B" });
  const isolatedParams = parameters("2026-05-01");
  const resultA = await executeReport(clientA.client, "166", isolatedParams, undefined, { cooldownMs: 60_000, now: () => 30_000, sleep: async () => {} });
  const resultB = await executeReport(clientB.client, "166", isolatedParams, undefined, { cooldownMs: 60_000, now: () => 30_000, sleep: async () => {} });
  if (clientA.calls() !== 1 || clientB.calls() !== 1 || resultA.data[0]?.[0] !== "Tenant A 1" || resultB.data[0]?.[0] !== "Tenant B 1") throw new Error("Per-client report isolation invariant failed");

  const modeledSamples = 10;
  const modeledOnePageTimes = [], modeledColdTimes = [];
  let modeledOnePageCalls = 0, modeledColdCalls = 0;
  for (let index = 0; index < modeledSamples; index += 1) {
    const onePage = fakeReportClient({ pages: 1, delayMs: modeledDelayMs });
    const complete = fakeReportClient({ pages: 3, delayMs: modeledDelayMs });
    const oneRun = await timed(() => executeReport(onePage.client, "166", parameters("2026-06-01"), undefined, { cooldownMs: 0, pageSize: 1 }));
    const coldRun = await timed(() => executeReport(complete.client, "166", parameters("2026-06-02"), undefined, { cooldownMs: 0, pageSize: 1 }));
    if (oneRun.value.data.length !== 1 || coldRun.value.data.length !== 3) throw new Error("Modeled pagination correctness invariant failed");
    modeledOnePageTimes.push(oneRun.ms);modeledColdTimes.push(coldRun.ms);
    modeledOnePageCalls += onePage.calls();modeledColdCalls += complete.calls();
  }
  const modeledWarm = fakeReportClient({ pages: 3, delayMs: modeledDelayMs });
  const modeledWarmParams = parameters("2026-06-03");
  await executeReport(modeledWarm.client, "166", modeledWarmParams, undefined, { cooldownMs: 60_000, pageSize: 1, now: () => 40_000, sleep: async () => {} });
  const modeledWarmCallsAfterSeed = modeledWarm.calls();
  const modeledWarmTimes = [];
  for (let index = 0; index < modeledSamples; index += 1) {
    const run = await timed(() => executeReport(modeledWarm.client, "166", modeledWarmParams, undefined, { cooldownMs: 60_000, pageSize: 1, now: () => 40_001, sleep: async () => {} }));
    if (run.value.complete !== true || run.value.data.length !== 3) throw new Error("Modeled warm-report correctness invariant failed");
    modeledWarmTimes.push(run.ms);
  }
  if (modeledOnePageCalls !== modeledSamples || modeledColdCalls !== modeledSamples * 3 || modeledWarm.calls() !== modeledWarmCallsAfterSeed) throw new Error("Modeled upstream-call invariant failed");

  const result = {
    schemaVersion: 1,
    runtime: process.version,
    generatedAt: new Date().toISOString(),
    methodology: {
      upstream: "Deterministic in-process read-only fake; no credentials or network",
      samples,
      reportFixture: "Report 166 field schema; one row per page; three pages for complete-report cases",
      productionCooldownMeasured: false,
      note: "Local distributions measure executor/cache overhead. modeledUpstreamLatency uses an explicit per-page timer and is synthetic, not production ServiceTitan latency.",
    },
    report: { coldCompleteThreePage: { latency: distribution(coldTimes), upstreamCalls: cold.calls(), expectedCalls: samples * 3, rowsPerResult: 3 }, warmCompleteThreePage: { latency: distribution(warmTimes), upstreamCallsAfterSeed: warm.calls() - callsAfterSeed, rowsPerResult: 3 }, duplicateFanIn: { callers: 20, upstreamCalls: fan.calls(), returnedRows: fanResults.reduce((sum, value) => sum + value.data.length, 0) }, perClientIsolation: { clientACalls: clientA.calls(), clientBCalls: clientB.calls(), clientAFirstValue: resultA.data[0]?.[0], clientBFirstValue: resultB.data[0]?.[0] } },
    lookup: { coldLatency: distribution(lookupColdTimes), warmLatency: distribution(lookupWarmTimes), upstreamCalls: lookupCalls, expectedUpstreamCalls: samples + 1, returnedRows: 1 },
    responseCache: { coldLatency: distribution(responseColdTimes), warmLatency: distribution(responseWarmTimes), coldLoaderCalls: responseColdLoads, warmLoaderCalls: responseWarmLoads, returnedRows: 50, ttlInvalidationLoads: ttlLoads },
    modeledUpstreamLatency: { samples: modeledSamples, delayPerPageMs: modeledDelayMs, onePageCold: { latency: distribution(modeledOnePageTimes), calls: modeledOnePageCalls, rowsPerResult: 1 }, completeThreePageCold: { latency: distribution(modeledColdTimes), calls: modeledColdCalls, rowsPerResult: 3 }, completeThreePageWarm: { latency: distribution(modeledWarmTimes), upstreamCallsAfterSeed: modeledWarm.calls() - modeledWarmCallsAfterSeed, rowsPerResult: 3 }, tradeoff: "Complete cold pagination adds one modeled upstream round trip per additional page while preventing first-page undercounting; a valid warm cache avoids those upstream calls." },
    correctness: { allInvariantsPassed: true },
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) { await mkdir(dirname(outputPath), { recursive: true }); await writeFile(outputPath, json); }
  else process.stdout.write(json);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
