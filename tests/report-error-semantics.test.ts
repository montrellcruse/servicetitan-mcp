import { AxiosError, CanceledError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { describe, expect, it, vi } from "vitest";

import { ServiceTitanClient, ServiceTitanApiError } from "../src/client.js";
import { loadConfig } from "../src/config.js";
import { executeReport } from "../src/domains/intelligence/report-executor.js";
import { registerReportTools } from "../src/domains/reporting/reports.js";
import { withRequestContext } from "../src/request-context.js";
import type { ToolRegistry } from "../src/registry.js";
import type { ToolResponse } from "../src/types.js";

const reportPath = "/tenant/{tenant}/report-category/accounting/reports/166/data";
const resolvedReportPath = "/reporting/v2/tenant/42/report-category/accounting/reports/166/data";
const reportParameters = [{ name: "From", value: "2026-01-01" }, { name: "To", value: "2026-01-01" }];

const config = () => loadConfig({
  ST_CLIENT_ID: "test-client",
  ST_CLIENT_SECRET: "test-secret",
  ST_APP_KEY: "test-key",
  ST_TENANT_ID: "42",
});
const response = (request: InternalAxiosRequestConfig, data: unknown, status = 200) => ({
  config: request, data, status, statusText: String(status), headers: {},
});
const rejection = (request: InternalAxiosRequestConfig, status: number) => new AxiosError(
  `HTTP ${status}`,
  "ERR_BAD_RESPONSE",
  request,
  undefined,
  response(request, { title: "Synthetic report failure", traceId: "report-trace" }, status),
);
const tokenAdapter: AxiosAdapter = async (request) => response(request, { access_token: "test-token", expires_in: 900 });
const clientWith = (adapter: AxiosAdapter) => new ServiceTitanClient(config(), { adapter, authAdapter: tokenAdapter });

async function capture(promise: Promise<unknown>): Promise<ServiceTitanApiError> {
  try {
    await promise;
    throw new Error("Expected request to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceTitanApiError);
    return error as ServiceTitanApiError;
  }
}

describe("readonly report POST error semantics", () => {
  it.each([
    ["timeout", 0, (request: InternalAxiosRequestConfig) => new AxiosError("timeout", "ECONNABORTED", request)],
    ["503", 503, (request: InternalAxiosRequestConfig) => rejection(request, 503)],
  ] as const)("classifies a report %s as retryable without uncertain-write metadata or replay", async (_name, status, failure) => {
    let attempts = 0;
    const client = clientWith(async (request) => { attempts += 1; throw failure(request); });

    const error = await capture(client.post(reportPath, { parameters: reportParameters }, { page: 1, pageSize: 1 }));

    expect(error).toMatchObject({ status, path: resolvedReportPath, details: { phase: "resource", retryable: true } });
    expect(error.details.outcomeUnknown).toBeUndefined();
    expect(error.message).not.toContain("write may have completed");
    expect(attempts).toBe(1);
    expect(client.getMetrics().resourceAttempts).toBe(1);
  });

  it("preserves cancellation as non-retryable and never dispatches a second report request", async () => {
    let attempts = 0;
    const started = Promise.withResolvers<void>();
    const client = clientWith(async (request) => {
      attempts += 1;
      started.resolve();
      await new Promise<void>((_resolve, reject) => {
        request.signal?.addEventListener("abort", () => reject(new CanceledError("cancelled", request)), { once: true });
      });
      throw new Error("unreachable");
    });
    const controller = new AbortController();
    const pending = withRequestContext({ signal: controller.signal }, () =>
      client.post(reportPath, { parameters: reportParameters }, { page: 1, pageSize: 1 }),
    );
    await started.promise;
    controller.abort();

    const error = await capture(pending);
    expect(error).toMatchObject({ status: 0, path: resolvedReportPath, details: { code: "CANCELLED", retryable: false } });
    expect(error.details.outcomeUnknown).toBeUndefined();
    expect(attempts).toBe(1);
  });

  it("keeps report page context and API metadata through the intelligence executor", async () => {
    let attempts = 0;
    const client = clientWith(async (request) => { attempts += 1; throw rejection(request, 503); });

    const error = await capture(executeReport(client, "166", reportParameters, undefined, { cooldownMs: 0, pageSize: 1 }));

    expect(error).toMatchObject({ status: 503, path: resolvedReportPath, details: { retryable: true, traceId: "report-trace" } });
    expect(error.message).toContain("Report 166 page 1 failed");
    expect(error.details.outcomeUnknown).toBeUndefined();
    expect(attempts).toBe(1);
  });

  it("exposes the same safe metadata from the generic reporting MCP tool", async () => {
    const client = clientWith(async (request) => { throw rejection(request, 503); });
    const handlers = new Map<string, (params: unknown) => Promise<ToolResponse>>();
    const registry = { register: vi.fn((tool) => handlers.set(tool.name, tool.handler)) } as unknown as ToolRegistry;
    registerReportTools(client, registry);

    const result = await handlers.get("reporting_reports_data_create")!({
      reportCategory: "accounting", reportId: 166, parameters: reportParameters, page: 1, pageSize: 1,
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: {
      status: 503, path: resolvedReportPath, phase: "resource", traceId: "report-trace", retryable: true,
    } });
    expect(result.structuredContent).not.toHaveProperty("error.outcomeUnknown");
    expect(result.content[0]?.text).not.toContain("write may have completed");
  });

  it("continues to treat an ordinary mutation failure as uncertain and unsafe to retry", async () => {
    let attempts = 0;
    const client = clientWith(async (request) => { attempts += 1; throw rejection(request, 503); });

    const error = await capture(client.post("/tenant/{tenant}/customers", { name: "Synthetic" }));

    expect(error.details).toMatchObject({ retryable: false, outcomeUnknown: true });
    expect(error.message).toContain("write may have completed");
    expect(attempts).toBe(1);
  });
});
