# V3 stable read-only validation

Version `3.0.0` prepares a stable release under the `readonly-v1` policy in [v3-acceptance.json](v3-acceptance.json). Stable support covers read-only use subject to each company's scopes, modules, separate runtime/configuration, and readiness/report validation. Live integration writes and independent-company acceptance are explicitly scoped out with reasons; neither is recorded as passed. Mutations remain experimental, and dashboard parity is not certified.

## Automated coverage

The local matrix uses Node 22.23.2 and 24.20.0 on macOS arm64. Each runtime passes 522 tests across 39 files, eight built-process MCP wire tests, and two packaging exclusion tests. Contract checks, TypeScript checking, lint, builds, package installation, ESM imports, and declaration consumption also pass. [GitHub CI](https://github.com/montrellcruse/servicetitan-mcp/actions/workflows/ci.yml) runs the automated gates and release-policy check on Linux with Node 22 and 24; consult the release commit's checks for its result.

| Area | Coverage |
| --- | --- |
| API contracts | 580 official operations, 210 JSON request bodies, 474 handler operation associations, and 27 unsupported tools excluded. Every request schema has valid-fixture and required-field removal checks; dispatch tests cover corrected high-risk adapters. |
| Client | OAuth/resource separation, concurrent authentication, stale-token recovery, bounded concurrency/queueing, cancellation, 429 cooldowns, and no automatic replay of ambiguous writes. Sent POST/PUT/PATCH/DELETE timeout, network, 500/503, and cancellation failures pair `outcomeUnknown: true` with `retryable: false`; pre-dispatch auth/queue failures do not imply a sent mutation. The pinned report-data POST keeps read semantics and API metadata through report execution. |
| Analytics | Complete pagination, inconsistent/missing fields, failed-page handling, cache isolation/expiry, independent callers, DST boundaries, and name/filter/metric semantics. |
| MCP interface | SDK discovery/execution, profiles/allowlists, structured output, response budgets and retrieval, authenticated identity/origin policies, and transport/session lifecycle. |
| Support policy | Default discovery contains 261 ServiceTitan-facing read tools plus three built-in system tools (264 total). All 194 mutations are labeled experimental and require explicit configuration; readonly takes priority. Missing opt-in fails startup in all four entrypoints. Embedded configurations and execution after configuration changes are checked, and fixture writes/deletes still require the configured confirmations and emit audits. |
| Packaging | Fresh isolated installed consumer, command entrypoints, library exports, declarations, dummy-credential wire calls, and npm/Docker credential-file exclusion canaries. |

Whole-source coverage is 59.43% statements, 70.17% branches, 58.65% functions, and 59.00% lines. Client line coverage is 96.90%, registry 94.19%, readiness 100%, and HTTP policy 100%. Coverage does not establish that every domain handler or write adapter has been executed.

Review regressions reproduce the original contradictory retry flag and false report-write classification with real Axios adapters. They cover both report consumers, exact operation matching, all four mutation methods, pre-dispatch failures, and preservation of safe flags in both JSON representations at the minimum 256-character response budget.

Diagnostic regressions cover configured-secret canaries, nested errors, unsafe serializers, fallback paths, query-free SSE logging, and suppression of untrusted configuration values in all four built entrypoints' startup errors. Packaging tests use synthetic files with the real npm and Docker CLIs; the Docker test uses a loopback mock engine rather than a running daemon. The final locked-dependency audit reported zero known vulnerabilities.

A fresh 148-file npm archive installed in an isolated consumer. Both supported runtimes passed five-profile discovery, the experimental opt-in/labeling/confirmation checks, package imports, and actual stdio CLI calls with dummy credentials and zero upstream requests. A TypeScript consumer also checked the installed declarations and public experimental-policy error export.

## Live validation boundary

The built `3.0.0` stdio refresh at `786f15b` on September 5, 2026 UTC passed authentication, health, representative reads for CRM, dispatch, settings, and reporting, and all 18 configured report definitions. Discovery contained only read operations. The check executed no report data requests or business mutations and retained no customer records.

The subsequent PR review fixes were validated using deterministic fault adapters and local package tests; this live refresh was not repeated after those changes. No live timeout or failed mutation was induced.

Earlier validation of the initial candidate exercised additional representative modules, repaired read tools, and report behavior for the same production company. Labor aggregates matched an independent sum of all paginated API source rows; missing gross-pay data remained null. The corrected CSR date filter succeeded. Those amount/filter results were not repeated in the final readiness refresh. Scheduling Pro previously returned HTTP 403; its scope, entitlement, or policy cause remains unresolved and was not retested.

No live business mutation was tested. Integration write behavior and cleanup, dashboard parity, all possible scopes, and an independent second company remain unverified. Synthetic company fixtures demonstrate isolation in their tested cases. Every additional installation still needs its own scopes/modules, readiness, report definitions, and representative result validation. Live write/cleanup validation would be required to expand stable support to mutations; independent-company live evidence would be required to make that certification claim.

Public validation material retains only aggregate statuses, counts, timings, and sanitized failure classifications. Credential files, secrets, tokens, tenant identifiers, local paths, and raw customer responses are not release evidence. Known credential/JWT scans found no matches in the current tracked files, final package, or new validation logs; earlier published-history, PR, and CI checks were also clean. Temporary output remains access-restricted and must be removed when no longer required. ServiceTitan's [API Terms](https://www.servicetitan.com/legal/api-terms) govern credential security and customer-content handling.

The [benchmark summary](../BENCHMARKS.md) documents the methodology and available synthetic latency/load, caching, short-soak, and retained-memory evidence. The acceptance record distinguishes the full earlier runtime measurements from the focused client-load and report-cache refresh after the review fixes. These do not establish production capacity or a latency SLA.

## Revalidate before publication

Run the commands in [CONTRIBUTING.md](../../CONTRIBUTING.md), regenerate the tool catalog, and inspect the package contents. Run `node scripts/package-smoke.mjs /path/to/isolated/consumer` after installing the packed package in that consumer. Keep readiness checks bounded and read-only; experimental writes require separate authorization and disposable integration fixtures.

The fixed `readonly-v1` policy requires maintenance, contracts, analytics, interface, runtime-matrix, package-smoke, bounded read-only production, and latency/load evidence. The checker cannot scope these core gates out. Integration and independent-company checks must either have verified passing evidence or an explicit `scoped_out` status with a reason and the broader support commitment they would validate. Expanding the support policy requires a reviewed code change and supporting evidence.

Update the acceptance record only for verified results. `node scripts/check-release.mjs --fingerprint` computes the source fingerprint, including source, tests, scripts, workflows, benchmark harnesses, exclusion policies, and maintained support/validation documentation. Recording a fingerprint alone is not validation. `npm run release:check`, CI, the npm prepublication hook, and the tag-triggered release workflow enforce the policy, required statuses, version, and fingerprint. The checker validates the record's structure and current inputs; reviewers remain responsible for the truth of the evidence.

Contract provenance and regeneration instructions are in [docs/contracts](../contracts/README.md). API definitions are pinned so contributors can reproduce contract checks without credentials or live API access.
