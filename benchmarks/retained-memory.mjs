/**
 * Separate post-GC retention diagnostic, not a latency benchmark.
 * node benchmarks/retained-memory.mjs --baseline /tmp/prepared-v2 --output /tmp/retained-memory.json
 * Requires existing builds; never rebuilds source, reads .env, or contacts ServiceTitan.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { tmpdir, cpus, platform, arch, totalmem } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function argument(name, fallback) { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; }
assert(process.argv.includes('--baseline'), 'Pass --baseline PATH from prepare-baseline.mjs');
const baseline = resolve(argument('--baseline'));
const output = resolve(argument('--output', join(tmpdir(), 'st-retained-memory.json')));
const TOTAL_BOUND_MS = 120000;
const ROUNDS = 3, REQUESTS_PER_ROUND = 1000, CONCURRENCY = 8, UPSTREAM_MS = 20;
const TEN_MIB = 10 * 1024 * 1024;
const temporary = await mkdtemp(join(tmpdir(), 'st-retained-memory-'));
const deadline = new AbortController();
// Reserve five seconds for exact-child cleanup rather than exiting and orphaning it.
const deadlineTimer = setTimeout(() => deadline.abort(new Error('Retained-memory diagnostic deadline exceeded')), TOTAL_BOUND_MS - 5000);
const activeRuntimes = new Set();
const results = {
  schemaVersion: 1, diagnostic: 'Post-GC retained memory under synthetic MCP HTTP load', startedAt: new Date().toISOString(),
  environment: { node: process.version, platform: platform(), architecture: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem() },
  parameters: { rounds: ROUNDS, requestsPerRound: REQUESTS_PER_ROUND, concurrency: CONCURRENCY, upstreamDelayMs: UPSTREAM_MS, warmupRequests: 16, gcCallsPerSnapshot: 3, idleAfterGcMs: 50, totalBoundMs: TOTAL_BOUND_MS, churnWaves: 3, sessionsPerWave: 8 },
  interpretation: {
    scope: 'Diagnostic only; --expose-gc and explicit collection are intentionally excluded from latency benchmark results.',
    threshold: 'Exploratory retained-heap change threshold is max(10MiB,10% of reference post-GC heap). Exceeding it is a follow-up signal, not an automatic leak verdict.',
    rss: 'RSS and external memory are observations only. Allocator high-water or RSS growth does not establish retained JavaScript objects or a leak.',
    limit: 'Three short synthetic rounds cannot establish long-duration leak-free operation.',
  },
  variants: [],
};

function checkDeadline() { if (deadline.signal.aborted) throw new Error('Retained-memory diagnostic deadline exceeded'); }
async function freePort() {
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolveClose, reject) => listener.close(error => error ? reject(error) : resolveClose()));
  return port;
}

async function connect(url) {
  checkDeadline();
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
    requestInit: { headers: { 'x-api-key': 'benchmark-local-key' }, signal: deadline.signal },
    reconnectionOptions: { maxRetries: 0 },
  });
  const client = new Client({ name: 'retained-memory-diagnostic', version: '1' });
  async function close() {
    try { await Promise.race([transport.terminateSession().catch(() => {}), delay(1000)]); }
    finally { await client.close().catch(() => {}); }
  }
  try { await client.connect(transport, { timeout: 10000, signal: deadline.signal }); }
  catch (error) { await close(); throw error; }
  return { client, close };
}

async function launch(directory, label) {
  checkDeadline();
  const entry = join(directory, 'build', 'streamable-http.js');
  await access(entry);
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const metricsFile = join(temporary, `${label}-upstream.json`);
  const retainedFile = join(temporary, `${label}-retained.json`);
  const child = spawn(process.execPath, ['--expose-gc', '--import', join(ROOT, 'benchmarks/memory-preload.mjs'), entry], {
    cwd: directory, stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '',
      ST_CLIENT_ID: 'benchmark-client', ST_CLIENT_SECRET: 'benchmark-secret', ST_APP_KEY: 'benchmark-key', ST_TENANT_ID: '42',
      ST_ENVIRONMENT: 'integration', ST_READONLY: 'true', ST_TIMEZONE: 'UTC', ST_LOG_LEVEL: 'error', ST_MAX_RESPONSE_CHARS: '1000000',
      ST_MCP_API_KEY: 'benchmark-local-key', ST_MCP_HOST: '127.0.0.1', ST_MCP_PORT: String(port), ST_TOOL_PROFILE: 'full', ST_DOMAINS: 'crm',
      BENCH_METRICS: metricsFile, BENCH_RETAINED_METRICS: retainedFile, BENCH_UPSTREAM_MS: String(UPSTREAM_MS),
      HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1', NO_PROXY: '127.0.0.1,localhost',
    },
  });
  let stderr = '', connection, stopped = false, lastSnapshot = 0;
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
  const exited = once(child, 'exit');
  async function close() {
    if (stopped) return;
    stopped = true;
    try { if (connection) await connection.close(); }
    finally {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        const completed = await Promise.race([exited.then(() => true), delay(3000).then(() => false)]);
        if (!completed) { child.kill('SIGKILL'); await Promise.race([exited, delay(1000)]); }
      }
      activeRuntimes.delete(runtime);
    }
    assert.equal(child.exitCode, 0, `Diagnostic child did not exit cleanly: ${stderr.slice(-300)}`);
  }
  async function snapshot(stage) {
    checkDeadline();
    assert.equal(child.exitCode, null, 'Diagnostic child exited before sampling');
    process.kill(child.pid, 'SIGWINCH');
    const started = performance.now();
    while (performance.now() - started < 8000) {
      checkDeadline();
      await delay(10);
      try {
        const value = JSON.parse(await readFile(retainedFile, 'utf8'));
        if (value.sequence <= lastSnapshot) continue;
        assert.equal(value.pid, child.pid, 'Snapshot belongs to a different process');
        assert.equal(value.passed, true, value.error ?? 'Forced-GC snapshot failed');
        assert.equal(value.upstream.active, 0);
        assert.equal(value.upstream.unexpectedCalls, 0);
        lastSnapshot = value.sequence;
        return { stage, ...value };
      } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    }
    throw new Error('Forced-GC snapshot did not arrive within eight seconds');
  }
  const runtime = { child, url, close, snapshot, client: undefined };
  activeRuntimes.add(runtime);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      checkDeadline();
      assert.equal(child.exitCode, null, `Diagnostic startup failed: ${stderr.slice(-300)}`);
      try {
        const health = await fetch(`${url}/health`, { signal: AbortSignal.any([deadline.signal, AbortSignal.timeout(100)]) });
        await health.arrayBuffer();
        if (health.ok) { ready = true; break; }
      } catch { /* Local listener not ready yet. */ }
      await delay(20);
    }
    assert(ready, 'Diagnostic HTTP startup timed out');
    connection = await connect(url);
    runtime.client = connection.client;
    return runtime;
  } catch (error) { await close().catch(() => {}); throw error; }
}

