// Dedicated retained-memory diagnostic only. Never import into latency runs.
import './upstream-preload.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { getHeapStatistics } from 'node:v8';
import { setTimeout as delay, setImmediate as nextTurn } from 'node:timers/promises';

assert.equal(process.env.ST_CLIENT_ID, 'benchmark-client');
assert.equal(typeof globalThis.gc, 'function', 'Memory diagnostic requires child --expose-gc');
const target = process.env.BENCH_RETAINED_METRICS;
assert(target && process.env.BENCH_METRICS, 'Memory diagnostic output paths are required');
let sequence = 0;
let collecting = false;

function upstreamSnapshot() {
  // The common controlled-adapter preload synchronously persists this signal.
  process.emit('SIGUSR2');
  return JSON.parse(readFileSync(process.env.BENCH_METRICS, 'utf8'));
}

function persist(value) {
  writeFileSync(`${target}.tmp`, JSON.stringify(value));
  renameSync(`${target}.tmp`, target);
}

async function collect() {
  if (collecting) return;
  collecting = true;
  try {
    const before = upstreamSnapshot();
    assert.equal(before.active, 0, 'Forced-GC snapshot requested with active upstream calls');
    assert.equal(before.unexpectedCalls, 0, 'Unexpected upstream operation in fixture');
    const beforeGc = process.memoryUsage();
    const started = performance.now();
    let gcElapsedMs = 0;
    // Event-loop turns allow completed requests and closed-session callbacks to
    // release references before each full collection. Final idle is explicit.
    for (let cycle = 0; cycle < 3; cycle++) {
      await nextTurn();
      await nextTurn();
      const gcStarted = performance.now();
      globalThis.gc();
      gcElapsedMs += performance.now() - gcStarted;
    }
    await delay(50);
    const after = upstreamSnapshot();
    assert.equal(after.active, 0, 'Upstream work started during forced-GC sampling');
    assert.equal(after.resourceCalls, before.resourceCalls, 'Request count changed during forced-GC sampling');
    persist({
      sequence: ++sequence, pid: process.pid, at: new Date().toISOString(), passed: true,
      gcCalls: 3, eventLoopTurnsBeforeEachGc: 2, finalIdleMs: 50,
      diagnosticElapsedMs: performance.now() - started, gcElapsedMs,
      beforeGc, afterGc: process.memoryUsage(), heapStatistics: getHeapStatistics(),
      upstream: { authCalls: after.authCalls, resourceCalls: after.resourceCalls, unexpectedCalls: after.unexpectedCalls, active: after.active, maximumActive: after.maximumActive },
    });
  } catch (error) {
    persist({ sequence: ++sequence, pid: process.pid, passed: false, error: String(error?.message ?? 'Memory snapshot failed') });
  } finally { collecting = false; }
}

// The parent signals only the exact diagnostic child PID it spawned.
process.on('SIGWINCH', () => { void collect(); });
