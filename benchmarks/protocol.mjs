import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir, cpus, platform, arch, release, totalmem } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { distribution, workload } from './stats.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function arg(name, fallback) { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; }
const baseline = resolve(arg('--baseline', ''));
assert(process.argv.includes('--baseline'), 'Run prepare-baseline.mjs and pass --baseline directory');
const output = resolve(arg('--output', 'benchmarks/results/protocol.json'));
const count = Number(arg('--samples', '180')), repeats = Number(arg('--repeats', '3')), soakSeconds = Number(arg('--soak-seconds', '30'));
assert(Number.isInteger(count) && count >= 16 && count <= 1000);
assert(Number.isInteger(repeats) && repeats >= 1 && repeats <= 10);
assert(soakSeconds >= 1 && soakSeconds <= 120);
const temporary = await mkdtemp(join(tmpdir(), 'st-protocol-bench-'));
const variants = [{ label: 'v2.6.4', directory: baseline }, { label: 'v3.0.0-rc.1', directory: root }];
let sequence = 0;
const watchdog = setTimeout(() => { console.error('Benchmark timed out'); process.exit(1); }, 12 * 60_000); watchdog.unref();
const results = { schemaVersion: 1, at: new Date().toISOString(), environment: { node: process.version, platform: platform(), architecture: arch(), osRelease: release(), cpu: cpus()[0].model, logicalCpus: cpus().length, totalMemoryBytes: totalmem() }, sourceFingerprint: execFileSync(process.execPath, ['scripts/check-release.mjs', '--fingerprint'], { cwd: root, encoding: 'utf8' }).trim(), baselineCommit: execFileSync('git', ['rev-parse', 'f6becd5'], { cwd: root, encoding: 'utf8' }).trim(), parameters: { count, repeats, soakSeconds, rowsPerResponse: 50, warmupPerScenario: 16, upstreamDelaysMs: [0, 20], steadyConcurrency: [1, 8, 16], safety: 'Synthetic credentials, Axios adapter replaces all upstream calls, only loopback HTTP is real' }, startup: [], steady: [], overload: [], arrivalLoad: [], soak: [], sessionChurn: [], assertions: {} };

