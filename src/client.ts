import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

import type { ServiceTitanConfig } from "./config.js";
import { buildParams } from "./utils.js";

const TOKEN_EXPIRY_BUFFER_MS = 60_000;

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
    return normalizedPath.replaceAll("{tenant}", this.config.tenantId);
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
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
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
