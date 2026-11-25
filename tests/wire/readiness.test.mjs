import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ROOT, assertBuild, childEnvironment } from "./helpers.mjs";

const preload = ["--import", resolve(ROOT, "tests/fixtures/wire-readiness.mjs")];

function withoutTimestamp(manifest) {
  const { checkedAt, ...details } = manifest;
  assert(Number.isFinite(Date.parse(checkedAt)));
  return details;
}

for (const scenario of [
  { status: "ready", exitCode: 0, reportStatus: "available" },
  { status: "partial", exitCode: 2, reportStatus: "incompatible" },
]) {
  test(`built CLI and MCP agree on ${scenario.status} labor-cost readiness`, { timeout: 20000 }, async () => {
    await assertBuild();
    const env = childEnvironment({
      ST_TOOL_PROFILE: "analytics",
      ST_TOOLS: "intel_labor_cost",
      ST_MAX_RESPONSE_CHARS: "8192",
      ...(scenario.status === "partial" ? { WIRE_INCOMPATIBLE_LABOR_REPORT: "true" } : {}),
    });
    const cli = spawnSync(process.execPath, [...preload, resolve(ROOT, "build/readiness-cli.js")], {
      cwd: ROOT, env, encoding: "utf8", timeout: 10000,
    });
    assert.equal(cli.status, scenario.exitCode, cli.stderr);
    const manifest = JSON.parse(cli.stdout);
    assert.equal(manifest.status, scenario.status);
    assert.deepEqual(manifest.modules, []);
    assert.deepEqual(manifest.reports.map(({ key, required, status }) => ({ key, required, status })), [
      { key: "166", required: true, status: scenario.reportStatus },
    ]);

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [...preload, resolve(ROOT, "build/index.js")],
      cwd: ROOT, env, stderr: "pipe",
    });
    const client = new Client({ name: "built-readiness-wire-test", version: "1" });
    try {
      await client.connect(transport, { timeout: 10000 });
      const result = await client.callTool({ name: "st_readiness_check", arguments: {} });
      assert(!result.isError);
      assert.deepEqual(withoutTimestamp(result.structuredContent), withoutTimestamp(manifest));
    } finally { await client.close(); }
  });
}