async function readCustomers(client) {
  checkDeadline();
  const result = await client.callTool({ name: 'crm_customers_list', arguments: { page: 1, pageSize: 50, includeTotal: true } }, undefined, { timeout: 10000, signal: deadline.signal });
  assert(!result.isError, 'Synthetic customer read failed');
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.data.length, 50); assert.equal(payload.data[0].id, 1); assert.equal(payload.data[49].id, 50);
  assert.equal(payload.data.reduce((sum, row) => sum + row.balance, 0), 6237.5);
  if (result.structuredContent) assert.deepEqual(result.structuredContent, payload);
}

async function batch(client, count, concurrency) {
  let next = 0, completed = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next++ < count) { await readCustomers(client); completed++; }
  }));
  assert.equal(completed, count);
  return { requests: count, successes: completed, failures: 0, diagnosticWorkloadElapsedMs: performance.now() - started };
}

function retainedChange(reference, current) {
  const thresholdBytes = Math.max(TEN_MIB, reference.afterGc.heapUsed * .1);
  const heapUsedDeltaBytes = current.afterGc.heapUsed - reference.afterGc.heapUsed;
  return {
    referenceStage: reference.stage, comparedStage: current.stage, thresholdBytes,
    heapUsedDeltaBytes, heapUsedDeltaPercent: heapUsedDeltaBytes / reference.afterGc.heapUsed * 100,
    externalDeltaBytes: current.afterGc.external - reference.afterGc.external,
    rssDeltaBytes: current.afterGc.rss - reference.afterGc.rss,
    aboveExploratoryHeapThreshold: heapUsedDeltaBytes > thresholdBytes,
    assessment: heapUsedDeltaBytes > thresholdBytes
      ? 'Retained heap increased beyond the exploratory threshold; inspect retained objects before attributing a leak.'
      : 'No large retained-heap increase in this short synthetic comparison; this does not prove leak-free operation.',
  };
}

