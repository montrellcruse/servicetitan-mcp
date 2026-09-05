// Loaded only by benchmark child processes. Every Axios request is fixture-only.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import axios from 'axios';

assert.equal(process.env.ST_CLIENT_ID, 'benchmark-client');
const target = process.env.BENCH_METRICS;
assert(target);
const waitMs = Number(process.env.BENCH_UPSTREAM_MS ?? 20);
const metrics = { authCalls: 0, resourceCalls: 0, unexpectedCalls: 0, active: 0, maximumActive: 0, maximumRssBytes: 0, maximumHeapUsedBytes: 0 };
const histogram = monitorEventLoopDelay({ resolution: 10 }); histogram.enable();
const started = performance.now();
function snapshot() {
  const memory = process.memoryUsage();
  metrics.maximumRssBytes = Math.max(metrics.maximumRssBytes, memory.rss);
  metrics.maximumHeapUsedBytes = Math.max(metrics.maximumHeapUsedBytes, memory.heapUsed);
  return { ...metrics, elapsedMs: performance.now() - started, memory, cpuMicros: process.cpuUsage(), eventLoopDelayMs: { p50: histogram.percentile(50) / 1e6, p95: histogram.percentile(95) / 1e6, p99: histogram.percentile(99) / 1e6, max: histogram.max / 1e6 } };
}
function persist() { writeFileSync(target, JSON.stringify(snapshot())); }
setInterval(() => snapshot(), 50).unref();
process.on('SIGUSR2', persist);
process.on('exit', persist);
axios.defaults.adapter = async config => {
  const url = new URL(config.url, config.baseURL);
  const auth = url.hostname === 'auth-integration.servicetitan.io' && url.pathname === '/connect/token' && config.method === 'post';
  const read = url.hostname === 'api-integration.servicetitan.io' && url.pathname === '/crm/v2/tenant/42/customers' && config.method === 'get';
  if (!auth && !read) { metrics.unexpectedCalls++; throw new Error('Benchmark blocked unexpected upstream operation'); }
  if (auth) { metrics.authCalls++; return { status: 200, statusText: 'OK', config, headers: {}, data: { access_token: 'benchmark-token', expires_in: 3600, token_type: 'Bearer' } }; }
  metrics.resourceCalls++; metrics.active++; metrics.maximumActive = Math.max(metrics.maximumActive, metrics.active);
  try {
    if (waitMs) await delay(waitMs, undefined, { signal: config.signal });
    const data = Array.from({ length: 50 }, (_, index) => ({ id: index + 1, name: `Fixture customer ${index + 1}`, active: true, type: 'Residential', balance: 100.25 + index }));
    return { status: 200, statusText: 'OK', config, headers: {}, data: { page: 1, pageSize: 50, hasMore: false, totalCount: 50, data } };
  } finally { metrics.active--; }
};
