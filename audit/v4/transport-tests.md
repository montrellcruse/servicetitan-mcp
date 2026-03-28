# Transport and Tests Audit v4

## Scope

Reviewed:

- `src/index.ts`
- `src/sse.ts`
- `src/streamable-http.ts`
- `src/client.ts`
- `src/domains/loader.ts`
- all files under `tests/`

Test run:

```bash
npm test
```

Result: `18` test files passed, `249` tests passed.

## Findings

### 1. High: active Streamable HTTP notification sessions are reaped as "idle"

`src/streamable-http.ts` explicitly exposes `GET /mcp` as the SSE channel for server-initiated notifications (`src/streamable-http.ts:12-15`), but session expiry is based only on `lastSeen` (`src/streamable-http.ts:35-36`, `src/streamable-http.ts:226-239`). That timestamp is set at initialization and refreshed only when a later request arrives with an existing session ID (`src/streamable-http.ts:313-321`, `src/streamable-http.ts:351-359`).

An open `GET /mcp` stream does not refresh `lastSeen`, so a client that keeps a valid notification stream open but sends no other traffic will be force-closed after 30 minutes. That is a transport lifecycle bug, not just a test gap.

Coverage is missing exactly where this fails: `tests/streamable-http.test.ts` never exercises `GET /mcp`, never advances the reaper timer, and never asserts behavior for a long-lived notification stream (`tests/streamable-http.test.ts:10-15`, `tests/streamable-http.test.ts:298-499`).

### 2. Medium: Streamable HTTP tests only validate a permissive mock, not the real transport contract

`src/streamable-http.ts` delegates existing and newly-created sessions to `StreamableHTTPServerTransport.handleRequest(...)` (`src/streamable-http.ts:320-321`, `src/streamable-http.ts:371-372`), but `tests/streamable-http.test.ts` replaces that transport with a simplified mock that returns `200` for any non-initialize request and does not model the real lifecycle surface (`tests/streamable-http.test.ts:31-84`, `tests/streamable-http.test.ts:234-235`).

As a result, the suite does not verify:

- `GET /mcp` standalone SSE setup
- `DELETE /mcp` explicit session teardown
- protocol/header negotiation on real transport requests
- idle-timeout or shutdown cleanup behavior

Given this entrypoint is the session manager, the current suite is good at routing smoke tests but weak at protocol-accurate lifecycle coverage.

### 3. Medium: critical client and startup paths in scope remain effectively unverified

`src/client.ts` contains the auth/error-handling paths that remote transports depend on in production: 401 refresh-and-retry, 429 retry-after backoff, token request deduplication, invalid token response handling, and retry-after parsing (`src/client.ts:395-520`). `tests/client.test.ts` covers environment selection, token caching/expiry, path rewriting, auth headers, error sanitization, and route-table drift detection, but it does not exercise any of those retry/race paths (`tests/client.test.ts:149-320`).

Startup coverage is also absent for the files explicitly in this audit scope:

- `src/index.ts` has no direct tests for stdio startup, health tool registration, or fatal startup handling (`src/index.ts:12-87`)
- `src/domains/loader.ts` has no direct tests for dynamic import behavior, missing-module handling, or bad-export handling (`src/domains/loader.ts:7-48`)
- both transport suites stub `loadDomainModules` instead of executing the real loader (`tests/sse.test.ts:255-256`, `tests/streamable-http.test.ts:264-265`)

That leaves the runtime bootstrap path largely unverified even though it is the first thing every transport depends on.

## Verdict

Not a clean bill.

The main transport concern is the Streamable HTTP idle reaper closing still-connected notification sessions. The broader test suite also leaves the real Streamable HTTP lifecycle, client retry behavior, and startup/domain-loading path under-verified.
