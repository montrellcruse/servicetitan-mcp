import { describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ServiceTitanConfig } from "../../src/config.js";
import { loadDispatchDomain } from "../../src/domains/dispatch/index.js";
import { ToolRegistry } from "../../src/registry.js";
import type { ToolResponse } from "../../src/types.js";

function createConfig(): ServiceTitanConfig {
  return {
    clientId: "client-id",
    clientSecret: "client-secret",
    appKey: "app-key",
    tenantId: "tenant-id",
    environment: "integration",
    readonlyMode: false,
    confirmWrites: false,
    maxResponseChars: 100_000,
    enabledDomains: null,
    logLevel: "error",
    timezone: "UTC",
    corsOrigin: "",
    allowedCallers: null,
  };
}

function createContext() {
  const server = { tool: vi.fn() };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const registry = new ToolRegistry(server as any, createConfig(), logger as any);
  const get = vi.fn().mockResolvedValue({ data: [] });
  const post = vi.fn().mockResolvedValue({ id: 1 });
  const client = {
    get,
    post,
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as ServiceTitanClient;

  registry.attachClient(client);
  loadDispatchDomain(client, registry);

  const handlers = new Map<string, (params: unknown) => Promise<ToolResponse>>();
  for (const [name, _schema, handler] of server.tool.mock.calls) {
    handlers.set(name as string, handler as (params: unknown) => Promise<ToolResponse>);
  }

  return { get, post, handlers };
}

function getHandler(
  handlers: Map<string, (params: unknown) => Promise<ToolResponse>>,
  name: string,
): (params: unknown) => Promise<ToolResponse> {
  const handler = handlers.get(name);
  if (!handler) throw new Error(`Missing handler for ${name}`);
  return handler;
}

describe("dispatch job attachment routing", () => {
  it("lists job attachments through the Forms API", async () => {
    const { get, handlers } = createContext();

    await getHandler(handlers, "dispatch_jobs_list_attachments")({
      jobId: 80233717,
      createdOnOrAfter: "2026-06-19T06:00:00Z",
      createdBefore: "2026-06-20T06:00:00Z",
      pageSize: 100,
    });

    expect(get).toHaveBeenCalledWith(
      "/forms/v2/tenant/{tenant}/jobs/80233717/attachments",
      {
        createdOnOrAfter: "2026-06-19T06:00:00Z",
        createdBefore: "2026-06-20T06:00:00Z",
        pageSize: 100,
      },
    );
  });

  it("gets a job attachment through the Forms API", async () => {
    const { get, handlers } = createContext();

    await getHandler(handlers, "dispatch_jobs_get_attachment")({ id: 1234 });

    expect(get).toHaveBeenCalledWith(
      "/forms/v2/tenant/{tenant}/jobs/attachment/1234",
    );
  });

  it("creates a job attachment through the Forms API", async () => {
    const { post, handlers } = createContext();

    await getHandler(handlers, "dispatch_jobs_create_attachment")({
      id: 80233717,
      file: "ZmlsZQ==",
      fileName: "test.txt",
      contentType: "text/plain",
    });

    expect(post).toHaveBeenCalledWith(
      "/forms/v2/tenant/{tenant}/jobs/80233717/attachments",
      {
        file: "ZmlsZQ==",
        fileName: "test.txt",
        contentType: "text/plain",
      },
    );
  });
});
