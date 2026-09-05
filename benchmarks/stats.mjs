import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

export function distribution(values) {
  assert(values.every(value => Number.isFinite(value) && value >= 0));
  if (!values.length) return { n: 0, min: null, p50: null, p95: null, p99: null, max: null, mean: null };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = fraction => sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
  return { n: sorted.length, min: sorted[0], p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1), mean: sorted.reduce((a, b) => a + b, 0) / sorted.length };
}

// Closed loop: latency starts before the submitted call, including application queue wait.
export async function workload({ count, concurrency, call }) {
  const samples = [], errors = [];
  let next = 0;
  const began = performance.now();
  await Promise.all(Array.from({ length: Math.min(count, concurrency) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= count) return;
      const started = performance.now();
      try {
        const extra = await call(index), validatedScenarioMs = performance.now() - started;
        samples.push({ index, ms: extra?.requestLatencyMs ?? validatedScenarioMs, validatedScenarioMs, ...extra });
      } catch (error) {
        errors.push({ index, ms: error.requestLatencyMs ?? performance.now() - started, code: error.code ?? error.name, message: String(error.message).slice(0, 200) });
      }
    }
  }));
  const elapsedMs = performance.now() - began;
  return { count, concurrency, elapsedMs, successes: samples.length, failures: errors.length, successfulRequestsPerSecond: samples.length * 1000 / elapsedMs, successLatencyMs: distribution(samples.map(sample => sample.ms)), failureLatencyMs: distribution(errors.map(error => error.ms)), samples, errors };
}
