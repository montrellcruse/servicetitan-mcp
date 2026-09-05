# V3 latency and load measurements

Measured September 4, 2026 against v2.6.4 (`f6becd5`) on an Apple M4 with 10 logical CPUs, 16 GiB RAM, macOS arm64, and Node 22.23.2 / 24.20.0. Each comparison uses the same runtime and locked dependencies. See [benchmark instructions](../benchmarks/README.md) to reproduce the workloads.

V3 avoids repeated upstream work through complete-report caching and bounds overload. Ordinary reads remain close to v2; startup, structured responses, validation, and queueing add costs. These results do not establish a universal latency improvement.

## Protocol latency

The table uses built HTTP MCP processes on Node 24, a synthetic 20 ms Axios upstream delay, and identical 50-row customer results. Each case has three repetitions of 180 measured calls per version. Timing stops when the SDK call resolves, before result assertions and byte counting. Values are milliseconds.

| Concurrent calls | v2 median / p95 / p99 | v3 median / p95 / p99 |
| ---: | ---: | ---: |
| 1 | 24.77 / 26.56 / 27.38 | 25.73 / 27.58 / 28.03 |
| 8 | 23.51 / 26.40 / 29.85 | 23.43 / 26.20 / 30.90 |
| 16 | 22.83 / 29.59 / 33.99 | 42.60 / 46.04 / 52.60 |

At 16 callers, v3 queues behind its eight-active upstream limit. V2 has no equivalent bound. The fixture excludes real ServiceTitan networking, response decoding, and upstream contention; its throughput is not a production operating target.

Full readonly stdio startup plus discovery had Node 24 medians of 130 ms for v2 and 155 ms for v3, with only three cold-process samples each. The full catalog shrank from 526,200 to 283,769 serialized bytes; the same CRM domain filter shrank from 68,568 to 35,387 bytes. V3 hides mutating tools in readonly mode. These byte counts are not model-token estimates.

The fixed customer response grew from 8,227 to 12,845 bytes because v3 provides both text and structured JSON. Both versions returned the same 50 rows and verified total. No model reasoning-accuracy claim follows from this benchmark.

## Load, caching, and retention

- Across both runtimes, 25,920 measured steady calls cover v2/v3, stdio/HTTP, 0/20 ms fixture delays, concurrency 1/8/16, and three repetitions. Results are checked; failures do not count as successful throughput.
- The v3 client suite offers 7,680 requests across concurrency 1/8/32/128/192, verifies no more than eight upstream requests and 128 queued requests, and checks overflow classification, cancellation, and recovery. Fault cases cover authentication, stale 401s, 429 timing, and ambiguous write outcomes using synthetic adapters.
- Three-second arrival workloads at 100 and 500 calls/s deliberately test overload. Thirty-second HTTP soaks at concurrency eight complete approximately 9,700–9,900 calls per version/runtime without request failures. These are short local tests, not long-running production evidence.
- A synthetic three-page report with 20 ms/page latency takes about 66 ms cold and under 0.1 ms median from a complete warm cache, with zero additional upstream calls. Twenty identical callers share three page requests and receive all rows. Expiry reloads and separate clients retain distinct values. The reporting cooldown uses an explicitly synthetic clock in this fixture.
- Separate diagnostics force garbage collection after three equal 1,000-call rounds and 24 closed sessions. V3 retained heap stays around 43–45 MB on Node 24 and 45–46 MB on Node 22, without exceeding the exploratory growth threshold. This is not process RSS, a deployment memory limit, or proof of long-duration leak-free operation.

Node 22's benchmark driver emitted abort-listener warnings during sustained HTTP work, including against v2. A separate raw-fetch control showed settled-request listeners returning to zero after garbage collection on both runtimes, consistent with GC-dependent client cleanup. The smaller control did not reproduce the warning itself. No listener limit or dependency was patched. Node 22 soak timing may include warning-output overhead; steady latency comparisons finished before the warnings.

## Operating limits

Retain bounded concurrency, reuse MCP sessions, and cache only complete reports. ServiceTitan documents default limits of 60 regular calls/s per application per tenant and one execution of the same report per minute per tenant. The MCP uses concurrency bounds and reactive 429 cooldowns; it has no distributed tenant-wide requests-per-second limiter. Multiple processes need coordinated request and report budgets. See [ServiceTitan rate limits](https://help.servicetitan.com/v1/docs/default-api-rate-limitsfor-regular-apis-and-reporting-apis).

The benchmark acceptance criteria cover correctness, limits, accounting, cancellation, and recovery. They do not impose an invented millisecond SLA. Public cloud/proxy effects, real upstream saturation, integration writes, and a second live company remain outside this measurement scope.