async function freePort() {
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise((resolveClose, reject) => listener.close(error => error ? reject(error) : resolveClose())); return port;
}
function environment(metrics, upstreamMs, profile) {
  return { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ST_CLIENT_ID: 'benchmark-client', ST_CLIENT_SECRET: 'benchmark-secret', ST_APP_KEY: 'benchmark-key', ST_TENANT_ID: '42', ST_ENVIRONMENT: 'integration', ST_READONLY: 'true', ST_TIMEZONE: 'UTC', ST_LOG_LEVEL: 'error', ST_MAX_RESPONSE_CHARS: '1000000', ST_MCP_API_KEY: 'benchmark-local-key', ST_MCP_HOST: '127.0.0.1', ST_TOOL_PROFILE: 'full', ...(profile === 'crm' ? { ST_DOMAINS: 'crm' } : {}), BENCH_METRICS: metrics, BENCH_UPSTREAM_MS: String(upstreamMs), HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1', NO_PROXY: '127.0.0.1,localhost' };
}
async function sdkHttp(url) {
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { 'x-api-key': 'benchmark-local-key' } }, reconnectionOptions: { maxRetries: 0 } });
  const client = new Client({ name: 'latency-benchmark', version: '1' });
  try { await client.connect(transport, { timeout: 15000 }); } catch (error) { await client.close(); throw error; }
  return { client, close: async () => { try { await transport.terminateSession(); } finally { await client.close(); } } };
}
async function launch(variant, kind, upstreamMs = 20, profile = 'crm') {
  const metricsFile = join(temporary, `${sequence++}.json`);
  const env = environment(metricsFile, upstreamMs, profile);
  const entry = join(variant.directory, 'build', kind === 'stdio' ? 'index.js' : 'streamable-http.js');
  const args = ['--import', join(root, 'benchmarks/upstream-preload.mjs'), entry];
  let child, client, transport, connection, url, pid, stderr = '', stopped = false;
  const started = performance.now();
  async function close() {
    if (stopped) return; stopped = true;
    if (connection) await connection.close().catch(() => {});
    if (client && kind === 'stdio') await client.close();
    if (transport) await transport.close();
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGTERM');
      let shutdownTimer;
      const completed = await Promise.race([exited.then(() => true), new Promise(resolveWait => { shutdownTimer = setTimeout(() => resolveWait(false), 12000); })]);
      clearTimeout(shutdownTimer);
      if (!completed) { child.kill('SIGKILL'); throw new Error('HTTP benchmark process did not shut down'); }
      assert.equal(child.exitCode, 0, `HTTP exit failed: ${stderr.slice(-500)}`);
    }
  }
  try {
    if (kind === 'stdio') {
      transport = new StdioClientTransport({ command: process.execPath, args, cwd: variant.directory, env, stderr: 'pipe' });
      transport.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-1000); });
      client = new Client({ name: 'latency-benchmark', version: '1' });
      await client.connect(transport, { timeout: 15000 }); pid = transport.pid;
    } else {
      const port = await freePort(); url = `http://127.0.0.1:${port}`;
      child = spawn(process.execPath, args, { cwd: variant.directory, env: { ...env, ST_MCP_PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'] }); pid = child.pid;
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-1000); });
      let ready = false;
      for (let attempt = 0; attempt < 300; attempt++) {
        assert.equal(child.exitCode, null, `HTTP startup failed: ${stderr}`);
        try { const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(100) }); await response.arrayBuffer(); if (response.ok) { ready = true; break; } } catch {}
        await delay(5);
      }
      assert(ready, 'HTTP startup timeout'); connection = await sdkHttp(url); client = connection.client;
    }
    const initializeMs = performance.now() - started;
    const toolsStarted = performance.now(); const catalog = await client.listTools();
    const discoverMs = performance.now() - toolsStarted;
    assert(catalog.tools.some(tool => tool.name === 'crm_customers_list'));
    async function metrics() {
      // Signal delivery is asynchronous. Timestamp change is required before accepting a snapshot.
      const began = performance.now(); let previous;
      try { previous = JSON.parse(await readFile(metricsFile, 'utf8')).elapsedMs; } catch {}
      process.kill(pid, 'SIGUSR2');
      while (performance.now() - began < 3000) {
        await delay(10);
        try { const value = JSON.parse(await readFile(metricsFile, 'utf8')); if (value.elapsedMs !== previous) { assert.equal(value.unexpectedCalls, 0); return value; } } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
      }
      // A signal could have been handled before the first read; request a second distinct snapshot.
      process.kill(pid, 'SIGUSR2'); await delay(20);
      const value = JSON.parse(await readFile(metricsFile, 'utf8')); assert.equal(value.unexpectedCalls, 0); return value;
    }
    return { client, close, metrics, url, pid, startup: { initializeMs, discoverMs, totalMs: initializeMs + discoverMs, tools: catalog.tools.length, catalogBytes: Buffer.byteLength(JSON.stringify(catalog)) } };
  } catch (error) { await close().catch(() => {}); throw error; }
}
async function readCustomer(client) {
  const requestStarted = performance.now();
  const result = await client.callTool({ name: 'crm_customers_list', arguments: { page: 1, pageSize: 50, includeTotal: true } }, undefined, { timeout: 10000 });
  const requestLatencyMs = performance.now() - requestStarted;
  if (result.isError) { const error = new Error(result.content[0]?.text ?? 'Tool failed'); error.code = 'TOOL_ERROR'; error.requestLatencyMs = requestLatencyMs; throw error; }
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.data.length, 50); assert.equal(payload.data[0].id, 1); assert.equal(payload.data[49].id, 50);
  assert.equal(payload.data.reduce((sum, row) => sum + row.balance, 0), 6237.5);
  if (result.structuredContent) assert.deepEqual(result.structuredContent, payload);
  return { requestLatencyMs, responseBytes: Buffer.byteLength(JSON.stringify(result)) };
}
async function save() { await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(results, null, 2) + '\n'); }

