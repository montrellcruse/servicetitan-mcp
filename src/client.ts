import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

import type { ServiceTitanConfig } from "./config.js";
import { buildParams } from "./utils.js";

const TOKEN_EXPIRY_BUFFER_MS = 60_000;

/**
 * Maps resource path segments to their ServiceTitan API module prefix.
 * ST production API requires: /{module}/v2/tenant/{id}/{resource}
 */
const ROUTE_TABLE: Record<string, string> = {
  // CRM
  "/customers": "crm",
  "/contacts": "crm",
  "/leads": "crm",
  "/locations": "crm",
  "/bookings": "crm",
  "/booking-provider": "crm",
  "/booking-provider-tags": "crm",
  "/tags": "crm",

  // Job Planning & Management (dispatch/jobs)
  "/jobs": "jpm",
  "/appointments": "jpm",
  "/job-cancel-reasons": "jpm",
  "/job-hold-reasons": "jpm",
  "/job-types": "jpm",
  "/projects": "jpm",
  "/project-types": "jpm",
  "/project-statuses": "jpm",
  "/project-substatuses": "jpm",
  "/technicians": "settings",
  "/images": "jpm",
  "/installed-equipment": "jpm",

  // Dispatch
  "/appointment-assignments": "dispatch",
  "/arrival-windows": "dispatch",
  "/capacity": "dispatch",
  "/non-job-appointments": "dispatch",
  "/gps-provider": "dispatch",
  "/teams": "dispatch",
  "/zones": "dispatch",

  // Accounting
  "/invoices": "accounting",
  "/invoice-items": "accounting",
  "/payments": "accounting",
  "/ap-credits": "accounting",
  "/ap-payments": "accounting",
  "/gl-accounts": "accounting",
  "/journal-entries": "accounting",
  "/payment-terms": "accounting",
  "/payment-types": "accounting",
  "/tax-zones": "accounting",

  // Estimates / Sales
  "/estimates": "sales",

  // Pricebook
  "/services": "pricebook",
  "/materials": "pricebook",
  "/materialsmarkup": "pricebook",
  "/equipment": "pricebook",
  "/categories": "pricebook",
  "/discounts": "pricebook",
  "/discounts-and-fees": "pricebook",
  "/pricebook": "pricebook",

  // Payroll
  "/payrolls": "payroll",
  "/payroll-adjustments": "payroll",
  "/payroll-settings": "payroll",
  "/gross-pay-items": "payroll",
  "/timesheet-codes": "payroll",
  "/timesheets": "payroll",
  "/non-job-timesheets": "payroll",
  "/splits": "payroll",

  // Memberships
  "/memberships": "memberships",
  "/membership-types": "memberships",
  "/service-agreements": "memberships",
  "/recurring-services": "memberships",
  "/recurring-service-types": "memberships",
  "/recurring-service-events": "memberships",

  // Marketing
  "/campaigns": "marketing",
  "/costs": "marketing",
  "/attributed-leads": "marketing",
  "/external-call-attributions": "marketing",
  "/job-attributions": "marketing",
  "/web-booking-attributions": "marketing",
  "/web-lead-form-attributions": "marketing",
  "/clientspecificpricing": "marketing",
  "/reviews": "marketing",
  "/suppressions": "marketing",
  "/submissions": "marketing",

  // Marketing - Telecom (calls)
  "/calls": "telecom",
  "/call-reasons": "telecom",

  // Inventory
  "/purchase-orders": "inventory",
  "/purchase-order-types": "inventory",
  "/purchase-order-markups": "inventory",
  "/vendors": "inventory",
  "/warehouses": "inventory",
  "/adjustments": "inventory",
  "/transfers": "inventory",
  "/receipts": "inventory",
  "/returns": "inventory",
  "/return-types": "inventory",

  // Reporting
  "/report-categories": "reporting",
  "/report-category": "reporting",
  "/dynamic-value-sets": "reporting",
  "/data": "reporting",

  // Settings
  "/business-units": "settings",
  "/employees": "settings",
  "/tag-types": "settings",
  "/user-roles": "settings",
  "/activities": "settings",
  "/activity-categories": "settings",
  "/activity-types": "settings",
  "/business-hours": "settings",
  "/performance": "settings",
  "/schedulers": "settings",
  "/technician-rating": "settings",
  "/technician-shifts": "settings",
  "/trucks": "settings",
  "/tasks": "task-management",

  // Forms
  "/forms": "forms",

  // Opt-in/out (marketing v3)
  "/optinouts": "marketing",
};

