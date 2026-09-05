import assert from 'node:assert/strict';
import test from 'node:test';
import { distribution, workload } from './stats.mjs';

test('nearest-rank percentiles handle empty and small samples without interpolation', () => {
  assert.equal(distribution([]).p99, null);
  assert.deepEqual(distribution([5, 1, 3, 2, 4]), { n: 5, min: 1, p50: 3, p95: 5, p99: 5, max: 5, mean: 3 });
  assert.equal(distribution(Array.from({ length: 100 }, (_, index) => index + 1)).p95, 95);
  assert.throws(() => distribution([NaN]));
});

test('load accounting never counts fast failures as successful throughput', async () => {
  let active = 0, maximum = 0;
  const result = await workload({ count: 12, concurrency: 3, call: async index => {
    active++; maximum = Math.max(maximum, active);
    try { await new Promise(resolve => setTimeout(resolve, 2)); if (index % 3 === 0) throw new Error('expected fixture rejection'); return {}; }
    finally { active--; }
  } });
  assert.equal(maximum, 3); assert.equal(active, 0);
  assert.equal(result.successes, 8); assert.equal(result.failures, 4);
  assert.equal(result.successLatencyMs.n, 8); assert.equal(result.failureLatencyMs.n, 4);
  assert.equal(result.successfulRequestsPerSecond, 8000 / result.elapsedMs);
  assert.equal(new Set([...result.samples, ...result.errors].map(sample => sample.index)).size, 12);
});

test('SDK response timing excludes explicit post-response benchmark validation', async () => {
  const result = await workload({ count: 1, concurrency: 1, call: async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return { requestLatencyMs: 1 };
  } });
  assert.equal(result.successLatencyMs.p50, 1);
  assert(result.samples[0].validatedScenarioMs >= result.samples[0].ms);
});
