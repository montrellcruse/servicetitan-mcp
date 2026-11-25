#!/usr/bin/env node
import { ServiceTitanClient } from "./client.js";
import { loadConfig } from "./config.js";
import { checkReadiness } from "./readiness.js";
import { withRequestContext } from "./request-context.js";
import { startupErrorMessage } from "./startup-diagnostics.js";

try {
  const config = loadConfig();
  const manifest = await withRequestContext({ signal: AbortSignal.timeout(120_000) },
    () => checkReadiness(new ServiceTitanClient(config), config));
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
  if (manifest.status !== "ready") process.exitCode = 2;
} catch (error: unknown) {
  const message = startupErrorMessage(error, "Readiness could not complete. Check required configuration and sanitized server diagnostics.");
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
