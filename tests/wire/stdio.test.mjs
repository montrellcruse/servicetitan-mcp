import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ROOT, allTools, assertBuild, assertCatalog, assertSafeError, childEnvironment } from "./helpers.mjs";

async function withStdio(overrides, callback) {
  await assertBuild();
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(ROOT, "build/index.js")], cwd: ROOT, env: childEnvironment(overrides), stderr: "pipe" });
  let stderr = "";
  transport.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-16000); });
  const client = new Client({ name: "built-stdio-wire-test", version: "1" });
  try {
    await client.connect(transport, { timeout: 10000 });
    assert.equal(client.getServerVersion()?.name, "ServiceTitan");
    assert(client.getServerCapabilities()?.tools);
    return await callback(client);
  } finally {
    try {
      if (transport.pid) { try { process.kill(transport.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; } }
    } finally { await client.close(); }
    assert.doesNotMatch(stderr, /wire-fixture-secret|wire-fixture-app-key/);
  }
}

test("built stdio initializes, advertises readonly CRM schemas and returns a safe structured error", { timeout: 20000 }, async () => {
  await withStdio({}, async client => {
    assertCatalog(await allTools(client));
    // This local retrieval error is the only tool executed. No ServiceTitan API call occurs.
    assertSafeError(await client.callTool({ name: "st_result_read", arguments: { resultId: randomUUID() } }));
  });
});

test("built full writable catalog independently excludes all 27 unsupported operations", { timeout: 20000 }, async () => {
  await withStdio({ ST_TOOL_PROFILE: "full", ST_READONLY: "false" }, async client => {
    assertCatalog(await allTools(client), { readonly: false, crmOnly: false });
    // Catalog-only: enabling discovery does not authorize or execute a mutation.
  });
});
