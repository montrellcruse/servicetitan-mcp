# npm Publish Plan — servicetitan-mcp-server

## Current State
- Package name: `servicetitan-mcp-server` (available on npm ✅)
- Version: 2.3.1
- 467 tools, 249 tests, clean audit
- npm pack produces 517 files / 2.8MB unpacked (bloated — includes tests, src, Dockerfile, scripts, GitHub templates)
- No `bin` field — can't `npx` it
- No shebang on entry points
- No `.npmignore` or `files` field — ships everything
- Not logged into npm — need `npm login`
- 3 entry points: stdio (index.js), SSE (sse.js), Streamable HTTP (streamable-http.js)

## Plan

### Task 1: Package Metadata (package.json)
Add/update these fields:

```json
{
  "name": "servicetitan-mcp-server",
  "description": "MCP server for the ServiceTitan API — 467 tools across 15 domains with 10 intelligence tools for business analytics",
  "version": "2.3.1",
  "author": "Montrell Cruse <montrell@rowvyn.com> (https://rowvyn.com)",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/montrellcruse/servicetitan-mcp.git"
  },
  "homepage": "https://github.com/montrellcruse/servicetitan-mcp#readme",
  "bugs": {
    "url": "https://github.com/montrellcruse/servicetitan-mcp/issues"
  },
  "keywords": [
    "servicetitan", "mcp", "model-context-protocol", "ai", "llm",
    "hvac", "field-service", "home-service", "api", "claude",
    "business-intelligence", "analytics"
  ],
  "engines": {
    "node": ">=22.0.0"
  },
  "bin": {
    "servicetitan-mcp-server": "./build/index.js",
    "servicetitan-mcp-sse": "./build/sse.js",
    "servicetitan-mcp-http": "./build/streamable-http.js"
  },
  "files": [
    "build/",
    "LICENSE",
    "README.md",
    "CHANGELOG.md",
    ".env.example"
  ]
}
```

Key decisions:
- `files` whitelist (not `.npmignore`) — explicit is safer. Only ship build output + essential docs.
- 3 bin entries: one per transport. Primary is stdio.
- `engines` >= 22 (matches README prerequisite)

### Task 2: Shebang Lines
Add `#!/usr/bin/env node` as first line of:
- `src/index.ts` → builds to `build/index.js`
- `src/sse.ts` → builds to `build/sse.js`
- `src/streamable-http.ts` → builds to `build/streamable-http.js`

After build, verify shebang survives tsc compilation.

### Task 3: Verify Package Contents
After tasks 1-2:
```bash
npm run build
npm pack --dry-run
```
Verify:
- Only `build/`, `LICENSE`, `README.md`, `CHANGELOG.md`, `.env.example` are included
- No `src/`, `tests/`, `audit/`, `.github/`, `Dockerfile`, `scripts/`, `TOOLS.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `SECURITY.md`
- Package size < 500KB unpacked (down from 2.8MB)
- Total files < 100 (down from 517)

### Task 4: Test npx Flow
```bash
npm pack
# In a temp directory:
mkdir /tmp/test-st-mcp && cd /tmp/test-st-mcp
npm init -y
npm install /path/to/servicetitan-mcp-server-2.3.1.tgz
# Verify bin links work:
npx servicetitan-mcp-server --help 2>&1 || echo "expected: should fail with missing env vars, not 'command not found'"
```

Also verify Claude Desktop config works with the installed package:
```json
{
  "mcpServers": {
    "servicetitan": {
      "command": "npx",
      "args": ["-y", "servicetitan-mcp-server"],
      "env": { ... }
    }
  }
}
```

### Task 5: README Updates
Add to Quick Start, before the current "Install & Build" section:

```markdown
### npx (recommended)

No install needed — runs directly:

```json
{
  "mcpServers": {
    "servicetitan": {
      "command": "npx",
      "args": ["-y", "servicetitan-mcp-server"],
      "env": {
        "ST_CLIENT_ID": "your-client-id",
        "ST_CLIENT_SECRET": "your-client-secret",
        "ST_APP_KEY": "your-app-key",
        "ST_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

### Install globally

```bash
npm install -g servicetitan-mcp-server
servicetitan-mcp-server  # stdio transport (for Claude Desktop)
servicetitan-mcp-sse     # SSE transport (legacy remote)
servicetitan-mcp-http    # Streamable HTTP transport (recommended remote)
```
```

Rename current "Install & Build" to "From source" and move it after the npm sections.

### Task 6: Prepublish Script
Add to package.json scripts:
```json
"prepublishOnly": "npm run typecheck && npm run lint && npm run test && npm run build"
```
This ensures every `npm publish` runs the full validation suite first.

### Task 7: Build & Final Verification
```bash
npm run build
npm pack --dry-run  # verify contents
npm pack            # create tarball
tar tzf servicetitan-mcp-server-2.3.1.tgz | wc -l  # count files
```

Verify:
- [ ] Shebang present in all 3 build entry points
- [ ] `files` whitelist produces clean package
- [ ] Package size reasonable (target < 500KB unpacked)
- [ ] All 249 tests still pass
- [ ] Typecheck clean
- [ ] Lint clean

### Task 8: Version Bump to 2.4.0
This is a feature release (new npm distribution, bin entries, README restructure):
```bash
# Update package.json version to 2.4.0
# Update CHANGELOG.md with [2.4.0] section
# Commit, tag, push
git tag v2.4.0
git push origin main --tags
gh release create v2.4.0 --title "v2.4.0 — npm Publish" --generate-notes
```

### Task 9: Publish (REQUIRES TRELL)
This step needs Trell to:
1. Log into npm: `npm login` (or create account at npmjs.com)
2. Verify: `npm whoami`
3. Publish: `npm publish`
4. Verify: `npm view servicetitan-mcp-server`

**I will NOT run `npm publish` without explicit approval.**

### Task 10: Post-Publish Verification
```bash
# In a fresh temp dir:
npx servicetitan-mcp-server  # should fail with "Missing required env vars" not "not found"
npm info servicetitan-mcp-server
```

Update GitHub repo description and topics:
```bash
gh repo edit --description "MCP server for ServiceTitan — 467 tools, 15 domains, 10 intelligence tools"
gh repo edit --add-topic servicetitan,mcp,model-context-protocol,ai,claude,hvac,field-service
```

---

## Out of Scope (deferred)
- `@rowvyn/servicetitan-mcp` scoped package (can add later as alias)
- GitHub Actions auto-publish on release (can add in CI later)
- MCP registry submission (do after npm is live)
- Homebrew formula (already exists for CLI; MCP can follow same pattern later)

## Codex Instructions
Tasks 1-8 are automated. Task 9 requires Trell. Task 10 is post-publish.

Do NOT run `npm publish` or `npm login`. Stop after Task 8 (version bump + push).
