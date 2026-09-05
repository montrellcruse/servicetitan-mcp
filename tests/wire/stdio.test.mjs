import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
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

test("built full experimental catalog labels mutations and preserves confirmation gates", { timeout: 20000 }, async () => {
  await withStdio({ ST_TOOL_PROFILE: "full", ST_READONLY: "false", ST_EXPERIMENTAL_WRITES: "true", ST_CONFIRM_WRITES: "true" }, async client => {
    const tools = await allTools(client);
    assertCatalog(tools, { readonly: false, crmOnly: false });
    assert.equal(tools.filter(tool => tool.annotations.readOnlyHint).length, 264);
    assert.equal(tools.filter(tool => !tool.annotations.readOnlyHint).length, 194);
    // Unconfirmed calls stop in local middleware; no upstream request occurs.
    assertSafeError(await client.callTool({ name: "crm_customers_update", arguments: { id: 7 } }), /Write confirmation required/);
    const preview = await client.callTool({ name: "crm_contacts_delete", arguments: { id: "00000000-0000-4000-8000-000000000007" } });
    assert(!preview.isError);
    assert.deepEqual(preview.structuredContent, JSON.parse(preview.content[0].text));
    assert.equal(preview.structuredContent.action, "DELETE");
    assert.match(preview.structuredContent.confirm, /confirm=true/);
  });
});

test("built full catalog defaults to supported reads and readonly overrides experimental opt-in", { timeout: 20000 }, async () => {
  for (const experimental of [undefined, "true"]) {
    await withStdio({ ST_TOOL_PROFILE: "full", ST_READONLY: undefined, ST_EXPERIMENTAL_WRITES: experimental }, async client => {
      const tools = await allTools(client);
      assertCatalog(tools, { crmOnly: false });
      assert.equal(tools.length, 264);
      assert(tools.every(tool => !tool.description.startsWith("EXPERIMENTAL:")));
    });
  }
});

test("built entrypoints reject writes without explicit experimental opt-in before startup", { timeout: 30000 }, async () => {
  await assertBuild();
  for (const entry of ["index.js", "streamable-http.js", "sse.js", "readiness-cli.js"]) {
    const result = spawnSync(process.execPath, [resolve(ROOT, "build", entry)], {
      cwd: ROOT, env: childEnvironment({ ST_READONLY: "false", ST_EXPERIMENTAL_WRITES: "false" }), encoding: "utf8", timeout: 5000,
    });
    assert.equal(result.status, 1, `${entry}: ${result.stderr}`);
    assert.equal(result.signal, null);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /ST_EXPERIMENTAL_WRITES=true/);
    assert.match(result.stderr, /ST_READONLY=true/);
    assert.doesNotMatch(result.stderr, /wire-fixture-secret|wire-fixture-app-key/);
  }
});

test("all built entrypoints suppress untrusted configuration values in generic startup errors", { timeout: 30000 }, async () => {
  await assertBuild();
  for (const entry of ["index.js", "streamable-http.js", "sse.js", "readiness-cli.js"]) {
    const result = spawnSync(process.execPath, [resolve(ROOT, "build", entry)], {
      cwd: ROOT, env: childEnvironment({ ST_TIMEZONE: "STARTUP_ERROR_CANARY" }), encoding: "utf8", timeout: 5000,
    });
    assert.equal(result.status, 1, `${entry}: ${result.stderr}`);
    assert.equal(result.signal, null);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /configuration/i);
    assert.doesNotMatch(result.stderr, /STARTUP_ERROR_CANARY|wire-fixture-secret|wire-fixture-app-key/);
  }
});
