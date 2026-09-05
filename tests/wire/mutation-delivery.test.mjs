import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ROOT, assertBuild, childEnvironment } from "./helpers.mjs";

const axiosUrl = import.meta.resolve("axios");

function fixturePreload(metricsPath) {
  return `
import { appendFileSync } from "node:fs";
import axios from ${JSON.stringify(axiosUrl)};
const metricsPath = ${JSON.stringify(metricsPath)};
const responseBytes = Number(process.env.WIRE_RESPONSE_BYTES ?? 0);
appendFileSync(metricsPath, JSON.stringify({ kind: "loaded" }) + "\\n", { mode: 0o600 });
axios.defaults.adapter = async config => {
  const url = new URL(config.url, config.baseURL);
  const auth = url.hostname === "auth-integration.servicetitan.io" && url.pathname === "/connect/token" && config.method === "post";
  const update = url.hostname === "api-integration.servicetitan.io" && url.pathname === "/crm/v2/tenant/42/customers/7" && config.method === "patch";
  const remove = url.hostname === "api-integration.servicetitan.io" && url.pathname === "/crm/v2/tenant/42/contacts/00000000-0000-4000-8000-000000000007" && config.method === "delete";
  if (!auth && !update && !remove) throw new Error("Wire fixture blocked unexpected upstream operation");
  appendFileSync(metricsPath, JSON.stringify({ kind: auth ? "auth" : "mutation", method: config.method, path: url.pathname }) + "\\n", { mode: 0o600 });
  const data = auth
    ? { access_token: "wire-mutation-token", expires_in: 900 }
    : update
      ? { id: 7, name: "x".repeat(responseBytes) }
      : {};
  return { status: 200, statusText: "OK", config, headers: {}, data };
};
`;
}

async function runBuiltMutation({ name, arguments: args, responseBytes = 0, budget = 256 }) {
  await assertBuild();
  const directory = await mkdtemp(join(tmpdir(), "st-wire-mutation-"));
  const preload = join(directory, "fixture.mjs");
  const metrics = join(directory, "metrics.jsonl");
  await writeFile(preload, fixturePreload(metrics), { mode: 0o600 });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", preload, resolve(ROOT, "build/index.js")],
    cwd: ROOT,
    env: childEnvironment({
      ST_TOOL_PROFILE: "crm",
      ST_READONLY: "false",
      ST_EXPERIMENTAL_WRITES: "true",
      ST_CONFIRM_WRITES: "true",
      ST_MAX_RESPONSE_CHARS: String(budget),
      ST_LOG_LEVEL: "info",
      WIRE_RESPONSE_BYTES: String(responseBytes),
    }),
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr.on("data", chunk => { stderr += chunk.toString(); });
  const client = new Client({ name: "mutation-delivery-wire-test", version: "1" });
  let result;
  let thrown;
  try {
    await client.connect(transport, { timeout: 10000 });
    result = await client.callTool({ name, arguments: args }, undefined, { timeout: 10000 });
  } catch (error) {
    thrown = error;
  } finally {
    if (transport.pid) {
      try { process.kill(transport.pid, "SIGTERM"); }
      catch (error) { if (error.code !== "ESRCH") thrown ??= error; }
    }
    try { await client.close(); }
    catch (error) { thrown ??= error; }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 20));
  }
  try {
    if (thrown) throw thrown;
    return { result, stderr, events: await mutationEvents(metrics) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function mutationEvents(path) {
  const lines = (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  return lines.filter(event => event.kind === "mutation");
}

function assertEquivalent(result) {
  assert.equal(result.content[0]?.type, "text");
  assert.deepEqual(result.structuredContent, JSON.parse(result.content[0].text));
}

function assertCompletedDeliveryFailure(result) {
  assert.equal(result.isError, true);
  assertEquivalent(result);
  assert.deepEqual(result.structuredContent, {
    error: { code: "RESPONSE_TOO_LARGE", mutationCompleted: true, retryable: false },
  });
  assert.equal(JSON.stringify(result).includes("outcomeUnknown"), false);
  assert.equal(JSON.stringify(result).includes("Retry"), false);
  assert(JSON.stringify(result).length <= 256);
}

for (const scenario of [
  { name: "stored pointer cannot fit the minimum response budget", responseBytes: 20_000 },
  { name: "response exceeds the result-store capacity", responseBytes: 4_100_000 },
]) {
  test(`built MCP marks a completed update when ${scenario.name}`, { timeout: 20000 }, async () => {
    const execution = await runBuiltMutation({
      name: "crm_customers_update",
      arguments: { id: 7, payload: { name: "Synthetic" }, _confirmed: true },
      responseBytes: scenario.responseBytes,
    });
    assert.deepEqual(execution.events, [
      { kind: "mutation", method: "patch", path: "/crm/v2/tenant/42/customers/7" },
    ], JSON.stringify(execution.result));
    assertCompletedDeliveryFailure(execution.result);
    const stderr = execution.stderr;
    assert.match(stderr, /\[AUDIT\] WRITE crm_customers_update/);
    assert.match(stderr, /"success":true/);
    assert.match(stderr, /"deliveryError":"RESPONSE_TOO_LARGE"/);
    assert.doesNotMatch(stderr, /wire-fixture-secret|wire-fixture-app-key|wire-mutation-token/);
  });
}

test("built MCP reports a confirmed delete once and audits its successful completion", { timeout: 20000 }, async () => {
  const execution = await runBuiltMutation({
    name: "crm_contacts_delete",
    arguments: { id: "00000000-0000-4000-8000-000000000007", confirm: true },
  });
  assert.equal(execution.result.isError, undefined);
  assertEquivalent(execution.result);
  assert.equal(execution.result.structuredContent.success, true);
  assert.deepEqual(execution.events, [
    { kind: "mutation", method: "delete", path: "/crm/v2/tenant/42/contacts/00000000-0000-4000-8000-000000000007" },
  ]);
  const stderr = execution.stderr;
  assert.match(stderr, /\[AUDIT\] DELETE crm_contacts_delete/);
  assert.match(stderr, /"success":true/);
  assert.doesNotMatch(stderr, /"deliveryError"/);
  assert.doesNotMatch(stderr, /wire-fixture-secret|wire-fixture-app-key|wire-mutation-token/);
});
