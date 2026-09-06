# Contributing to ServiceTitan MCP

## Setup

Use Node.js 22 or newer and the locked npm dependencies.

```sh
git clone https://github.com/montrellcruse/servicetitan-mcp.git
cd servicetitan-mcp
npm ci
cp .env.example .env
chmod 600 .env
```

Credentials are needed only for explicitly authorized integration or production checks. Unit, contract, wire, and fixture tests must not depend on `.env` or make live ServiceTitan calls.

Keep `.env` ignored and permission-restricted. Never include credentials, access tokens, tenant identifiers, customer records, local machine paths, or raw live responses in commits, issues, pull requests, snapshots, or test fixtures. Use dummy credentials with adapters for automated tests. If a live check is explicitly authorized, prefer integration, use the narrowest scopes and smallest bounded read or disposable fixture, disable redirects, stop on unexpected responses, and retain only sanitized aggregate evidence. Remove temporary local output after review. Follow ServiceTitan's [first-call environment guidance](https://developer.servicetitan.io/docs/get-going-first-api-call), [customer credential guidance](https://developer.servicetitan.io/docs/faqs-customers), and [API Terms](https://www.servicetitan.com/legal/api-terms).

## Development commands

```sh
npm run typecheck
npm run lint
npm test
npm run contracts:check
npm run test:wire
npm run test:packaging
npm run build
```

Use `npm start` for stdio and `npm run start:streamable-http` for remote MCP. `npm run start:sse` exists for legacy clients. `npm run release:check` checks the package version, acceptance-gate record, and source fingerprint. `npm run docs:tools` rebuilds the package and regenerates the public tool catalog.

## Adding or changing an API tool

1. Locate the operation in the pinned official sources under `docs/contracts/`.
2. Add the adapter to the appropriate `src/domains/<domain>/` module and register it through `ToolRegistry`.
3. Use the documented HTTP method and an operation-resolvable path. Do not add fallback routes for undocumented operations.
4. Model path and query inputs with Zod. For request bodies, use the operation-bound helpers in `src/contracts/request-schema.ts` where practical so required fields and enums remain aligned with the official schema.
5. Return results with `toolResult()` and pass caught errors directly to `toolError(error)` so sanitized API metadata is retained.
6. Add a focused domain test that captures the final client method, path, query, and body. Add contract tests when changing shared resolution or schema conversion.
7. Run `npm run contracts:check`, typecheck, lint, and the relevant test files.

Tool names follow `<domain>_<resource>_<action>`. Files use kebab-case, functions and variables use camelCase, and types use PascalCase. Every tool needs an accurate description and operation classification. Mutation annotations may be narrowed only when ServiceTitan behavior supports it; `readOnlyHint` always comes from the operation.

## Writing tool definitions

Write for an agent choosing among the actual tools returned by `tools/list`. Lead with the concrete action, resource, and returned record type when ambiguous. Explain the closest alternative and when to use it. Add non-obvious input relationships and behavior such as one-page results, continuation tokens, cache freshness, report scheduling, or incomplete optional feeds only when supported by the pinned API operation and the handler.

Use the six Glama TDQS dimensions as review questions: purpose, usage guidance, behavior, parameter meaning, conciseness, and sufficient context. A few useful sentences usually suffice; examples should resolve an actual invocation ambiguity. Keep constraints and formats in schema descriptions. Avoid repeating safety annotations or adding a uniform warning paragraph to every tool. Never claim automatic pagination, dashboard parity, guaranteed timing, or support for every company's modules without evidence.

For equivalent endpoints, name the equivalent tool and explain that fetching both duplicates the same feed. Consider that profiles or allowlists can expose only one name. API versions, single-resource versus cross-resource lists, and incremental exports can have different contracts even when names are similar. Compare resolved routes, inputs, scopes, and returned data before calling tools equivalent.

Descriptions remain at their registration sites; regenerate `TOOLS.md` with `npm run docs:tools`. The export factory inventory in `scripts/check-contracts.mjs` requires literal arguments on one line. If registration syntax changes, update its parser and prove that factory operations remain covered.

`npm run discovery:check` compares real SDK discovery with the v3.0.0 contract fixture at `tests/fixtures/discovery-v3.0.0.json` across default, focused, filtered, and experimental configurations. It uses a client that rejects every upstream request and permits description changes while checking tool names, profile membership, validation constraints, and annotations. Build first with `npm run build`. Update the fixture only when intentionally changing the public tool contract, with the corresponding compatibility review.

Readonly mode omits mutation tools from MCP discovery. Mutations are experimental outside the stable `readonly-v1` support policy and require both `ST_READONLY=false` and `ST_EXPERIMENTAL_WRITES=true`. Test mutation adapters with fake clients or in-memory MCP unless a separate, explicit live-write authorization and cleanup plan exists.

The `readonly-v1` release policy requires maintenance, contract, analytics, interface, runtime-matrix, package-smoke, bounded readonly production, and latency/load evidence. If integration or independent-company credentials are unavailable, record those gates as scoped out with their limits; never mark an unexecuted gate passed.

## Changing pinned contracts

The archive in `docs/contracts/` is an immutable dated snapshot. Replace it only when intentionally adopting a newer official ServiceTitan snapshot, and update `sources.json` with exact public URLs and hashes.

```sh
npm run contracts:generate
npm run contracts:check
```

Review generated operation and route diffs. Document removed, renamed, or newly unsupported tools as migration changes rather than routing them to a guessed endpoint.

## Intelligence tools

Intelligence tools live in `src/domains/intelligence/`. Define logical report contracts deliberately and allow company-specific category/report-ID overrides through `ST_REPORT_BINDINGS`; readiness validates the selected definitions but does not discover replacements. Cache only complete results, preserve useful partial-failure warnings, and use the registry timezone for date boundaries. Tests must cover row semantics, pagination, cache isolation, and required report parameters with fake clients.

## Pull requests

Use conventional commit prefixes such as `feat:`, `fix:`, `docs:`, `test:`, and `refactor:`. Include the concrete behavior change, contract source, migration impact, and validation commands. Run `npm run docs:tools` when the supported tool catalog changes.

Report security issues through the private channel in `SECURITY.md`; do not open a public issue for a vulnerability.

## Publishing a release

1. Finalize the package version, dated changelog entry, migration guidance, and support policy. Check all relative links in the packed Markdown and keep raw live evidence and credential files excluded.
2. Run the release preflight and installed-package smoke tests, record only verified acceptance evidence, refresh its source fingerprint, and require the Node 22 and 24 jobs plus aggregate `ci` check to pass on the release commit. Obtain the required review and merge through the protected branch.
3. When publication is authorized, push a tag matching the package version (for example, `v3.0.0`) on that reviewed commit. The tag-triggered Release workflow rechecks acceptance and tests, then publishes npm through Trusted Publishing. Stable versions use `latest`; prerelease versions use `next`. Pushing the tag is a publication action.
4. Verify the successful workflow and the exact npm version. Create the GitHub Release manually from the existing tag using the versioned changelog notes. The workflow publishes npm but does not create a GitHub Release; do not create another tag or republish the package for this step.
