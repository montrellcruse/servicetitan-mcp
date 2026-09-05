# Architecture

ServiceTitan MCP is a TypeScript MCP server that exposes documented ServiceTitan operations and composite analytics through stdio, Streamable HTTP, and a legacy SSE entrypoint.

## Runtime flow

```text
environment -> loadConfig -> createMcpServer -> ToolRegistry -> domain loaders
                                      |
                                      +-> ServiceTitanClient -> official route resolver -> ServiceTitan API
                                      |
                                      +-> stdio / Streamable HTTP / legacy SSE transport
```

`src/server.ts` is the shared composition boundary. It creates the API client, registry, system tools, and domain tools. Embedders can import `createMcpServer`, `loadConfig`, `ServiceTitanClient`, and `checkReadiness` from the package root.

## Transports

- `src/index.ts` serves MCP over stdio.
- `src/streamable-http.ts` serves the current remote protocol at `POST`, `GET`, and `DELETE /mcp`. `GET /health` is an unauthenticated process-status endpoint. `/sse` returns `410 Gone` with migration guidance.
- `src/sse.ts` retains the legacy `GET /sse` and `POST /messages` transport for existing clients.

Both HTTP entrypoints require `ST_MCP_API_KEY`. They use constant-time credential comparison, validate request origins and hosts, cap request bodies, and attach a server-controlled principal to the MCP request context. Streamable HTTP creates a separate MCP server per session, caps active sessions with `ST_MAX_SESSIONS`, and reaps idle sessions. `ST_MCP_CLIENT_ID` names the authenticated shared credential for `ST_ALLOWED_CALLERS`; caller-supplied headers do not establish identity.

## Configuration

`src/config.ts` validates environment configuration. Required ServiceTitan values are `ST_CLIENT_ID`, `ST_CLIENT_SECRET`, `ST_APP_KEY`, and `ST_TENANT_ID`.

The main optional controls are:

- `ST_ENVIRONMENT`: `integration` by default; `production` is explicit.
- `ST_READONLY`: `true` by default. Mutation tools are omitted from discovery while enabled.
- `ST_EXPERIMENTAL_WRITES`: `false` by default. Mutation adapters require this and `ST_READONLY=false`; they are outside stable v3 support.
- `ST_CONFIRM_WRITES`: requires `_confirmed: true` for visible write tools when enabled.
- `ST_TOOL_PROFILE`: `full`, `crm`, `dispatch`, or `analytics`.
- `ST_TOOLS` and `ST_DOMAINS`: explicit tool and domain selection.
- `ST_REPORT_BINDINGS`: company-specific logical report bindings for intelligence tools.
- `ST_TIMEZONE`: tenant timezone used for date boundaries and rendered timestamps.
- `ST_MAX_RESPONSE_CHARS`: response budget before results move to bounded result storage.
- `ST_MAX_CONCURRENT_TOOLS` and `ST_TOOL_TIMEOUT_MS`: server execution limits.
- `ST_MAX_SESSIONS`, `ST_CORS_ORIGIN`, `ST_ALLOWED_CALLERS`, and `ST_MCP_CLIENT_ID`: remote access controls.

`PORT` or `ST_MCP_PORT` selects the HTTP listen port; `ST_MCP_API_KEY` is required by the HTTP entrypoints.

## ServiceTitan client

`src/client.ts` uses OAuth 2.0 client credentials with the matching integration or production auth and API hosts. Tokens are cached with an expiry buffer, and simultaneous token consumers share one acquisition. Resource requests use an eight-active request gate by default with a bounded queue.

The client performs a single controlled refresh after a 401 and a single retry after a 429, honoring `Retry-After` within the configured retry-delay budget. Cancellation, timeouts, queue failures, trace identifiers, retryability, and uncertain mutation outcomes are represented by sanitized `ServiceTitanApiError` metadata. Completed requests can be observed through `onRequestComplete` without exposing credentials or response bodies.

Sent mutations with an uncertain outcome return `outcomeUnknown: true` and `retryable: false`; callers must verify the upstream result before another attempt. The MCP error envelope preserves these flags even at its minimum size budget. The exact pinned `ReportCategoryReports_GetData` POST is classified as a read, using its official operation identity and path rather than caller metadata. Report errors retain API metadata when the executor adds page context. These classifications do not add automatic timeout or 5xx retries.

## Pinned API contracts and routing

