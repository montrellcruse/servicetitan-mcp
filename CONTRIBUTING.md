# Contributing to ServiceTitan MCP Server

Thank you for your interest in contributing! This document covers development setup, architecture conventions, and the PR process.

## Prerequisites

- Node.js >= 20
- npm >= 10
- A ServiceTitan developer account with API credentials

## Getting Started

```bash
git clone https://github.com/montrellcruse/servicetitan-mcp.git
cd servicetitan-mcp
npm ci
cp .env.example .env
# Fill in your ServiceTitan credentials
```

## Development Workflow

```bash
# Build
npm run build

# Run locally (stdio mode)
npm start

# Run as SSE server
npm run start:sse

# Run tests
npm test

# Type-check
npx tsc --noEmit

# Lint
npm run lint

# Regenerate tool catalog
npm run docs:tools
```

## Adding a New Domain

1. Create a directory: `src/domains/<domain>/`
2. Create tool files following the existing pattern (one file per resource)
3. Each tool file exports a function that takes `(client, registry)` and registers tools via `registry.register()`
4. Use Zod schemas for input validation
5. Use `toolResult()` and `toolError()` helpers from `src/utils.ts`
6. Use `getErrorMessage()` from `src/domains/intelligence/helpers.ts` for error formatting
7. Create an `index.ts` that imports and re-exports all tool registrations
8. Add tests in `tests/domains/<domain>.test.ts`

## Adding an Intelligence Tool

Intelligence tools go in `src/domains/intelligence/`. They provide pre-computed business answers (revenue summaries, snapshots, leaderboards) rather than raw CRUD access.

1. Create the tool in `src/domains/intelligence/`
2. Register with `isIntelligence: true` flag
3. Handle partial failures gracefully (use `Promise.allSettled` or `fetchWithWarning` pattern from existing tools)
4. Include timezone-aware date handling via the `timezone` field from `registry.timezone`
5. Add comprehensive tests — intelligence tools are the project's core differentiator

## Naming Conventions

- **Tool names:** `<domain>_<resource>_<action>` (e.g., `crm_customers_list`, `intel_revenue_summary`)
- **Files:** kebab-case (e.g., `gl-accounts.ts`, `customer-memberships.ts`)
- **Functions/variables:** camelCase
- **Types/interfaces:** PascalCase

## Coding Conventions

- TypeScript strict mode — no `any` types
- Use `getErrorMessage()` for error formatting (do NOT define local copies)
- Use Zod schemas for all tool input validation
- Use `toolResult()` / `toolError()` for tool responses
- Respect read-only mode: the registry skips write/delete tools automatically when `ST_READONLY=true`

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` — new tool or feature
- `fix:` — bug fix
- `docs:` — documentation
- `chore:` — maintenance
- `test:` — tests
- `refactor:` — restructuring without behavior change

## Pull Request Process

1. Fork and create a feature branch
2. Make changes with tests
3. Ensure `npm run build && npm test && npm run lint` pass
4. Update CHANGELOG.md under `[Unreleased]`
5. If adding tools, run `npm run docs:tools` to regenerate TOOLS.md
6. Submit PR with clear description

## Questions?

Open an issue or start a discussion on GitHub.
