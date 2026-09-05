#!/usr/bin/env node
import { ServiceTitanClient } from "./client.js";
import { loadConfig } from "./config.js";
import { checkReadiness } from "./readiness.js";
import { withRequestContext } from "./request-context.js";

try {
  const config = loadConfig();
  const manifest = await withRequestContext({ signal: AbortSignal.timeout(120_000) },
    () => checkReadiness(new ServiceTitanClient(config), config));
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
  if (manifest.status !== "ready") process.exitCode = 2;
} catch {
  process.stderr.write("Readiness could not complete. Check required configuration and sanitized server diagnostics.\n");
  process.exitCode = 1;
}