try {
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const variant of repeat % 2 ? [...variants].reverse() : variants) {
      for (const kind of ['stdio', 'http']) for (const profile of ['full', 'crm']) {
        const runtime = await launch(variant, kind, 0, profile);
        try { results.startup.push({ version: variant.label, kind, profile, repeat, ...runtime.startup }); }
        finally { await runtime.close(); }
      }
    }
  }
  console.error('Startup/discovery comparisons complete');
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const variant of repeat % 2 ? [...variants].reverse() : variants) {
      for (const kind of ['stdio', 'http']) for (const upstreamMs of [0, 20]) {
        const runtime = await launch(variant, kind, upstreamMs);
        try {
          for (const concurrency of [1, 8, 16]) {
            const warmup = await workload({ count: 16, concurrency: 1, call: () => readCustomer(runtime.client) }); assert.equal(warmup.failures, 0);
            const before = await runtime.metrics();
            const measured = await workload({ count, concurrency, call: () => readCustomer(runtime.client) });
            const after = await runtime.metrics();
            assert.equal(measured.failures, 0, JSON.stringify(measured.errors.slice(0, 1)));
            assert.equal(after.resourceCalls - before.resourceCalls, count);
            results.steady.push({ version: variant.label, kind, upstreamMs, repeat, ...measured, processBefore: before, processAfter: after });
            await save();
          }
        } finally { await runtime.close(); }
      }
    }
    console.error(`Steady workload repetition ${repeat + 1}/${repeats} complete`);
  }
  for (const variant of variants) {
    const runtime = await launch(variant, 'http', 20);
    try {
      const burst = await workload({ count: 64, concurrency: 64, call: () => readCustomer(runtime.client) });
      if (variant.label.startsWith('v3')) { assert(burst.failures > 0); assert(burst.successes > 0); assert(burst.errors.every(error => /Server is busy/i.test(error.message))); }
      else assert.equal(burst.failures, 0);
      const recovery = await workload({ count: 16, concurrency: 8, call: () => readCustomer(runtime.client) }); assert.equal(recovery.failures, 0);
      results.overload.push({ version: variant.label, kind: 'http', upstreamMs: 20, burst, recovery, process: await runtime.metrics() });
      for (const rate of [100, 500]) {
        const began = performance.now(), pending = [], lag = [];
        const offered = rate * 3;
        for (let index = 0; index < offered; index++) {
          const target = began + index * 1000 / rate;
          if (target > performance.now()) await delay(target - performance.now());
          const submitted = performance.now(); lag.push(Math.max(0, submitted - target));
          pending.push(readCustomer(runtime.client).then(extra => ({ ok: true, ms: extra.requestLatencyMs, scheduledMs: submitted - target + extra.requestLatencyMs, ...extra }), error => { const elapsed = error.requestLatencyMs ?? performance.now() - submitted; return { ok: false, ms: elapsed, scheduledMs: submitted - target + elapsed, message: error.message.slice(0, 200) }; }));
        }
        const samples = await Promise.all(pending), elapsedMs = performance.now() - began;
        const successes = samples.filter(sample => sample.ok), failures = samples.filter(sample => !sample.ok);
        assert(failures.every(error => /Server is busy/i.test(error.message)));
        if (rate === 100) assert.equal(failures.length, 0);
        results.arrivalLoad.push({ version: variant.label, requestedArrivalsPerSecond: rate, offered, elapsedMs, successes: successes.length, failures: failures.length, successfulRequestsPerSecond: successes.length * 1000 / elapsedMs, successLatencyMs: distribution(successes.map(sample => sample.ms)), scheduledSuccessLatencyMs: distribution(successes.map(sample => sample.scheduledMs)), schedulerLagMs: distribution(lag), failureLatencyMs: distribution(failures.map(sample => sample.ms)), samples });
      }
      const recovered = await workload({ count: 16, concurrency: 8, call: () => readCustomer(runtime.client) }); assert.equal(recovered.failures, 0);
    } finally { await runtime.close(); }
  }
  console.error('Overload, fixed-arrival load and recovery complete');
  for (const variant of variants) {
    const runtime = await launch(variant, 'http', 20);
    try {
      const before = await runtime.metrics(), samples = [], checkpoints = [];
      const started = performance.now();
      while (performance.now() - started < soakSeconds * 1000) {
        const batch = await workload({ count: 128, concurrency: 8, call: () => readCustomer(runtime.client) }); assert.equal(batch.failures, 0);
        samples.push(...batch.samples.map(sample => sample.ms)); checkpoints.push(await runtime.metrics());
      }
      const elapsedMs = performance.now() - started;
      const after = await runtime.metrics();
      assert.equal(after.active, 0);
      results.soak.push({ version: variant.label, elapsedMs, successes: samples.length, failures: 0, successfulRequestsPerSecond: samples.length * 1000 / elapsedMs, successLatencyMs: distribution(samples), before, after, checkpoints, rawLatencyMs: samples });
      const churn = [];
      for (let round = 0; round < 5; round++) {
        const connections = await Promise.all(Array.from({ length: 8 }, () => sdkHttp(runtime.url)));
        const reads = await Promise.all(connections.map(connection => readCustomer(connection.client))); assert.equal(reads.length, 8);
        await Promise.all(connections.map(connection => connection.close()));
        churn.push(await runtime.metrics());
      }
      const recovered = await workload({ count: 16, concurrency: 8, call: () => readCustomer(runtime.client) }); assert.equal(recovered.failures, 0);
      results.sessionChurn.push({ version: variant.label, sessionsCreatedAndClosed: 40, rounds: 5, concurrentNewSessions: 8, successfulRecoveryReads: 16, checkpoints: churn });
    } finally { await runtime.close(); }
  }
  results.assertions = { successfulRowsAndAmountsMatch: true, expectedOverloadOnly: true, recoveryAfterLoadPassed: true, sessionChurnPassed: true, controlledUpstreamOnly: true };
  results.harnessHashes = {};
  for (const file of ['protocol.mjs', 'stats.mjs', 'upstream-preload.mjs', 'prepare-baseline.mjs']) results.harnessHashes[file] = createHash('sha256').update(await readFile(join(root, 'benchmarks', file))).digest('hex');
  await save(); console.log(JSON.stringify({ output, assertions: results.assertions, scenarios: results.steady.length }));
} finally { clearTimeout(watchdog); await rm(temporary, { recursive: true, force: true }); }
