import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ServiceTitanConfig } from "../../src/config.js";
import { loadSchedulingDomain } from "../../src/domains/scheduling/index.js";
import { ToolRegistry } from "../../src/registry.js";
import type { ToolResponse } from "../../src/types.js";

interface SchedulingTestContext {
  postMock: ReturnType<typeof vi.fn>;
  handlers: Map<string, (params: unknown) => Promise<ToolResponse>>;
  schemas: Map<string, Record<string, z.ZodTypeAny>>;
}

function createConfig(overrides: Partial<ServiceTitanConfig> = {}): ServiceTitanConfig {
  return {
    clientId: "client-id",
    clientSecret: "client-secret",
    appKey: "app-key",
    tenantId: "tenant-id",
    environment: "integration",
    readonlyMode: false, experimentalWrites: true,
    confirmWrites: false,
    maxResponseChars: 100_000,
    enabledDomains: null,
    logLevel: "error",
    timezone: "UTC",
    corsOrigin: "",
    allowedCallers: null,
    ...overrides,
  };
}

function createSchedulingContext(): SchedulingTestContext {
  const server = { registerTool: vi.fn() };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const registry = new ToolRegistry(server as any, createConfig(), logger as any);
  const postMock = vi.fn();
  const client = {
    get: vi.fn(),
    post: postMock,
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as ServiceTitanClient;

  registry.attachClient(client);
  registry.registerDomain("scheduling", loadSchedulingDomain);

  const handlers = new Map<string, (params: unknown) => Promise<ToolResponse>>();
  const schemas = new Map<string, Record<string, z.ZodTypeAny>>();

  for (const [name, config, handler] of server.registerTool.mock.calls) {
    handlers.set(name as string, handler as (params: unknown) => Promise<ToolResponse>);
    schemas.set(name as string, config.inputSchema as Record<string, z.ZodTypeAny>);
  }

  return { postMock, handlers, schemas };
}

describe("scheduling appointment assignments", () => {
  it("assign technicians schema matches ServiceTitan's one-appointment/many-technicians payload", () => {
    const { schemas } = createSchedulingContext();
    const schema = z.object(
      schemas.get("scheduling_appointment_assignments_assign_technicians") ?? {},
    );

    expect(
      schema.safeParse({
        jobAppointmentId: 80814704,
        technicianIds: [26835299],
      }).success,
    ).toBe(true);

    expect(
      schema.safeParse({
        assignments: [{ appointmentId: 80814704, technicianId: 26835299 }],
      }).success,
    ).toBe(false);
  });

  it("posts jobAppointmentId and technicianIds directly to the assign-technicians endpoint", async () => {
    const { handlers, postMock } = createSchedulingContext();
    const handler = handlers.get("scheduling_appointment_assignments_assign_technicians");

    if (!handler) {
      throw new Error("Missing scheduling_appointment_assignments_assign_technicians handler");
    }

    postMock.mockResolvedValue({ id: 80814704 });

    await handler({
      jobAppointmentId: 80814704,
      technicianIds: [26835299],
      _confirmed: true,
    });

    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/appointment-assignments/assign-technicians",
      {
        jobAppointmentId: 80814704,
        technicianIds: [26835299],
      },
    );
  });
});