/**
 * For /tenant/{id}/export/{resource} paths, maps the resource to its API module.
 * Export endpoints live under their parent domain: /{module}/v2/tenant/{id}/export/{resource}
 */
const EXPORT_ROUTE_TABLE: Record<string, string> = {
  "/customers": "crm",
  "/customers/contacts": "crm",
  "/contacts": "crm",
  "/leads": "crm",
  "/locations": "crm",
  "/locations/contacts": "crm",
  "/bookings": "crm",
  "/jobs": "jpm",
  "/job-notes": "jpm",
  "/job-history": "jpm",
  "/job-canceled-logs": "jpm",
  "/jobs/splits": "jpm",
  "/appointments": "jpm",
  "/appointment-assignments": "dispatch",
  "/job-types": "jpm",
  "/projects": "jpm",
  "/project-notes": "jpm",
  "/job-cancel-reasons": "jpm",
  "/installed-equipment": "jpm",
  "/invoices": "accounting",
  "/invoice-items": "accounting",
  "/invoice-templates": "accounting",
  "/payments": "accounting",
  "/inventory-bills": "accounting",
  "/estimates": "sales",
  "/estimate-items": "sales",
  "/services": "pricebook",
  "/materials": "pricebook",
  "/equipment": "pricebook",
  "/campaigns": "marketing",
  "/calls": "telecom",
  "/membership-types": "memberships",
  "/memberships": "memberships",
  "/membership-status-changes": "memberships",
  "/service-agreements": "memberships",
  "/recurring-services": "memberships",
  "/recurring-service-types": "memberships",
  "/location-recurring-services": "memberships",
  "/location-recurring-service-events": "memberships",
  "/purchase-orders": "inventory",
  "/returns": "inventory",
  "/transfers": "inventory",
  "/vendors": "inventory",
  "/employees": "settings",
  "/business-units": "settings",
  "/tag-types": "settings",
  "/technicians": "settings",
  "/activities": "settings",
  "/activity-categories": "settings",
  "/activity-codes": "settings",
  "/adjustments": "inventory",
  "/payrolls": "payroll",
  "/payroll-adjustments": "payroll",
  "/payroll-settings": "payroll",
  "/gross-pay-items": "payroll",
  "/timesheets": "payroll",
  "/timesheet-codes": "payroll",
};

export const ENVIRONMENTS = {
  integration: {
    authUrl: "https://auth-integration.servicetitan.io",
    apiUrl: "https://api-integration.servicetitan.io",
  },
  production: {
    authUrl: "https://auth.servicetitan.io",
    apiUrl: "https://api.servicetitan.io",
  },
} as const;

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retried401?: boolean;
  _retried429?: boolean;
}

export class ServiceTitanApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly path: string,
  ) {
    super(message);
    this.name = "ServiceTitanApiError";
  }

  toJSON(): { status: number; message: string; path: string } {
    return {
      status: this.status,
      message: this.message,
      path: this.path,
    };
  }
}

export class ServiceTitanClient {
  private readonly http: AxiosInstance;
  private readonly authUrl: string;

  private accessToken: string | null = null;
  private tokenExpiration = 0;
  private tokenRequest: Promise<string> | null = null;

  constructor(private readonly config: ServiceTitanConfig) {
    const environment = ENVIRONMENTS[config.environment];
    this.authUrl = environment.authUrl;
    this.http = axios.create({
      baseURL: environment.apiUrl,
      timeout: 60_000, // 60s default for all API requests
    });

    this.setupInterceptors();
  }

