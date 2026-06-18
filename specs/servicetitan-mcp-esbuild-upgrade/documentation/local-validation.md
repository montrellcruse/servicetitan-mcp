# Local Validation

Date: 2026-06-17

## Dependency Result

- Direct `esbuild`: `0.28.1`
- Test-toolchain `vitest`: `4.1.9`
- Test-toolchain `@vitest/coverage-v8`: `4.1.9`
- Transitive `vite`: `8.0.16`
- `npm ls esbuild vite vitest @vitest/coverage-v8` shows one deduped `esbuild@0.28.1` path.

## Checks Passed

- `npm ci`
- `npm audit`
- `npm run typecheck`
- `npm run lint`
- `npm test` — 20 files / 273 tests passed under Vitest 4
- `npm run build`
- `npm run docs:tools` — generated 483 tools with no `TOOLS.md` drift
- `npm pack --dry-run` — package remains `@rowvyn/servicetitan-mcp@2.6.0`, about 87.8 KB
- `npm run prepublishOnly`
- `git diff --check`
- JSON validation for `spec.json` and `tasks.json`

## Boundaries Held

- No package version bump.
- No tag.
- No npm publish.
- No release workflow.
- No deploy.
- No live ServiceTitan API call.
