# ServiceTitan MCP Server

Core infrastructure for a ServiceTitan MCP server.

## Scripts

- `npm run build` - Compile TypeScript to `build/`
- `npm run typecheck` - Type-check source files
- `npm run lint` - Run ESLint
- `npm test` - Run Vitest test suite

## Configuration

Copy `.env.example` to `.env` and set required ServiceTitan credentials.

## Status

Spec 01 includes core infrastructure only (config, client, logger, registry, utilities).
No domain tools are registered yet.