  async get(path: string, params?: Record<string, unknown>): Promise<unknown> {
    return this.request("get", path, undefined, params);
  }

  async post(
    path: string,
    body?: unknown,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request("post", path, body, params);
  }

  async put(
    path: string,
    body?: unknown,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request("put", path, body, params);
  }

  async patch(
    path: string,
    body?: unknown,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request("patch", path, body, params);
  }

  async delete(path: string, params?: Record<string, unknown>): Promise<unknown> {
    return this.request("delete", path, undefined, params);
  }

  async ensureToken(): Promise<void> {
    await this.getAccessToken();
  }

  private async request(
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
    body?: unknown,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    const resolvedPath = this.resolvePath(path);
    const requestConfig: AxiosRequestConfig = {
      method,
      url: resolvedPath,
      params: params ? buildParams(params) : undefined,
      data: body,
    };

    try {
      const response = await this.http.request(requestConfig);
      return response.data;
    } catch (error) {
      throw this.sanitizeError(error, resolvedPath);
    }
  }

  private resolvePath(path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const withTenant = normalizedPath.replaceAll("{tenant}", this.config.tenantId);
    return this.addApiPrefix(withTenant);
  }

  /**
   * ServiceTitan's v2 API requires versioned module prefixes on all endpoints.
   * e.g. `/tenant/123/customers` → `/crm/v2/tenant/123/customers`
   *
   * This mapping routes each resource path to its correct API module prefix.
   * Paths that already include a prefix (e.g. `/v3/...`, `/crm/v2/...`) are left untouched.
   */
  private addApiPrefix(path: string): string {
    // Skip paths that already have a full module+version prefix (e.g. /crm/v2/tenant/...)
    if (/^\/(?:crm|accounting|jpm|dispatch|settings|pricebook|payroll|memberships|marketing|telecom|inventory|reporting|sales|equipment-systems|task-management|forms)\/v\d+\//i.test(path)) {
      return path;
    }

    // Handle bare versioned paths like /v2/tenant/{id}/calls or /v3/tenant/{id}/calls
    // These need the module prefix prepended: /v2/tenant/.../calls → /telecom/v2/tenant/.../calls
    const versionedMatch = path.match(/^\/(v\d+)\/tenant\/[^/]+(\/export)?(\/[^/?]+)/);
    if (versionedMatch) {
      const isExport = versionedMatch[2] === "/export";
      const resource = versionedMatch[3];
      const table = isExport ? EXPORT_ROUTE_TABLE : ROUTE_TABLE;
      const prefix = table[resource];
      if (prefix) {
        return `/${prefix}${path}`;
      }
      return path;
    }

    // Extract the resource segment after /tenant/{id}/
    const match = path.match(/^\/tenant\/[^/]+(\/export)?(\/[^/?]+)/);
    if (!match) return path;

    const isExport = match[1] === "/export";
    const resource = match[2]; // e.g. "/customers", "/jobs"

    // Export endpoints are nested under their parent domain prefix
    if (isExport) {
      const exportPrefix = EXPORT_ROUTE_TABLE[resource];
      if (exportPrefix) {
        return `/${exportPrefix}/v2${path}`;
      }
      // Default: try matching the exported resource to a regular domain
      const regularPrefix = ROUTE_TABLE[resource];
      if (regularPrefix) {
        return `/${regularPrefix}/v2${path}`;
      }
    }

    const prefix = ROUTE_TABLE[resource];
    if (prefix) {
      return `/${prefix}/v2${path}`;
    }

    // Fallback: return path as-is (will likely 404, but better than silently misrouting)
    return path;
  }

