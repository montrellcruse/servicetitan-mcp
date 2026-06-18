# Completion Report

Date: 2026-06-17

## Result

The remaining esbuild audit repair is complete.

- PR `#8` upgraded the direct `esbuild` dependency to `^0.28.1`.
- PR `#8` upgraded `vitest` and `@vitest/coverage-v8` to `^4.1.9`, moving the transitive Vite path to Vite 8.
- Vite 8 no longer carries the vulnerable nested esbuild path; `npm audit` is clean.
- PR `#8` merged to `main` as `3f1c9bd`.
- PR CI and post-merge `main` CI passed.

## Verification

Local checks passed before merge:

- `npm ci`
- `npm audit`
- `npm run typecheck`
- `npm run lint`
- `npm test` — 20 files / 273 tests
- `npm run build`
- `npm run docs:tools`
- `npm pack --dry-run`
- `npm run prepublishOnly`
- `git diff --check`

GitHub checks passed:

- PR CI: run `27742462783`
- Post-merge main CI: run `27742510351`

## Boundaries

- No package version bump.
- No tag.
- No npm publish.
- No release workflow.
- No deploy.
- No live ServiceTitan API call.
- npm registry still reports `@rowvyn/servicetitan-mcp@2.6.0` / `latest=2.6.0`.

## Follow-Up

None for this audit item.
