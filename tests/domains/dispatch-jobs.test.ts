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
  const post = vi.fn().mockResolvedValue({ id: 80233717 });
  const client = {
    get: vi.fn(),
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

  return { post, handlers };
}

function getHandler(
  handlers: Map<string, (params: unknown) => Promise<ToolResponse>>,
  name: string,
): (params: unknown) => Promise<ToolResponse> {
  const handler = handlers.get(name);
  if (!handler) throw new Error(`Missing handler for ${name}`);
  return handler;
}

describe("dispatch job creation", () => {
  it("passes the documented create-job payload with appointments", async () => {
    const { post, handlers } = createContext();

    await getHandler(handlers, "dispatch_jobs_create")({
      customerId: 30118932,
      locationId: 32126671,
      businessUnitId: 26835039,
      jobTypeId: 57477915,
      campaignId: 56079032,
      priority: "Normal",
      summary: "Other plumbing service for Zion Summit",
      appointments: [
        {
          start: "2026-07-06T14:00:00.000Z",
          end: "2026-07-06T18:00:00.000Z",
          arrivalWindowStart: "2026-07-06T14:00:00.000Z",
          arrivalWindowEnd: "2026-07-06T18:00:00.000Z",
          technicianIds: [5890, 57387153],
        },
      ],
    });

    expect(post).toHaveBeenCalledWith("/tenant/{tenant}/jobs", {
      customerId: 30118932,
      locationId: 32126671,
      businessUnitId: 26835039,
      jobTypeId: 57477915,
      campaignId: 56079032,
      priority: "Normal",
      summary: "Other plumbing service for Zion Summit",
      appointments: [
        {
          start: "2026-07-06T14:00:00.000Z",
          end: "2026-07-06T18:00:00.000Z",
          arrivalWindowStart: "2026-07-06T14:00:00.000Z",
          arrivalWindowEnd: "2026-07-06T18:00:00.000Z",
          technicianIds: [5890, 57387153],
        },
      ],
    });
  });

  it("keeps optional appointment fields optional and strips unsupported extras", async () => {
    const { post, handlers } = createContext();

    await getHandler(handlers, "dispatch_jobs_create")({
      customerId: 30118932,
      locationId: 32126671,
      businessUnitId: 26835039,
      jobTypeId: 57477915,
      campaignId: 56079032,
      priority: "Normal",
      appointments: [
        {
          start: "2026-07-06T14:00:00.000Z",
          end: "2026-07-06T18:00:00.000Z",
          specialInstructions: "Leave at side gate",
        },
      ],
    });

    expect(post).toHaveBeenCalledWith("/tenant/{tenant}/jobs", {
      customerId: 30118932,
      locationId: 32126671,
      businessUnitId: 26835039,
      jobTypeId: 57477915,
      campaignId: 56079032,
      priority: "Normal",
      appointments: [
        {
          start: "2026-07-06T14:00:00.000Z",
          end: "2026-07-06T18:00:00.000Z",
        },
      ],
    });
  });

  it("rejects job creation without required fields", async () => {
    const { post, handlers } = createContext();

    await expect(
      getHandler(handlers, "dispatch_jobs_create")({
        customerId: 30118932,
        locationId: 32126671,
        businessUnitId: 26835039,
        jobTypeId: 57477915,
        campaignId: 56079032,
      }),
    ).rejects.toThrow("appointments");

    expect(post).not.toHaveBeenCalled();
  });
});
