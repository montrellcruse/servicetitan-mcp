# Task: Write middleware enforcement + schema hardening

## Context
The ServiceTitan MCP has write tools (operation: "write") that need:
1. Write confirmation enforcement at middleware level (not per-handler)
2. Audit logging enforcement at middleware level (not per-handler)
3. Non-empty schemas on all write tools
4. Server-managed fields removed from write schemas

## What to do

### 1. Add write middleware to ToolRegistry (src/registry.ts)

In the `register()` method, wrap all `operation: "write"` handlers with middleware that:
- Checks `config.readonlyMode` — if true, return error "Write operations are disabled in readonly mode"
- Checks `config.confirmWrites` — if true AND the tool call doesn't include a `_confirmed: true` param, return error "Write confirmation required. Re-call with _confirmed: true to proceed."
- After successful execution, calls `auditLogger.log({ tool, params, result })` automatically

This ensures NO write handler can bypass confirmation or audit logging even if the handler forgets.

### 2. Audit write schemas across all domain files

Search all files in src/domains/ for `operation: "write"` registrations.
For each one:
- If `schema: {}` (empty), add at minimum an `id` field or whatever the handler actually requires
- Remove any server-managed fields from schemas: id, createdOn, createdBy, modifiedOn, modifiedBy, mergedToId, updatedAt, createdAt
  (these should only appear in read responses, not write inputs)

### 3. Add tests

In a new file `tests/safety/write-middleware.test.ts`:
- Test that readonly mode blocks all write tools
- Test that confirmWrites requires _confirmed param
- Test that audit logger is called for every write execution
- Test that write tools with non-empty schemas reject empty input

### 4. Run npm test — all tests must pass

### 5. Commit: `fix(security): add write middleware for confirmation and audit enforcement`

### 6. Delete this TASK-WRITE-MIDDLEWARE.md file when done

When finished, run: openclaw system event --text "Done: Write middleware enforcement + schema hardening complete" --mode now
