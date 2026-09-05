import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer, loadConfig } from "../../build/server.js";

const secret = "audit-wire-secret-canary";
const config = loadConfig({
  ST_CLIENT_ID: "audit-wire-client",
  ST_CLIENT_SECRET: secret,
  ST_APP_KEY: "audit-wire-key",
  ST_TENANT_ID: "42",
  ST_READONLY: "false",
  ST_EXPERIMENTAL_WRITES: "true",
  ST_CONFIRM_WRITES: "true",
  ST_TOOL_PROFILE: "crm",
  ST_MAX_RESPONSE_CHARS: "256",
  ST_LOG_LEVEL: "error",
});

function equivalent(result) {
  assert.equal(result.content[0]?.type, "text");
  assert.deepEqual(result.structuredContent, JSON.parse(result.content[0].text));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
}

function uncertainError() {
  return Object.assign(new Error(`Synthetic failure ${secret}`), {
    name: "ServiceTitanApiError",
    status: 503,
    path: "/crm/v2/tenant/42/customers/7",
    details: { phase: "resource", code: "ERR_BAD_RESPONSE", retryable: false, outcomeUnknown: true, traceId: "audit-trace" },
  });
}

async function fixture({ patch, remove, logger }) {
  const clientApi = {
    patch,
    delete: remove,
    get: async () => { throw new Error("Unexpected synthetic read"); },
    post: async () => { throw new Error("Unexpected synthetic post"); },
    put: async () => { throw new Error("Unexpected synthetic put"); },
    ensureToken: async () => {},
  };
  const runtime = await createMcpServer(config, { client: clientApi, logger });
  const client = new Client({ name: "audit-failure-wire-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await runtime.server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await runtime.server.close();
    },
  };
}

function throwingLogger({ fallback = false } = {}) {
  const calls = { audit: 0, infoAudit: 0, error: 0 };
  const logger = {
    debug() {}, warn() {},
    info(message) {
      if (String(message).startsWith("[AUDIT]")) {
        calls.infoAudit += 1;
        throw new Error(`fallback audit unavailable ${secret}`);
      }
    },
    error() {
      calls.error += 1;
      throw new Error(`diagnostic logger unavailable ${secret}`);
    },
    ...(fallback ? {} : {
      audit() {
        calls.audit += 1;
        throw new Error(`audit sink unavailable ${secret}`);
      },
    }),
  };
  return { logger, calls };
}

test("built factory preserves a successful write when logger.audit and logger.error throw", async () => {
  let writes = 0;
  const sink = throwingLogger();
  const run = await fixture({
    patch: async () => { writes += 1; return { id: 7, name: "Updated" }; },
    remove: async () => { throw new Error("Unexpected delete"); },
    logger: sink.logger,
  });
  try {
    const result = await run.client.callTool({
      name: "crm_customers_update",
      arguments: { id: 7, payload: { name: "Updated" }, _confirmed: true },
    });
    equivalent(result);
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, { id: 7, name: "Updated" });
    assert.equal(writes, 1);
    assert.deepEqual(sink.calls, { audit: 1, infoAudit: 0, error: 1 });
  } finally { await run.close(); }
});

test("built factory preserves a successful delete when fallback logger.info throws", async () => {
  let deletes = 0;
  const sink = throwingLogger({ fallback: true });
  const run = await fixture({
    patch: async () => { throw new Error("Unexpected write"); },
    remove: async () => { deletes += 1; },
    logger: sink.logger,
  });
  try {
    const result = await run.client.callTool({
      name: "crm_contacts_delete",
      arguments: { id: "00000000-0000-4000-8000-000000000007", confirm: true },
    });
    equivalent(result);
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.success, true);
    assert.equal(deletes, 1);
    assert.deepEqual(sink.calls, { audit: 0, infoAudit: 1, error: 1 });
  } finally { await run.close(); }
});

test("built factory preserves an uncertain mutation error when audit diagnostics throw", async () => {
  let writes = 0;
  const sink = throwingLogger();
  const run = await fixture({
    patch: async () => { writes += 1; throw uncertainError(); },
    remove: async () => { throw new Error("Unexpected delete"); },
    logger: sink.logger,
  });
  try {
    const result = await run.client.callTool({
      name: "crm_customers_update",
      arguments: { id: 7, payload: { name: "Updated" }, _confirmed: true },
    });
    equivalent(result);
    assert.equal(result.isError, true);
    assert.deepEqual(result.structuredContent, {
      error: { code: "OUTCOME_UNKNOWN", outcomeUnknown: true, retryable: false },
    });
    assert.equal(writes, 1);
    assert.deepEqual(sink.calls, { audit: 1, infoAudit: 0, error: 1 });
  } finally { await run.close(); }
});

test("built factory preserves completed oversized-write metadata when audit diagnostics throw", async () => {
  let writes = 0;
  const sink = throwingLogger();
  const run = await fixture({
    patch: async () => { writes += 1; return { id: 7, data: "x".repeat(20_000) }; },
    remove: async () => { throw new Error("Unexpected delete"); },
    logger: sink.logger,
  });
  try {
    const result = await run.client.callTool({
      name: "crm_customers_update",
      arguments: { id: 7, payload: { name: "Updated" }, _confirmed: true },
    });
    equivalent(result);
    assert.equal(result.isError, true);
    assert.deepEqual(result.structuredContent, {
      error: { code: "RESPONSE_TOO_LARGE", mutationCompleted: true, retryable: false },
    });
    assert.equal(writes, 1);
    assert.deepEqual(sink.calls, { audit: 1, infoAudit: 0, error: 1 });
  } finally { await run.close(); }
});
