import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { request } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const API_KEY = "wire-test-local-api-key";
export const UNSUPPORTED = [
  "accounting_payments_create", "dispatch_installed_equipment_delete", "dispatch_job_types_delete", "dispatch_jobs_hold",
  "dispatch_jobs_complete", "dispatch_jobs_messages_create", "dispatch_projects_delete", "dispatch_projects_messages_create",
  "marketing_campaign_costs_delete", "marketing_suppressions_list", "marketing_suppressions_get", "marketing_suppressions_remove",
  "marketing_suppressions_add", "payroll_payrolls_get", "payroll_timesheets_non_job_create", "payroll_timesheets_non_job_get",
  "payroll_timesheets_create_job", "payroll_timesheets_job_update", "payroll_timesheets_non_job_update", "payroll_timesheets_non_job_delete",
  "settings_tag_types_get", "settings_tag_types_delete", "export_contacts", "export_job_cancel_reasons",
  "export_location_recurring_services", "export_location_recurring_service_events", "export_timesheets",
];

/** All ServiceTitan settings are synthetic; no inherited ST_*, proxy or Node preload settings survive. */
export function childEnvironment(overrides = {}) {
  const inherited = Object.fromEntries(["PATH", "HOME", "USER", "TMPDIR", "SystemRoot", "WINDIR", "LANG"]
    .filter(key => typeof process.env[key] === "string").map(key => [key, process.env[key]]));
  return {
    ...inherited, ST_CLIENT_ID: "wire-fixture-client", ST_CLIENT_SECRET: "wire-fixture-secret", ST_APP_KEY: "wire-fixture-app-key",
    ST_TENANT_ID: "42", ST_ENVIRONMENT: "integration", ST_READONLY: "true", ST_TOOL_PROFILE: "crm", ST_TIMEZONE: "UTC",
    ST_MAX_RESPONSE_CHARS: "1024", ST_LOG_LEVEL: "error", ST_MCP_HOST: "127.0.0.1", ST_MCP_API_KEY: API_KEY,
    ST_MAX_SESSIONS: "2", ST_MAX_CONCURRENT_TOOLS: "2", ST_TOOL_TIMEOUT_MS: "2000",
    // Defense in depth: a future accidental OAuth prewarm cannot connect to ServiceTitan.
    HTTP_PROXY: "http://127.0.0.1:1", HTTPS_PROXY: "http://127.0.0.1:1", NO_PROXY: "127.0.0.1,localhost",
    ...overrides,
  };
}

export async function assertBuild() {
  await access(resolve(ROOT, "build/index.js"));
  await access(resolve(ROOT, "build/streamable-http.js"));
}

export async function allTools(client) {
  const tools = [];
  let cursor;
  do {
    const page = await client.listTools({ cursor });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}

export function assertCatalog(tools, { readonly = true, crmOnly = true } = {}) {
  const names = new Set(tools.map(tool => tool.name));
  assert(names.has("crm_customers_list"));
  assert(names.has("st_result_read"));
  assert.equal(UNSUPPORTED.length, 27);
  for (const name of UNSUPPORTED) assert(!names.has(name), `Unsupported tool advertised: ${name}`);
  if (readonly) {
    assert(!names.has("crm_customers_create"));
    for (const tool of tools) assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} must be readonly`);
  } else {
    assert(names.has("crm_customers_create"));
  }
  if (crmOnly) for (const tool of tools) assert(tool.name.startsWith("crm_") || tool.name.startsWith("st_"), `Profile leaked ${tool.name}`);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object", tool.name);
    assert.equal(tool.outputSchema?.type, "object", tool.name);
  }
}

export function assertSafeError(result, message = /unavailable or expired/) {
  assert.equal(result.isError, true);
  assert.equal(result.content[0]?.type, "text");
  const parsed = JSON.parse(result.content[0].text);
  assert.deepEqual(result.structuredContent, parsed);
  assert.match(parsed.error.message, message);
  assert(JSON.stringify(result).length <= 1024);
  assert.doesNotMatch(JSON.stringify(result), /wire-fixture-secret|wire-fixture-app-key/);
}

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return port;
}

export async function launchHttp(overrides = {}) {
  await assertBuild();
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [resolve(ROOT, "build/streamable-http.js")], {
    cwd: ROOT, env: childEnvironment({ ST_MCP_PORT: String(port), ...overrides }), stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-16000); });
  child.stdout.resume();
  const exited = once(child, "exit");
  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    if (child.exitCode === null) child.kill("SIGTERM");
    let timer;
    try {
      const outcome = await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("HTTP process failed to shut down after SIGTERM")), 12000); })]);
      assert.equal(outcome[0], 0, `HTTP process exit: ${outcome}; ${stderr}`);
      assert.doesNotMatch(stderr, /wire-fixture-secret|wire-fixture-app-key/);
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }
  try {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (child.exitCode !== null) throw new Error(`HTTP startup failed: ${stderr}`);
      try {
        const health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(500) });
        if (health.ok) { await health.arrayBuffer(); return { url, port, child, stop }; }
        await health.arrayBuffer();
      } catch { /* Local listener is not ready yet. */ }
      await delay(100);
    }
    throw new Error(`HTTP startup timed out: ${stderr}`);
  } catch (error) {
    await stop().catch(() => {});
    throw error;
  }
}

export const INITIALIZE = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "wire-fixture", version: "1" } } };

export async function rawMcp(url, { body = INITIALIZE, headers = {}, method = "POST" } = {}) {
  const response = await fetch(`${url}/mcp`, {
    method, headers: { "x-api-key": API_KEY, "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000),
  });
  const text = await response.text();
  return { status: response.status, sessionId: response.headers.get("mcp-session-id"), text };
}

export async function malformedHost(port) {
  return new Promise((resolveResponse, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path: "/mcp", method: "POST", headers: { host: "[invalid", "x-api-key": API_KEY } }, res => {
      res.resume();
      res.once("end", () => resolveResponse(res.statusCode));
    });
    req.once("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("Host test timeout")));
    req.end("{}");
  });
}
