import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceTitanConfig } from "../src/config.js";
import { ENVIRONMENTS, ServiceTitanClient } from "../src/client.js";

const mockAxiosPost = vi.hoisted(() => vi.fn());
const mockAxiosCreate = vi.hoisted(() => vi.fn());
const mockAxiosIsAxiosError = vi.hoisted(
  () => (error: unknown): boolean => Boolean((error as { isAxiosError?: boolean })?.isAxiosError),
);

vi.mock("axios", () => {
  const mockAxios = {
    create: mockAxiosCreate,
    post: mockAxiosPost,
    isAxiosError: mockAxiosIsAxiosError,
  };

  return {
    default: mockAxios,
    create: mockAxiosCreate,
    post: mockAxiosPost,
    isAxiosError: mockAxiosIsAxiosError,
  };
});

interface AxiosQueueSuccess {
  type: "resolve";
  value: Record<string, unknown>;
}

interface AxiosQueueError {
  type: "reject";
  error: unknown;
}

type AxiosQueueItem = AxiosQueueSuccess | AxiosQueueError;

function createAxiosInstanceMock() {
  const queue: AxiosQueueItem[] = [];
  const requestInterceptors: Array<(config: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>> = [];
  const responseSuccessInterceptors: Array<(response: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>> = [];
  const responseErrorInterceptors: Array<((error: unknown) => Promise<unknown> | unknown) | undefined> = [];

  const executeRequest = async (inputConfig: Record<string, unknown>): Promise<unknown> => {
    let config = inputConfig;

    for (const interceptor of requestInterceptors) {
      config = await interceptor(config);
    }

    const queued = queue.shift();

    if (!queued) {
      throw new Error("No queued axios response for request");
    }

    if (queued.type === "reject") {
      let error = queued.error;

      if (typeof error === "object" && error !== null && !("config" in error)) {
        (error as { config: Record<string, unknown> }).config = config;
      }

      for (const interceptor of responseErrorInterceptors) {
        if (!interceptor) {
          continue;
        }

        try {
          return await interceptor(error);
        } catch (nextError) {
          error = nextError;
        }
      }

      throw error;
    }

    let response: Record<string, unknown> = {
      ...queued.value,
      config,
    };

    for (const interceptor of responseSuccessInterceptors) {
      response = await interceptor(response);
    }

    return response;
  };

  const request = vi.fn((config: Record<string, unknown>) => executeRequest(config));

  const instance = {
    request,
    interceptors: {
      request: {
        use: vi.fn((fulfilled: (config: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>) => {
          requestInterceptors.push(fulfilled);
          return requestInterceptors.length - 1;
        }),
      },
      response: {
        use: vi.fn(
          (
            fulfilled: (response: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>,
            rejected?: (error: unknown) => Promise<unknown> | unknown,
          ) => {
            responseSuccessInterceptors.push(fulfilled ?? ((response: Record<string, unknown>) => response));
            responseErrorInterceptors.push(rejected);
            return responseSuccessInterceptors.length - 1;
          },
        ),
      },
    },
    queueResolve(value: Record<string, unknown>) {
      queue.push({ type: "resolve", value });
    },
    queueReject(error: unknown) {
      queue.push({ type: "reject", error });
    },
  };

  return instance;
}

function createConfig(
  environment: ServiceTitanConfig["environment"] = "integration",
): ServiceTitanConfig {
  return {
    clientId: "client-id",
    clientSecret: "client-secret",
    appKey: "app-key",
    tenantId: "tenant-42",
    environment,
    readonlyMode: true,
    confirmWrites: false,
    maxResponseChars: 100000,
    enabledDomains: null,
    logLevel: "info",
    timezone: "UTC",
    allowedCallers: null,
  };
}

describe("ServiceTitanClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["integration", ENVIRONMENTS.integration.authUrl],
    ["production", ENVIRONMENTS.production.authUrl],
  ] as const)("uses correct auth URL for %s environment", async (environment, expectedAuthUrl) => {
    const http = createAxiosInstanceMock();
    mockAxiosCreate.mockReturnValue(http);
    mockAxiosPost.mockResolvedValue({
      data: {
        access_token: "token-1",
        expires_in: 3600,
      },
    });

    http.queueResolve({
      data: { ok: true },
      status: 200,
    });

    const client = new ServiceTitanClient(createConfig(environment));
    await client.get("/crm/v2/tenant/{tenant}/customers");

    expect(mockAxiosPost).toHaveBeenCalledWith(
      `${expectedAuthUrl}/connect/token`,
      expect.any(String),
      expect.objectContaining({
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }),
    );
  });

  it("caches and reuses token when not expired", async () => {
    const http = createAxiosInstanceMock();
    mockAxiosCreate.mockReturnValue(http);
    mockAxiosPost.mockResolvedValue({
      data: {
        access_token: "token-1",
        expires_in: 3600,
      },
    });

    http.queueResolve({ data: { first: true }, status: 200 });
    http.queueResolve({ data: { second: true }, status: 200 });

    const client = new ServiceTitanClient(createConfig());

    await client.get("/crm/v2/tenant/{tenant}/customers");
    await client.get("/crm/v2/tenant/{tenant}/customers");

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
  });

  it("refreshes token when expired", async () => {
    const http = createAxiosInstanceMock();
    mockAxiosCreate.mockReturnValue(http);
    mockAxiosPost
      .mockResolvedValueOnce({
        data: {
          access_token: "token-1",
          expires_in: 1,
        },
      })
      .mockResolvedValueOnce({
        data: {
          access_token: "token-2",
          expires_in: 3600,
        },
      });

    http.queueResolve({ data: { first: true }, status: 200 });
    http.queueResolve({ data: { second: true }, status: 200 });

    const client = new ServiceTitanClient(createConfig());

    await client.get("/crm/v2/tenant/{tenant}/customers");
    await client.get("/crm/v2/tenant/{tenant}/customers");

    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
  });

  it("replaces {tenant} placeholder in request path", async () => {
    const http = createAxiosInstanceMock();
    mockAxiosCreate.mockReturnValue(http);
    mockAxiosPost.mockResolvedValue({
      data: {
        access_token: "token-1",
        expires_in: 3600,
      },
    });

    http.queueResolve({ data: { ok: true }, status: 200 });

    const client = new ServiceTitanClient(createConfig());
    await client.get("/crm/v2/tenant/{tenant}/customers");

    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/crm/v2/tenant/tenant-42/customers",
      }),
    );
  });

  it("preserves explicit Forms API job attachment paths", async () => {
    const http = createAxiosInstanceMock();
    mockAxiosCreate.mockReturnValue(http);
    mockAxiosPost.mockResolvedValue({
      data: {
        access_token: "token-1",
        expires_in: 3600,
      },
    });

    http.queueResolve({ data: { ok: true }, status: 200 });

    const client = new ServiceTitanClient(createConfig());
    await client.get("/forms/v2/tenant/{tenant}/jobs/80233717/attachments");

    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/forms/v2/tenant/tenant-42/jobs/80233717/attachments",
      }),
    );
    expect(http.request).not.toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/jpm/"),
      }),
    );
  });

  it("supports DELETE requests with a JSON body", async () => {
    const http = createAxiosInstanceMock();
    mockAxiosCreate.mockReturnValue(http);
    mockAxiosPost.mockResolvedValue({
      data: {
        access_token: "token-1",
        expires_in: 3600,
      },
    });

    http.queueResolve({ data: { ok: true }, status: 200 });

    const client = new ServiceTitanClient(createConfig());
    await client.deleteWithBody("/tenant/{tenant}/jobs/123/equipment", {
      equipmentIds: [10, 11],
    });

    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "delete",
        url: "/jpm/v2/tenant/tenant-42/jobs/123/equipment",
        data: {
          equipmentIds: [10, 11],
        },
      }),
    );
  });

  it("sets auth headers on requests", async () => {
    const http = createAxiosInstanceMock();
    mockAxiosCreate.mockReturnValue(http);
    mockAxiosPost.mockResolvedValue({
      data: {
        access_token: "token-1",
        expires_in: 3600,
      },
    });

    http.queueResolve({ data: { ok: true }, status: 200 });

    const client = new ServiceTitanClient(createConfig());
    await client.get("/crm/v2/tenant/{tenant}/customers");

    const requestConfig = http.request.mock.calls[0]?.[0] as {
      headers: Record<string, string>;
    };

    expect(requestConfig.headers).toMatchObject({
      Authorization: "Bearer token-1",
      "ST-App-Key": "app-key",
    });
  });

  it("sanitizes error responses without leaking tokens", async () => {
    const http = createAxiosInstanceMock();
    mockAxiosCreate.mockReturnValue(http);
    mockAxiosPost.mockResolvedValue({
      data: {
        access_token: "token-1",
        expires_in: 3600,
      },
    });

    http.queueReject({
      isAxiosError: true,
      message: "Request failed with status code 500",
      response: {
        status: 500,
        data: {
          message: "ServiceTitan exploded",
          access_token: "secret-token",
        },
      },
    });

    const client = new ServiceTitanClient(createConfig());

    try {
      await client.get("/crm/v2/tenant/{tenant}/customers");
      throw new Error("Expected request to throw");
    } catch (error) {
      expect(error).toMatchObject({
        status: 500,
        message: "ServiceTitan exploded",
        path: "/crm/v2/tenant/tenant-42/customers",
      });

      expect(JSON.stringify(error)).not.toContain("secret-token");
      expect(String(error)).not.toContain("secret-token");
    }
  });

  it("surfaces field-level reasons from ST validation errors", async () => {
    const http = createAxiosInstanceMock();
    mockAxiosCreate.mockReturnValue(http);
    mockAxiosPost.mockResolvedValue({
      data: { access_token: "token-1", expires_in: 3600 },
    });

    // Real ST 400 shape, taken verbatim from POST /technician-shifts with a
    // payload missing required fields.
    http.queueReject({
      isAxiosError: true,
      message: "Request failed with status code 400",
      response: {
        status: 400,
        data: {
          errors: {
            body: ["The body field is required."],
            repeatType: ["Required property 'repeatType' not found in JSON."],
            technicianIds: ["Required property 'technicianIds' not found in JSON."],
          },
          title: "One or more validation errors occurred.",
          status: 400,
          traceId: "9f26e02b89596d5c-MIA",
        },
      },
    });

    const client = new ServiceTitanClient(createConfig());

    try {
      await client.post("/dispatch/v2/tenant/{tenant}/technician-shifts", {});
      throw new Error("Expected request to throw");
    } catch (error) {
      const message = (error as { message: string }).message;
      expect(message).toContain("One or more validation errors occurred.");
      expect(message).toContain("body: The body field is required.");
      expect(message).toContain("repeatType:");
      expect(message).toContain("technicianIds:");
    }
  });

  it("surfaces title + detail for non-validation ST errors", async () => {
    const http = createAxiosInstanceMock();
    mockAxiosCreate.mockReturnValue(http);
    mockAxiosPost.mockResolvedValue({
      data: { access_token: "token-1", expires_in: 3600 },
    });

    http.queueReject({
      isAxiosError: true,
      message: "Request failed with status code 404",
      response: {
        status: 404,
        data: {
          title: "Resource not found",
          detail: "Customer 999999 does not exist in tenant 42",
          status: 404,
        },
      },
    });

    const client = new ServiceTitanClient(createConfig());

    try {
      await client.get("/crm/v2/tenant/{tenant}/customers/999999");
      throw new Error("Expected request to throw");
    } catch (error) {
      expect((error as { message: string }).message).toBe(
        "Resource not found — Customer 999999 does not exist in tenant 42",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Route table drift detection
// ---------------------------------------------------------------------------

describe("Route table drift detection", () => {
  /**
   * Walk a directory tree and return all .ts file paths.
   */
  function walkTs(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...walkTs(full));
      } else if (entry.isFile() && full.endsWith(".ts")) {
        out.push(full);
      }
    }
    return out;
  }

  /**
   * Extract the first path segment from a `/tenant/{tenant}/...` API path.
   * For export paths, extracts up to two segments to handle nested resources
   * like `/export/customers/contacts`.
   */
  function extractResourcePrefix(apiPath: string): { resource: string; isExport: boolean } | null {
    // Strip optional /v2 or /v3 prefix
    const normalized = apiPath.replace(/^\/v\d+/, "");

    // Export paths: /tenant/{tenant}/export/<resource>[/<sub>]
    const exportMatch = normalized.match(/^\/tenant\/\{tenant\}\/export\/(.+)$/);
    if (exportMatch) {
      // Keep up to 2 segments for nested exports like customers/contacts
      const parts = exportMatch[1].split("/").filter(Boolean);
      // If the second segment looks like a sub-resource name (not a param), include it
      const resource =
        parts.length >= 2 && !parts[1].startsWith("$")
          ? "/" + parts.slice(0, 2).join("/")
          : "/" + parts[0];
      return { resource, isExport: true };
    }

    // Regular paths: /tenant/{tenant}/<resource>/...
    const regularMatch = normalized.match(/^\/tenant\/\{tenant\}\/(.+)$/);
    if (regularMatch) {
      const firstSegment = regularMatch[1].split("/")[0];
      return { resource: "/" + firstSegment, isExport: false };
    }

    return null;
  }

  // Read source files to extract both tables
  const clientSrc = readFileSync(join(__dirname, "../src/client.ts"), "utf8");

  function parseTable(name: string): Set<string> {
    const regex = new RegExp(
      `const ${name}: Record<string, string> = \\{([\\s\\S]*?)\\n\\};`,
    );
    const match = clientSrc.match(regex);
    if (!match) return new Set();
    const entries = [...match[1].matchAll(/"([^"]+)":\s*"/g)].map((m) => m[1]);
    return new Set(entries);
  }

  const routeTable = parseTable("ROUTE_TABLE");
  const exportRouteTable = parseTable("EXPORT_ROUTE_TABLE");

  // Scan all domain files for API call patterns
  const domainsDir = join(__dirname, "../src/domains");
  const domainFiles = walkTs(domainsDir);
  const callPattern =
    /client\.(?:get|post|put|patch|delete|deleteWithBody)\(\s*["`](\/(v\d+\/)?tenant\/\{tenant\}\/[^"`]+)["`]/g;

  const missingRegular = new Map<string, string>();
  const missingExport = new Map<string, string>();

  for (const file of domainFiles) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(callPattern)) {
      const parsed = extractResourcePrefix(match[1]);
      if (!parsed) continue;

      if (parsed.isExport) {
        if (!exportRouteTable.has(parsed.resource)) {
          missingExport.set(parsed.resource, file);
        }
      } else {
        if (!routeTable.has(parsed.resource)) {
          missingRegular.set(parsed.resource, file);
        }
      }
    }
  }

  // Also check registerExportTool calls in exporters.ts
  const exportersPath = join(domainsDir, "export/exporters.ts");
  if (statSync(exportersPath, { throwIfNoEntry: false })) {
    const exportersSrc = readFileSync(exportersPath, "utf8");
    const exportToolPattern =
      /registerExportTool\([^,]+,[^,]+,[^,]+,[^,]+,\s*"\/tenant\/\{tenant\}\/export\/([^"]+)"/g;
    for (const match of exportersSrc.matchAll(exportToolPattern)) {
      const parts = match[1].split("/").filter(Boolean);
      const resource =
        parts.length >= 2 && !parts[1].startsWith("$")
          ? "/" + parts.slice(0, 2).join("/")
          : "/" + parts[0];
      if (!exportRouteTable.has(resource)) {
        missingExport.set(resource, exportersPath);
      }
    }
  }

  it("ROUTE_TABLE covers all regular API paths used in domain files", () => {
    if (missingRegular.size > 0) {
      const details = [...missingRegular.entries()]
        .map(([resource, file]) => `  ${resource} (used in ${file})`)
        .join("\n");
      expect.fail(
        `ROUTE_TABLE is missing ${missingRegular.size} entries:\n${details}\n\nAdd them to ROUTE_TABLE in src/client.ts`,
      );
    }
  });

  it("EXPORT_ROUTE_TABLE covers all export API paths used in domain files", () => {
    if (missingExport.size > 0) {
      const details = [...missingExport.entries()]
        .map(([resource, file]) => `  ${resource} (used in ${file})`)
        .join("\n");
      expect.fail(
        `EXPORT_ROUTE_TABLE is missing ${missingExport.size} entries:\n${details}\n\nAdd them to EXPORT_ROUTE_TABLE in src/client.ts`,
      );
    }
  });
});
