import { describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ServiceTitanConfig } from "../../src/config.js";
import { loadDispatchDomain } from "../../src/domains/dispatch/index.js";
import { loadEstimatesDomain } from "../../src/domains/estimates/index.js";
import type { DomainLoader } from "../../src/registry.js";
import { ToolRegistry } from "../../src/registry.js";
import type { ToolResponse } from "../../src/types.js";

function createConfig(overrides: Partial<ServiceTitanConfig> = {}): ServiceTitanConfig {
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
    allowedCallers: null,
    ...overrides,
  };
}

interface DomainContext {
  getMock: ReturnType<typeof vi.fn>;
  postMock: ReturnType<typeof vi.fn>;
  patchMock: ReturnType<typeof vi.fn>;
  deleteMock: ReturnType<typeof vi.fn>;
  deleteWithBodyMock: ReturnType<typeof vi.fn>;
  handlers: Map<string, (params: unknown) => Promise<ToolResponse>>;
}

function createContext(loader: DomainLoader): DomainContext {
  const server = { tool: vi.fn() };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const registry = new ToolRegistry(server as any, createConfig(), logger as any);
  const getMock = vi.fn().mockResolvedValue({ ok: true });
  const postMock = vi.fn().mockResolvedValue({ ok: true });
  const patchMock = vi.fn().mockResolvedValue({ ok: true });
  const deleteMock = vi.fn().mockResolvedValue({ ok: true });
  const deleteWithBodyMock = vi.fn().mockResolvedValue({ ok: true });
  const client = {
    get: getMock,
    post: postMock,
    patch: patchMock,
    delete: deleteMock,
    deleteWithBody: deleteWithBodyMock,
  } as unknown as ServiceTitanClient;

  registry.attachClient(client);
  loader(client, registry);

  const handlers = new Map<string, (params: unknown) => Promise<ToolResponse>>();
  for (const [name, _schema, handler] of server.tool.mock.calls) {
    handlers.set(name as string, handler as (params: unknown) => Promise<ToolResponse>);
  }

  return {
    getMock,
    postMock,
    patchMock,
    deleteMock,
    deleteWithBodyMock,
    handlers,
  };
}

function handler(
  handlers: Map<string, (params: unknown) => Promise<ToolResponse>>,
  toolName: string,
): (params: unknown) => Promise<ToolResponse> {
  const found = handlers.get(toolName);
  if (!found) {
    throw new Error(`Missing handler for ${toolName}`);
  }
  return found;
}

describe("ST-77 dispatch refresh", () => {
  it("dispatch_jobs_list forwards the equipmentIds filter", async () => {
    const { handlers, getMock } = createContext(loadDispatchDomain);

    await handler(handlers, "dispatch_jobs_list")({
      equipmentIds: "1001,1002",
    });

    expect(getMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/jobs",
      expect.objectContaining({
        equipmentIds: "1001,1002",
      }),
    );
  });

  it("dispatch_jobs_update forwards summaryOfWork", async () => {
    const { handlers, patchMock } = createContext(loadDispatchDomain);

    await handler(handlers, "dispatch_jobs_update")({
      id: 123,
      summaryOfWork: "Replaced capacitor and verified startup.",
    });

    expect(patchMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/jobs/123",
      expect.objectContaining({
        summaryOfWork: "Replaced capacitor and verified startup.",
      }),
    );
  });

  it("registers guarded job equipment attach and detach tools", async () => {
    const { handlers, postMock, deleteMock, deleteWithBodyMock } =
      createContext(loadDispatchDomain);

    await handler(handlers, "dispatch_jobs_equipment_attach")({
      id: 123,
      equipmentIds: [10, 11],
    });

    expect(postMock).toHaveBeenCalledWith("/tenant/{tenant}/jobs/123/equipment", {
      equipmentIds: [10, 11],
    });

    const preview = await handler(handlers, "dispatch_jobs_equipment_detach_bulk")({
      id: 123,
      equipmentIds: [10, 11],
    });

    expect(preview.isError).not.toBe(true);
    expect(deleteWithBodyMock).not.toHaveBeenCalled();

    await handler(handlers, "dispatch_jobs_equipment_detach_bulk")({
      id: 123,
      equipmentIds: [10, 11],
      confirm: true,
    });

    expect(deleteWithBodyMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/jobs/123/equipment",
      {
        equipmentIds: [10, 11],
      },
    );

    await handler(handlers, "dispatch_jobs_equipment_detach")({
      id: 123,
      equipmentId: 10,
      confirm: true,
    });

    expect(deleteMock).toHaveBeenCalledWith("/tenant/{tenant}/jobs/123/equipment/10");
  });

  it("dispatch_appointments_set_summary posts the ST-77 appointment summary body", async () => {
    const { handlers, postMock } = createContext(loadDispatchDomain);

    await handler(handlers, "dispatch_appointments_set_summary")({
      id: 456,
      notes: "Completed diagnostic summary.",
      technicianId: 789,
    });

    expect(postMock).toHaveBeenCalledWith("/tenant/{tenant}/appointments/456/summaries", {
      notes: "Completed diagnostic summary.",
      technicianId: 789,
    });
  });

  it("dispatch_job_types_update supports custom field update mode", async () => {
    const { handlers, patchMock } = createContext(loadDispatchDomain);

    await handler(handlers, "dispatch_job_types_update")({
      id: 99,
      customFieldTypeIds: [1, 2],
      customFieldsUpdateMode: "Merge",
    });

    expect(patchMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/job-types/99",
      expect.objectContaining({
        customFieldTypeIds: [1, 2],
        customFieldsUpdateMode: "Merge",
      }),
    );
  });
});

describe("ST-77.2 Sales template refresh", () => {
  it("lists and updates estimate templates", async () => {
    const { handlers, getMock, patchMock } = createContext(loadEstimatesDomain);

    await handler(handlers, "estimates_estimate_templates_list")({
      active: "Any",
      modifiedOnOrAfter: "2026-05-01T00:00:00Z",
      pageSize: 25,
    });

    expect(getMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/estimate-templates",
      expect.objectContaining({
        active: "Any",
        modifiedOnOrAfter: "2026-05-01T00:00:00Z",
        pageSize: 25,
      }),
    );

    await handler(handlers, "estimates_estimate_templates_update")({
      id: 321,
      items: [
        {
          skuId: 111,
          skuType: "Service",
          quantity: 1,
          isAddOn: false,
        },
      ],
    });

    expect(patchMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/estimate-templates/321",
      expect.objectContaining({
        items: [
          {
            skuId: 111,
            skuType: "Service",
            quantity: 1,
            isAddOn: false,
          },
        ],
      }),
    );
  });

  it("updates proposal templates with full-replace fields preserved as explicit arrays", async () => {
    const { handlers, patchMock } = createContext(loadEstimatesDomain);

    await handler(handlers, "estimates_proposal_templates_update")({
      id: 654,
      businessUnitIds: [],
      estimateAssignments: [],
    });

    expect(patchMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/proposal-templates/654",
      expect.objectContaining({
        businessUnitIds: [],
        estimateAssignments: [],
      }),
    );
  });

  it("lists proposal types", async () => {
    const { handlers, getMock } = createContext(loadEstimatesDomain);

    await handler(handlers, "estimates_proposal_types_list")({
      active: "Any",
    });

    expect(getMock).toHaveBeenCalledWith("/tenant/{tenant}/proposal-types", {
      active: "Any",
    });
  });
});
