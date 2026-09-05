# Pinned ServiceTitan API contracts

This directory contains the immutable official OpenAPI input used to generate and check the runtime contract manifest.

- `official-openapi-2026-09-04.tar.gz` contains the 24 public OpenAPI 3.1 documents retrieved from the [ServiceTitan API catalog](https://developer.servicetitan.io/api/docs/apis) on September 4, 2026.
- `sources.json` records each official document URL, SHA-256 digest, byte size, server URL, and operation count.

Regenerate the TypeScript operation and route manifests after deliberately replacing both pinned source files:

```sh
npm run contracts:generate
npm run contracts:check
```

Review the generated diff before committing it. The check command verifies that the generated files identify the current archive digest and that every supported domain call resolves to an operation in the pinned documents.