ServiceTitan paths are resolved by `src/contracts/resolve-route.ts` against the generated official operation manifest. The pinned OpenAPI archive and its URL/hash manifest live in `docs/contracts/`. Generation produces `official-operations.generated.ts`, containing methods, full paths, schemas, and scopes, and `official-routes.generated.ts`, used for path resolution.

Resolution validates both method and final path and fails closed for unknown or ambiguous operations. Explicit module-qualified paths are also checked against the pinned contracts. `src/contracts/request-schema.ts` converts official request JSON Schema into Zod schemas for operation-bound mutation bodies. `src/contracts/unsupported-tools.ts` records legacy tool names without an operation in the pinned public documents; the registry does not expose them.

Run `npm run contracts:generate` only after deliberately replacing the pinned inputs, then run `npm run contracts:check`.

## Domains and registration

`src/domains/loader.ts` loads 15 domain modules explicitly. Each tool supplies a stable name, domain, operation classification, description, Zod input shape, and handler to `ToolRegistry.register()`.

The registry applies unsupported-operation exclusion, readonly mode, experimental-write opt-in, profiles, explicit tool selection, and domain filters before MCP registration. Readonly discovery contains 261 ServiceTitan-facing read tools backed by pinned API contracts plus three built-in system tools. This 264-tool surface is eligible for stable `readonly-v1` support subject to each company's scopes/modules and readiness/report validation, with a separate runtime/configuration per company; live checks sampled representative reads. The 194 mutation adapters require both `ST_READONLY=false` and `ST_EXPERIMENTAL_WRITES=true` and remain experimental. For enabled mutations, deletes require `confirm: true`; writes can require `_confirmed: true`. Confirmation is an accidental-action safeguard and does not replace transport authorization.

All calls share a bounded concurrency guard and deadline. After a write or delete handler executes, the registry makes one best-effort audit attempt with sensitive values redacted. Audit-entry construction and sink calls have a separate failure boundary: synchronous exceptions and rejected promises leave the original result intact, and pending audit promises are not awaited. Failures trigger a fixed diagnostic without customer data or exception text; errors from that diagnostic sink are also contained. Audit delivery through custom sinks is not guaranteed. MCP annotations derive from the operation classification; `readOnlyHint` cannot be overridden.

The built-in logger also sanitizes diagnostic messages and nested data at the final stderr sink, using common credential/contact patterns and the secrets explicitly supplied by its runtime. Serialization failures use a sanitized fallback. This does not anonymize arbitrary business output or replace access controls on client transcripts and log storage.

## Responses and large results

`src/utils.ts` emits the same payload as text and `structuredContent`, converts recognized UTC timestamps to the configured display timezone, and preserves sanitized ServiceTitan error metadata. When a response exceeds `ST_MAX_RESPONSE_CHARS`, the server attempts to place the complete payload in a five-minute session-local result store for bounded `st_result_read` retrieval. If storage or even its retrieval metadata cannot fit the configured limits, it returns an explicit `RESPONSE_TOO_LARGE` error without partial records. Closing the server clears the store.

For completed mutations, `RESPONSE_TOO_LARGE` and `INVALID_RESPONSE` describe a delivery failure: their error object includes `mutationCompleted: true` and `retryable: false`, even at the minimum response budget. Stored mutation results carry the same flags beside their retrieval handle. The registry sets mutation context only around the authorized handler, after confirmations. A private weak reference map tracks delivery failures for audit classification; an upstream or custom error code cannot establish successful execution. Expired handles never advise replaying the original mutation.

Domain adapters otherwise preserve the ServiceTitan response contract. Pagination helpers remove undefined values before serialization.

## Intelligence and caching

The intelligence domain combines reporting and reference endpoints into ten business-facing tools. Each logical report key has a configured default category and report ID that `ST_REPORT_BINDINGS` can override for a company. Readiness fetches those selected report definitions and validates their fields and parameters without executing report data; it does not discover replacement report IDs automatically.

`src/cache.ts` provides complete-result TTL caching, request deduplication, pagination across reference datasets, and per-client isolation. A cache entry becomes reusable only after the full upstream operation succeeds, so partial report pages are not cached as complete results. Intelligence handlers retain partial-failure warnings where a composite answer can still be useful.

`st_health_check` verifies authentication and a representative tenant read. `st_readiness_check` adds module and optional report-definition compatibility checks. Neither tool certifies write scopes, live mutations, or business-metric parity.
