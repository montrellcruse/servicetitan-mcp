# Maintainer benchmarks

These reusable benchmarks exercise the release candidate with deterministic local fixtures. They do not read `.env` or contact ServiceTitan. Run them from the repository root with locked dependencies installed and the package built. Node 22 and 24 are supported.

Run one benchmark process at a time on an otherwise quiet machine. Store generated output under the ignored `benchmarks/results/` directory; raw samples are intentionally not committed.

```sh
mkdir -p benchmarks/results
node --test benchmarks/stats.test.mjs
node benchmarks/prepare-baseline.mjs
```

The baseline command prints a temporary v2.6.4 directory. Pass that exact path to the comparison and memory commands:

```sh
node benchmarks/protocol.mjs --baseline /path/printed/above --samples 180 --repeats 3 --soak-seconds 30 --output benchmarks/results/protocol-node24.json
node benchmarks/client-load.mjs --output benchmarks/results/client-load-node24.json
node benchmarks/analytics.mjs --samples 40 --modeled-delay-ms 20 --output benchmarks/results/analytics-node24.json
node benchmarks/retained-memory.mjs --baseline /path/printed/above --output benchmarks/results/retained-memory-node24.json
```

Repeat with a Node 22 binary and matching `node22` filenames when comparing supported runtimes.

## Harness scope

- `protocol.mjs` compares actual built v2 and v3 stdio and Streamable HTTP entrypoints through the real MCP SDK. Its controlled adapter accepts only synthetic authentication and CRM fixture requests. Loopback HTTP is real; ServiceTitan network access is impossible. It measures startup, steady closed-loop work, scheduled arrival load, overload recovery, short soak behavior, and session churn.
- `client-load.mjs` bundles the current client source and measures queueing, concurrency, retry, cancellation, and recovery against a deterministic adapter.
- `analytics.mjs` bundles the current report executor and caches. It verifies complete pagination, cold and warm caches, duplicate fan-in, TTL invalidation, and per-client isolation. Its configurable delay is a synthetic per-page model.
- `retained-memory.mjs` runs separately with `--expose-gc`. It compares retained heap after equal load rounds and closed-session churn. Forced collection is never part of latency measurements.
- `stats.mjs` and `stats.test.mjs` provide and verify shared distribution and workload accounting.
- `upstream-preload.mjs` and `memory-preload.mjs` are child-process instrumentation used by the protocol and retained-memory harnesses.
- `prepare-baseline.mjs` creates the temporary historical baseline without copying credentials.

Every harness exits nonzero when its correctness or accounting invariants fail. Keep raw latency arrays and call counts when reviewing a run. Sub-millisecond local timing differences are sensitive to host noise; fixture correctness and eliminated upstream calls are more stable evidence.

## Interpretation

The protocol harness's 20 ms upstream delay and the analytics per-page delay are models. They do not establish ServiceTitan latency or a production throughput limit. The production reporting cooldown is replaced only where the harness explicitly supplies a test clock.

RSS and V8 heap capacity may remain high after temporary allocations. Use the retained-memory harness's post-GC `heapUsed`, `external`, and `arrayBuffers` observations for follow-up; do not treat RSS growth alone as a leak.

ServiceTitan documents default limits of 60 regular API calls per second per application and tenant, and one execution of the same report per minute per tenant. Synthetic local throughput above those limits is not permission to send equivalent production load.

The concise maintained results and caveats belong in [`docs/BENCHMARKS.md`](../docs/BENCHMARKS.md). Do not commit `benchmarks/results/` outputs or machine-specific baseline directories.
