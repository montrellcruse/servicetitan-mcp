# ServiceTitan MCP esbuild Upgrade Plan

## Goal

Resolve the final low-severity npm audit finding by upgrading the direct `esbuild` devDependency from the audited `0.27.x` line to `0.28.1` and clearing the remaining transitive Vite/Vitest path.

## Current Finding

`npm audit --json` first reported GHSA-g7r4-m6w7-qqqr against direct `esbuild >=0.27.3 <0.28.1`. The package is used in `scripts/build.mjs` through the JavaScript `build()` API to bundle Node 22 ESM entrypoints.

After the direct `esbuild@0.28.1` bump, audit still reported a vulnerable nested copy at `node_modules/vite/node_modules/esbuild`. That path comes through `vitest@3.2.6` -> `vite@7.3.5`, and Vite 7 depends on `esbuild ^0.27.0`. Vitest 4 allows Vite 8, and Vite 8 no longer depends on esbuild.

## Recommended Path

1. Update only `esbuild` to `^0.28.1`.
2. Update `vitest` and `@vitest/coverage-v8` to `^4.1.9` so the test-toolchain path moves to Vite 8.
3. Regenerate the lockfile.
4. Run the full local gate:
   - `npm ci`
   - `npm audit`
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - `npm run build`
   - `npm run docs:tools`
   - `npm pack --dry-run`
   - `npm run prepublishOnly`
   - `git diff --check`
5. Push a focused branch and open a PR.
6. Merge only after GitHub CI passes.
7. Verify post-merge main CI and npm registry state.

## Boundaries

- No version bump.
- No tag.
- No release workflow.
- No npm publish.
- No deployment.
- No live ServiceTitan API calls.
- No unrelated dependency cleanup outside the direct esbuild and Vitest/Vite chain required to clear the advisory.

## Safety Notes

The semver-major warning is partly npm conservatism because esbuild is pre-1.0. The actual build integration surface is small: `build()` options in `scripts/build.mjs` are standard bundling options for Node 22 ESM output.

The test-toolchain expansion is the real risk. The safety proof is not the version number; it is the repeated local and CI build/test/package gate, especially the full Vitest suite.