try {
  for (const [label, directory] of [['v2', baseline], ['v3', ROOT]]) {
    process.stderr.write(`[retained-memory] ${label}: warmup, three load rounds, then closed-session churn\n`);
    const runtime = await launch(directory, label);
    try {
      const warmup = await batch(runtime.client, 16, 1);
      const before = await runtime.snapshot('after-warmup');
      assert.equal(before.upstream.resourceCalls, 16);
      const rounds = [];
      let previous = before;
      for (let round = 1; round <= ROUNDS; round++) {
        const workload = await batch(runtime.client, REQUESTS_PER_ROUND, CONCURRENCY);
        const snapshot = await runtime.snapshot(`after-round-${round}`);
        assert.equal(snapshot.upstream.resourceCalls - previous.upstream.resourceCalls, REQUESTS_PER_ROUND);
        rounds.push({ round, workload, snapshot });
        previous = snapshot;
      }
      let churnReads = 0;
      for (let wave = 0; wave < 3; wave++) {
        const connections = [];
        try {
          // Sequential establishment makes cleanup explicit even if one connect fails.
          for (let index = 0; index < 8; index++) connections.push(await connect(runtime.url));
          await Promise.all(connections.map(connection => readCustomers(connection.client)));
          churnReads += connections.length;
        } finally { await Promise.allSettled(connections.map(connection => connection.close())); }
      }
      const afterChurn = await runtime.snapshot('after-24-closed-sessions');
      assert.equal(afterChurn.upstream.resourceCalls - previous.upstream.resourceCalls, churnReads);
      const finalRecovery = await batch(runtime.client, 8, 8);
      results.variants.push({
        label, packageVersion: JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')).version,
        warmup, before, rounds, afterChurn, finalRecovery,
        round2VsRound1: retainedChange(rounds[0].snapshot, rounds[1].snapshot),
        round3VsRound1: retainedChange(rounds[0].snapshot, rounds[2].snapshot),
        closedSessionChurnVsLastRound: retainedChange(rounds[2].snapshot, afterChurn),
        successfulCustomerReads: 16 + ROUNDS * REQUESTS_PER_ROUND + churnReads + 8,
        closedSessions: 24, correctnessPassed: true,
      });
    } finally { await runtime.close(); }
  }
  results.finishedAt = new Date().toISOString();
  results.passed = true;
  results.harnessHashes = {};
  for (const file of ['retained-memory.mjs', 'memory-preload.mjs', 'upstream-preload.mjs']) results.harnessHashes[file] = createHash('sha256').update(await readFile(join(ROOT, 'benchmarks', file))).digest('hex');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output, passed: true, variants: results.variants.map(value => ({ label: value.label, successfulCustomerReads: value.successfulCustomerReads, postGcRound3HeapUsedBytes: value.rounds[2].snapshot.afterGc.heapUsed, round3AboveExploratoryHeapThreshold: value.round3VsRound1.aboveExploratoryHeapThreshold })) })}\n`);
} catch (error) {
  results.passed = false;
  results.error = { name: error?.name ?? 'Error', message: String(error?.message ?? 'Memory diagnostic failed').replace(/benchmark-(?:secret|key|token|local-key)/g, '[REDACTED]') };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output, passed: false, error: results.error })}\n`);
  process.exitCode = 1;
} finally {
  clearTimeout(deadlineTimer);
  await Promise.allSettled([...activeRuntimes].map(runtime => runtime.close()));
  await rm(temporary, { recursive: true, force: true });
}
