# AGENTS.md

Purpose: handoff for the ServiceTitan MCP esbuild audit repair.

Rules
- Keep the change focused on `esbuild` and the Vitest/Vite toolchain path required to remove vulnerable nested esbuild.
- Do not bump the package version.
- Do not push tags, publish npm, deploy, or call live ServiceTitan APIs.
- Treat PR merge as allowed only after local validation and GitHub CI are green.
- If generated `TOOLS.md` changes, inspect it and only keep it if the dependency change legitimately changed output.
- Do not modernize unrelated packages just because `npm outdated` reports them.

Validation gate
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

Completion
- Record PR/merge/check status in `memory/projects/servicetitan-mcp.md`.
- Append the relevant daily note.