  private setupInterceptors(): void {
    this.http.interceptors.request.use(
      async (
        request: InternalAxiosRequestConfig,
      ): Promise<InternalAxiosRequestConfig> => {
        const token = await this.getAccessToken();
        if (request.headers?.set) {
          request.headers.set("Authorization", `Bearer ${token}`);
          request.headers.set("ST-App-Key", this.config.appKey);
        } else {
          // Fallback for plain-object headers (e.g. in tests)
          (request as unknown as Record<string, unknown>).headers = {
            ...((request.headers as Record<string, unknown>) ?? {}),
            Authorization: `Bearer ${token}`,
            "ST-App-Key": this.config.appKey,
          };
        }
        return request;
      },
    );

    this.http.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const requestConfig = error.config as RetriableRequestConfig | undefined;
        const status = error.response?.status;

        if (status === 401 && requestConfig && !requestConfig._retried401) {
          requestConfig._retried401 = true;
          await this.refreshToken();
          return this.http.request(requestConfig);
        }

        if (status === 429 && requestConfig && !requestConfig._retried429) {
          requestConfig._retried429 = true;
          const retryAfterSeconds = this.parseRetryAfter(
            error.response?.headers?.["retry-after"],
          );
          await this.sleep(retryAfterSeconds * 1000);
          return this.http.request(requestConfig);
        }

        return Promise.reject(error);
      },
    );
  }

  private async getAccessToken(forceRefresh = false): Promise<string> {
    const isTokenValid =
      this.accessToken !== null &&
      Date.now() < this.tokenExpiration - TOKEN_EXPIRY_BUFFER_MS;

    if (!forceRefresh && isTokenValid) {
      return this.accessToken!;
    }

    if (this.tokenRequest) {
      return this.tokenRequest;
    }

    this.tokenRequest = this.fetchAccessToken();

    try {
      return await this.tokenRequest;
    } finally {
      this.tokenRequest = null;
    }
  }

  private async refreshToken(): Promise<void> {
    this.accessToken = null;
    this.tokenExpiration = 0;
    await this.getAccessToken(true);
  }

  private async fetchAccessToken(): Promise<string> {
    const form = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    // Token acquisition must use raw axios.post() to avoid recursive auth interception.
    const response = await axios.post<TokenResponse>(
      `${this.authUrl}/connect/token`,
      form.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 15_000, // 15s timeout for auth — fail fast if ST auth is stalled
      },
    );

    const accessToken = response.data?.access_token;
    const expiresInSeconds = Number(response.data?.expires_in ?? 0);

    if (!accessToken || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
      throw new Error("Invalid token response from ServiceTitan auth endpoint");
    }

    this.accessToken = accessToken;
    this.tokenExpiration = Date.now() + expiresInSeconds * 1000;

    return accessToken;
  }

  private parseRetryAfter(value: unknown): number {
    if (typeof value === "string") {
      // Try integer seconds first (most common)
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }

      // Try HTTP-date format (e.g. "Sat, 28 Mar 2026 17:00:00 GMT")
      const dateMs = Date.parse(value);
      if (Number.isFinite(dateMs)) {
        const delaySeconds = Math.ceil((dateMs - Date.now()) / 1000);
        if (delaySeconds > 0) {
          return Math.min(delaySeconds, 300); // Cap at 5 minutes
        }
      }
    }

    return 1;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private sanitizeError(error: unknown, path: string): ServiceTitanApiError {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0;
      const message = this.extractServiceTitanMessage(error) ?? "Request failed";
      return new ServiceTitanApiError(status, message, path);
    }

    if (error instanceof Error) {
      return new ServiceTitanApiError(0, error.message, path);
    }

    return new ServiceTitanApiError(0, "Unknown error", path);
  }

  private extractServiceTitanMessage(error: AxiosError): string | null {
    const data = error.response?.data;

    if (typeof data === "string" && data.trim().length > 0) {
      return data;
    }

    if (data && typeof data === "object") {
      const knownMessageFields = ["message", "error_description", "error"] as const;

      for (const field of knownMessageFields) {
        const value = (data as Record<string, unknown>)[field];
        if (typeof value === "string" && value.trim().length > 0) {
          return value;
        }
      }
    }

    return error.message ?? null;
  }
}
