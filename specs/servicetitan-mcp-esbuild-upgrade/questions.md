# ServiceTitan MCP esbuild Upgrade Questions

## Answered By Context

- **Should this include a package release?** No. This is a devDependency-only build-tool repair. Do not push a tag or publish npm.
- **Should live ServiceTitan validation run?** No. The change does not touch ServiceTitan API behavior and live tenant calls are unnecessary risk.
- **How should publication happen?** Use a focused GitHub PR after local verification. Merge only after PR CI passes.
- **Should other outdated packages be modernized too?** No. Keep this slice only to `esbuild`.
- **What if direct `esbuild` is not enough?** The direct bump exposed a second vulnerable copy under Vite via Vitest 3.2.6. The safe expansion is Vitest tooling only: `vitest`, `@vitest/coverage-v8`, and the transitive Vite path required to clear the advisory.

## Open Questions

None blocking.
