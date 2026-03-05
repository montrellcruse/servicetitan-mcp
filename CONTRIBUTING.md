# Contributing

This project uses domain-based modules and a centralized tool registry. Follow the patterns below when adding or changing tools.

## Add a New Tool

1. Pick the correct domain directory under `src/domains/<domain>/`.
2. Create or update a resource file (for example: `src/domains/crm/customers.ts`).
3. Implement a `register...Tools(client, registry)` function in that file.
4. Register each tool via `registry.register({ ... })` with:
   - `name`
   - `domain`
   - `operation` (`read` | `write` | `delete`)
   - `schema`
   - `handler`
5. Register the tool module from that domain’s `index.ts` loader.
6. Ensure tool naming follows the convention below.

## Add a New Domain

1. Create directory: `src/domains/<new-domain>/`.
2. Add tool files and registration functions for that domain.
3. Create `src/domains/<new-domain>/index.ts` that:
   - imports each register function
   - exports a loader function that calls them
   - exports the loader as default
4. `src/index.ts` discovers domains dynamically, so no hardcoded root import is required as long as the domain has `index.ts` (compiled to `index.js`).

## Naming Convention

Use:

`{domain}_{resource}_{action}`

Examples:
- `crm_customer_get`
- `dispatch_job_update`
- `inventory_purchase_order_delete`

Keep names explicit and consistent with tool operation.

## Testing Requirements

- Add or update tests for every new tool.
- Cover:
  - success path
  - schema validation failures
  - safety behavior (read-only skip, confirmation preview where applicable)
  - error path from ServiceTitan/API client
- Put tests in the existing structure under `tests/` (domain tests and safety tests as appropriate).

## Pull Request Checklist

Before opening a PR, run:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

PR should include:

- Clear summary of affected domains/tools
- Test coverage for new behavior
- Updated docs if env vars, behavior, or tool surfaces changed
