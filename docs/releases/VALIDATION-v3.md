# V3 release-candidate validation

Version `3.0.0-rc.1` is a candidate for review. Publication remains blocked by the integration-environment and second-company live gates in [v3-acceptance.json](v3-acceptance.json). A passed local suite does not waive those gates.

## Automated coverage

The local matrix uses Node 22.23.2 and 24.20.0 on macOS arm64. Each runtime passes 441 tests across 37 files, five built-process MCP wire tests, and two packaging exclusion tests. Contract checks, TypeScript checking, lint, builds, package installation, ESM imports, and declaration consumption also pass. [GitHub CI](https://github.com/montrellcruse/servicetitan-mcp/actions/workflows/ci.yml) runs the same automated gates on Linux with Node 22 and 24; consult the candidate commit's checks for its result.

| Area | Coverage |
| --- | --- |
| API contracts | 580 official operations, 210 JSON request bodies, 474 handler operation associations, and 27 unsupported tools excluded. Every request schema has valid-fixture and required-field removal checks; dispatch tests cover corrected high-risk adapters. |
| Client | OAuth/resource separation, concurrent authentication, stale-token recovery, bounded concurrency/queueing, cancellation, 429 cooldowns, and no automatic replay of ambiguous writes. |
| Analytics | Complete pagination, inconsistent/missing fields, failed-page handling, cache isolation/expiry, independent callers, DST boundaries, and name/filter/metric semantics. |
| MCP interface | SDK discovery/execution, profiles/allowlists, structured output, response budgets and retrieval, authenticated identity/origin policies, and transport/session lifecycle. |
| Packaging | Isolated installed consumer, command entrypoints, library exports, declarations, dummy-credential wire calls, and npm/Docker credential-file exclusion canaries. |

Whole-source coverage is 59.01% statements, 69.79% branches, 58.10% functions, and 58.59% lines. Client line coverage is 95.28%, registry 93.33%, readiness 100%, and HTTP policy 100%. Coverage does not establish that every domain handler or write adapter has been executed.

The diagnostic-redaction and packaging follow-up has fresh local regression coverage, including configured-secret canaries, nested errors, unsafe serializers, fallback paths, and query-free SSE logging. Packaging tests use synthetic files with the real npm and Docker CLIs; the Docker test uses a loopback mock engine rather than a running daemon. The locked-dependency audit reported zero known vulnerabilities at validation time.

## Live validation boundary

Before the diagnostic-redaction follow-up, bounded readonly validation for one production company exercised representative modules, report definitions, repaired read tools, and a built stdio call. Labor aggregates matched an independent sum of all paginated API source rows; missing gross-pay data remained null. The corrected CSR date filter succeeded. Scheduling Pro returned HTTP 403; its scope, entitlement, or policy cause is unresolved.

No live business mutation was tested. Dashboard parity, integration-environment write behavior and cleanup, all possible scopes, and an independent second company remain unverified. Synthetic company fixtures prove configuration isolation within their tested cases; they do not certify live compatibility for every company.

Public validation material retains aggregate statuses, counts, timings, and sanitized failure classifications. Credential files, secrets, tokens, tenant identifiers, local paths, and raw customer responses are not release evidence. Temporary live output must remain access-restricted and be removed when no longer required. ServiceTitan's [API Terms](https://www.servicetitan.com/legal/api-terms) govern credential security and customer-content handling.

The [benchmark summary](../BENCHMARKS.md) documents synthetic latency/load, caching, short soaks, and retained-memory results. These measurements do not establish production capacity or a latency SLA.

## Revalidate before publication

Run the commands in [CONTRIBUTING.md](../../CONTRIBUTING.md), regenerate the tool catalog, and inspect the package contents. Run `node scripts/package-smoke.mjs /path/to/isolated/consumer` after installing the packed package in that consumer. Complete the missing live gates with scoped disposable integration fixtures and an independently configured company.

Update the acceptance record only for verified results. `node scripts/check-release.mjs --fingerprint` computes the source fingerprint, including Git/Docker exclusion rules and security guidance; recording it alone is not validation. `npm run release:check`, the npm prepublication hook, and the tag-triggered release workflow reject a version/fingerprint mismatch or any pending required gate.

Contract provenance and regeneration instructions are in [docs/contracts](../contracts/README.md). API definitions are pinned so contributors can reproduce contract checks without credentials or live API access.
