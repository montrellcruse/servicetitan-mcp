# Task: Deduplicate tools and add per-tool cache TTL

## Context
Multiple domain files register duplicate tools against the same ST endpoints.
The intel cache uses a global 5min TTL but some data needs faster refresh.

## What to do

### 1. Find and eliminate duplicate tool registrations

Search all files in src/domains/ for tools that hit the same endpoint.
Known duplicates:
- Estimate items: estimates_items_list vs estimates_get_items (or similar)
- Booking contacts: duplicate between scheduling and CRM domains
- Marketing opt-in/out naming inconsistencies

For each duplicate pair:
- Keep ONE canonical version (the one with better schema/description)
- Delete the duplicate registration entirely
- Update any tests that reference the removed tool name

### 2. Add per-tool cache TTL support to intel cache

In src/domains/intelligence/helpers.ts (or wherever getCachedOrFetch is defined):
- Add an optional `ttlMs` parameter to the cache fetch function
- Default to the existing 5-minute TTL when not specified
- Allow individual tools to pass shorter TTLs (e.g. 60_000 for dispatch data)

In src/cache.ts (ReferenceDataCache):
- The TtlCache already supports per-entry TTL via the constructor
- Add an optional ttl override to the getOrLoad() method signature

### 3. Deduplicate loadDomainModules

The loadDomainModules() function is copy-pasted across:
- src/index.ts (stdio)
- src/sse.ts
- src/streamable-http.ts

Extract it into a shared module (e.g. src/domains/loader.ts) and import from all three.

### 4. Add tests
- Test that no two registered tools share the same name (add to registry.test.ts)
- Test that per-tool TTL overrides work in cache

### 5. Run npm test — all tests must pass

### 6. Commit: `refactor: deduplicate tools, domain loader, and add per-tool cache TTL`

### 7. Delete this TASK-DEDUP-CACHE.md file when done

When finished, run: openclaw system event --text "Done: Tool dedup, domain loader extraction, and per-tool cache TTL complete" --mode now
