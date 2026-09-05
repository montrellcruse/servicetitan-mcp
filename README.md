# ServiceTitan MCP Server

[![CI](https://github.com/montrellcruse/servicetitan-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/montrellcruse/servicetitan-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@rowvyn/servicetitan-mcp.svg)](https://www.npmjs.com/package/@rowvyn/servicetitan-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A ServiceTitan MCP package for independently configured companies. V3 uses pinned official API contracts, readonly discovery, configurable report bindings, and explicit data-completeness checks.

Built by [Rowvyn](https://rowvyn.com). This branch prepares **3.0.0-rc.1**. Publication is gated by the [acceptance record](docs/releases/v3-acceptance.json); it is not a declaration that every live release gate has passed. Read the [v3 migration guide](docs/MIGRATION-v3.md) before upgrading.

## Run from source

Use Node 22 or 24. Install the locked dependencies, build, and put credentials in an ignored `.env` copied from `.env.example`:

```sh
npm ci
npm run build
node --env-file=.env build/readiness-cli.js
node --env-file=.env build/index.js
```

Required values are `ST_CLIENT_ID`, `ST_CLIENT_SECRET`, `ST_APP_KEY`, and `ST_TENANT_ID`. Select `ST_ENVIRONMENT=production` for a live company; the default is `integration`. Set the company's IANA timezone explicitly, such as `America/New_York`.

Configure an MCP host to run `node` with `--env-file=/absolute/path/.env` and `/absolute/path/build/index.js`. Stdio reserves stdout for MCP protocol traffic. Logs and mutation audits go to stderr.

The package also provides `servicetitan-mcp`, `servicetitan-mcp-http`, `servicetitan-mcp-sse`, and `servicetitan-mcp-check` command entrypoints. The published stable npm version may remain v2 while v3 acceptance gates are pending.

## Choose the tool surface

The [generated catalog](TOOLS.md) lists 458 supported tools, including 264 reads. Discovery is filtered by configuration:

| Setting | Behavior |
| --- | --- |
| `ST_READONLY=true` | Default; mutating tools are absent from discovery and cannot execute. |
| `ST_TOOL_PROFILE=full` | All supported domains, still subject to readonly and other filters. |
| `ST_TOOL_PROFILE=crm` | CRM tools. |
| `ST_TOOL_PROFILE=dispatch` | Dispatch, scheduling, people, settings. |
| `ST_TOOL_PROFILE=analytics` | Intelligence, reporting, settings. |
| `ST_DOMAINS=crm,reporting` | Intersects the profile with selected domains. |
| `ST_TOOLS=crm_customers_get,...` | Exact tool-name allowlist; unknown or unavailable selections fail startup. |

System health, readiness, and result-retrieval tools remain accessible through the same authorization checks. Profiles do not grant upstream ServiceTitan scopes. Undocumented operations removed in v3 remain unavailable even in the full profile.

To enable writes, set `ST_READONLY=false`. `ST_CONFIRM_WRITES=true` requires `_confirmed:true` for writes; deletes require `confirm:true`. These are safeguards against accidental changes, not independent human authorization. Uncertain write outcomes explicitly instruct checking ServiceTitan before retrying; the client does not blindly retry timeouts or 5xx writes.

## Readiness and report compatibility

`st_readiness_check` and the check CLI validate authentication, representative enabled-module reads, and configured report definitions. They return field/parameter metadata and definition fingerprints, not customer records. Missing scopes, missing reports, and incompatible fields are actionable failures. Representative read access does not certify every operation, write scope, or KPI amount.

Bind a company's reports with JSON in `ST_REPORT_BINDINGS`:

```dotenv
ST_REPORT_BINDINGS={"166":{"category":"accounting","reportId":900166}}
```

The keys are the logical report IDs used by analytics; the values select this company's category and actual report ID. Required fields are validated by name and reordered before calculations. Default Report 166 provides hours but no gross pay; labor costs and hourly rates are `null` with explicit availability metadata. A compatible configured report that includes `GrossPay` can supply those metrics.

Analytics follows pagination and rejects missing/inconsistent required data. Optional feed failures remain in `_warnings`. Review warnings and completeness metadata before treating an answer as a complete business result. Report execution is scheduled per report and API client, with a 65-second interval between starts; expensive multi-page reports can take minutes. Set an appropriate host request timeout and use cancellation when abandoning a query. Separate server processes still share ServiceTitan's upstream report limit.

Metrics have explicit meanings. Period revenue minus payments is no longer labeled outstanding A/R; membership period counts are not labeled cohort retention; independent booked-call and booking counts are not treated as one conversion cohort. Dashboard parity and a second live company remain separate acceptance checks.

## Structured and bounded results

Successful tools provide the same JSON in `structuredContent` and the text content. Arrays/scalars are wrapped as `{data:...}`. Semantic fields, warnings, continuations, names, and precision are preserved. Timestamps may be rendered in the configured timezone without changing the instant; keys explicitly labeled UTC remain UTC.

`ST_MAX_RESPONSE_CHARS` defaults to 100,000 and covers the final serialized tool envelope, including both representations. Large results can return an opaque handle for `st_result_read`: start at offset 0, concatenate each text chunk in `nextOffset` order, and parse the assembled JSON. Stored results belong to one server/session, expire after five minutes, and are bounded to four entries and 4 MB total. Restarting or closing the session removes them. A full store may evict older entries.

If the result or retrieval metadata cannot fit configured storage/budget limits, the tool returns an explicit delivery error with source-pagination guidance. It never passes a cut JSON preview off as complete data. The minimum accepted response budget is 256 characters; useful result handles require a larger budget such as 1,024 or more. A delivery failure after a successful mutation is recorded separately in its audit and does not imply that the mutation should be retried.

## Remote transports

```sh
node --env-file=.env build/streamable-http.js
```

Set a strong `ST_MCP_API_KEY`; send it in `x-api-key` or a Bearer Authorization header. The server binds to loopback by default. Set `ST_MCP_HOST=0.0.0.0` only when needed, such as a container behind an HTTPS proxy. Streamable HTTP uses `/mcp`; `/health` is an unauthenticated liveness endpoint.

Requests with a browser Origin require an exact `ST_CORS_ORIGIN` match. Without a configured origin, native clients without Origin are allowed and browser origins are rejected. Wildcards are not accepted.

`ST_ALLOWED_CALLERS` uses authenticated SDK identity. Request `_meta` and arbitrary forwarded identity headers are ignored. With the built-in shared API key, the authenticated principal is `ST_MCP_CLIENT_ID` (default `api-key`); this is one credential identity, not per-user identity. Embedders needing user identities must provide validated SDK `authInfo` through an authenticated transport.

HTTP sessions are bounded by `ST_MAX_SESSIONS` (32 default). Registry tool concurrency defaults to 16; ordinary API requests have a bounded queue and concurrency. Idle sessions are reaped after 30 minutes; active requests/streams are tracked. Session state and result handles are process-local, so multi-instance deployments need sticky routing. Legacy SSE is a single-client compatibility entrypoint: a new SSE connection replaces the prior one. Prefer Streamable HTTP.

Mutation audit events are emitted even when diagnostic log level is `error`; contact values, credentials, and free text are redacted. Configure durable stderr collection if durable audit retention is required.

## Embed one company or separate company runtimes

The import entrypoint has no transport startup side effects:

```js
import { createMcpServer, loadConfig } from '@rowvyn/servicetitan-mcp';
const { server } = await createMcpServer(loadConfig(companyEnvironment));
await server.connect(yourTransport);
```

Create a separate client/runtime for each company. Caches and report queues use client identity; request timezone/budget/cancellation are scoped to the call. Sharing a ServiceTitan client across companies is unsupported. The package includes TypeScript declarations.

## Development and release gates

```sh
npm run contracts:check
npm run typecheck
npm run lint
npm run test:coverage
npm run test:wire
npm run docs:tools
npm pack --dry-run
npm run release:check
```

The contract generator uses the [pinned official September 4, 2026 snapshot](docs/contracts/README.md); upstream changes require a reviewed manifest regeneration. Contract tests cover resolved paths and request payloads. The normal suite includes auth/retry, paging, cancellation, DST, schema/metric, configuration isolation, transport and response-budget regressions. Built-process tests use dummy credentials and do not execute ServiceTitan business reads or writes.

CI tests Node 22 and 24. Release publication additionally requires a current source fingerprint and passed live integration/second-company gates; pending gates deliberately fail `release:check`. Releases keep npm Trusted Publishing and publish prereleases to `next`, stable versions to `latest`.

See the [validation summary](docs/releases/VALIDATION-v3.md) for coverage and remaining acceptance gates, and the [benchmark results](docs/BENCHMARKS.md) and [reproduction instructions](benchmarks/README.md) for latency, load, caching, and memory measurements.

Official sources: [ServiceTitan API catalog](https://developer.servicetitan.io/api/docs/apis), [Reporting API](https://developer.servicetitan.io/docs/apis/tenant-reporting-v2), and [API rate limits](https://help.servicetitan.com/v1/docs/default-api-rate-limitsfor-regular-apis-and-reporting-apis).
