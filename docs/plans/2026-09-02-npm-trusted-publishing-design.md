# npm Trusted Publishing migration

## Goal

Replace the repository's expiring npm publish token with npm Trusted Publishing and prove the new path with `v2.6.4` before revoking the credential.

## Design

npm will trust one GitHub Actions identity: owner `montrellcruse`, repository `servicetitan-mcp`, workflow file `release.yml`, no GitHub environment, and the `npm publish` action only. The existing tag-triggered release flow stays intact.

The release job will request `contents: read` and `id-token: write`. It will move from Node.js 22 to Node.js 24 so the runner includes npm 11.5.1 or newer, which npm requires for OIDC publishing. Release caching will be disabled. The workflow will remove both `NODE_AUTH_TOKEN` and `setup-node`'s `registry-url` input so no empty `_authToken` placeholder can suppress npm's OIDC exchange. A successful publish therefore proves that npm accepted the GitHub OIDC identity. Trusted Publishing will add package provenance automatically.

## Cutover and rollback

Configure the trusted publisher before pushing `v2.6.4`. Merge the workflow and version bump through the protected-branch PR path, then tag the locked merge commit. Verify the release workflow, npm `latest`, provenance, GitHub Release, and repository state. Only after those checks pass should the npm granular token be revoked and the GitHub `NPM_TOKEN` secret deleted.

If OIDC publishing fails, keep the token available but unreferenced, correct the exact npm owner/repository/workflow mismatch, and rerun the same tag workflow. Do not restore token-based publishing unless npm Trusted Publishing is unavailable and Trell explicitly approves the rollback.
