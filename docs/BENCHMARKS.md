# V3 latency and load measurements

Measured September 4, 2026 against v2.6.4 (`f6becd5`) on an Apple M4 with 10 logical CPUs, 16 GiB RAM, macOS arm64, and Node 22.23.2 / 24.20.0. Each comparison uses the same runtime and locked dependencies. See [benchmark instructions](../benchmarks/README.md) to reproduce the workloads.

The measured package is v3.0.0. Its built JavaScript identity is `6f749dae3e0e85ddf4a69838583ff60c6e319469503c87c99c277b574d03f846`, calculated from the sorted paths and SHA-256 values of the eight runtime JavaScript files. Documentation edits do not alter that runtime identity.

V3 avoids repeated upstream work through complete-report caching and bounds overload. Ordinary reads remain close to v2; startup, structured responses, validation, and queueing add costs. These results do not establish a universal latency improvement.

## Protocol latency

The table uses built HTTP MCP processes on Node 24, a synthetic 20 ms Axios upstream delay, and identical 50-row customer results. Each case has three repetitions of 180 measured calls per version. Timing stops when the SDK call resolves, before result assertions and byte counting. Values are milliseconds.

| Concurrent calls | v2 median / p95 / p99 | v3 median / p95 / p99 |
| ---: | ---: | ---: |
| 1 | 26.33 / 28.46 / 28.87 | 27.40 / 29.54 / 30.49 |
| 8 | 24.35 / 27.44 / 31.52 | 23.33 / 26.86 / 35.28 |
| 16 | 23.21 / 31.17 / 37.22 | 43.22 / 45.75 / 52.42 |

At 16 callers, v3 queues behind its eight-active upstream limit. V2 has no equivalent bound. The fixture excludes real ServiceTitan networking, response decoding, and upstream contention; its throughput is not a production operating target.

Full readonly stdio startup plus discovery had Node 24 medians of 130 ms for v2 and 155 ms for v3, with only three cold-process samples each. The full catalog shrank from 526,200 to 283,769 serialized bytes; the same CRM domain filter shrank from 68,568 to 35,387 bytes. V3 hides mutating tools in readonly mode. These byte counts are not model-token estimates.

The fixed customer response grew from 8,227 to 12,845 bytes because v3 provides both text and structured JSON. Both versions returned the same 50 rows and verified total. No model reasoning-accuracy claim follows from this benchmark.

## Load, caching, and retention

- Across both runtimes, 25,920 measured steady calls cover v2/v3, stdio/HTTP, 0/20 ms fixture delays, concurrency 1/8/16, and three repetitions. Results are checked; failures do not count as successful throughput.
- The v3 client suite offers 7,680 requests across concurrency 1/8/32/128/192, verifies no more than eight upstream requests and 128 queued requests, and checks overflow classification, cancellation, and recovery. Fault cases cover authentication, stale 401s, 429 timing, and ambiguous write outcomes using synthetic adapters.
- Three-second arrival workloads at 100 and 500 calls/s deliberately test overload. Thirty-second HTTP soaks at concurrency eight completed 9,344–9,728 calls for v2 and 9,472–9,728 for v3 across the two runtimes, with no request failures. These are short local tests, not long-running production evidence.
- A synthetic three-page report with 20 ms/page latency has Node 24 medians of 66.53 ms cold and 0.025 ms from a complete warm cache, with zero additional upstream calls. The corresponding Node 22 medians are 66.84 ms and 0.032 ms. Twenty identical callers share three page requests and receive all rows. Expiry reloads and separate clients retain distinct values. The reporting cooldown uses an explicitly synthetic clock in this fixture.
- Separate diagnostics force garbage collection after three equal 1,000-call rounds and 24 closed sessions. V3 round-three retained heap was 42.6 MB on Node 24 and 46.2 MB on Node 22, without exceeding the exploratory growth threshold. This is not process RSS, a deployment memory limit, or proof of long-duration leak-free operation.

Node 22's benchmark driver emitted abort-listener warnings during sustained HTTP work, including against v2. A separate raw-fetch control showed settled-request listeners returning to zero after garbage collection on both runtimes, consistent with GC-dependent client cleanup. The smaller control did not reproduce the warning itself. No listener limit or dependency was patched. Node 22 soak timing may include warning-output overhead; steady latency comparisons finished before the warnings.

## Operating limits

Retain bounded concurrency, reuse MCP sessions, and cache only complete reports. ServiceTitan documents default limits of 60 regular calls/s per application per tenant and one execution of the same report per minute per tenant. The MCP uses concurrency bounds and reactive 429 cooldowns; it has no distributed tenant-wide requests-per-second limiter. Multiple processes need coordinated request and report budgets. See [ServiceTitan rate limits](https://help.servicetitan.com/v1/docs/default-api-rate-limitsfor-regular-apis-and-reporting-apis).

The benchmark acceptance criteria cover correctness, limits, accounting, cancellation, and recovery. They do not impose an invented millisecond SLA. Public cloud/proxy effects, real upstream saturation, integration writes, and a second live company remain outside this measurement scope.
