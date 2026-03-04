import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

const validEnv: NodeJS.ProcessEnv = {
  ST_CLIENT_ID: "client-id",
  ST_CLIENT_SECRET: "client-secret",
  ST_APP_KEY: "app-key",
  ST_TENANT_ID: "tenant-id",
};

describe("loadConfig", () => {
  it("loads valid config with required vars", () => {
    const config = loadConfig(validEnv);

    expect(config).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      appKey: "app-key",
      tenantId: "tenant-id",
      environment: "integration",
      readonlyMode: true,
      enabledDomains: null,
      logLevel: "info",
    });
  });

  it("throws when a single required variable is missing", () => {
    const env: NodeJS.ProcessEnv = {
      ...validEnv,
      ST_CLIENT_ID: "",
    };

    expect(() => loadConfig(env)).toThrow(/Missing required environment variables: ST_CLIENT_ID/);
  });

  it("throws when multiple required variables are missing", () => {
    const env: NodeJS.ProcessEnv = {
      ...validEnv,
      ST_CLIENT_ID: "",
      ST_CLIENT_SECRET: "",
      ST_APP_KEY: "",
    };

    expect(() => loadConfig(env)).toThrow(
      /Missing required environment variables: ST_CLIENT_ID, ST_CLIENT_SECRET, ST_APP_KEY/,
    );
  });

  it("throws when environment value is invalid", () => {
    const env: NodeJS.ProcessEnv = {
      ...validEnv,
      ST_ENVIRONMENT: "staging",
    };

    expect(() => loadConfig(env)).toThrow(
      /ST_ENVIRONMENT must be one of: integration, production/,
    );
  });

  it("defaults ST_READONLY to true", () => {
    const env: NodeJS.ProcessEnv = {
      ...validEnv,
      ST_READONLY: undefined,
    };

    expect(loadConfig(env).readonlyMode).toBe(true);
  });

  it.each([
    ["true", true],
    ["TRUE", true],
    ["1", true],
    ["false", false],
    ["FALSE", false],
    ["0", false],
  ])("parses ST_READONLY value %s", (value, expected) => {
    const env: NodeJS.ProcessEnv = {
      ...validEnv,
      ST_READONLY: value,
    };

    expect(loadConfig(env).readonlyMode).toBe(expected);
  });

  it("parses ST_DOMAINS as comma-separated, trimmed, lowercased list", () => {
    const env: NodeJS.ProcessEnv = {
      ...validEnv,
      ST_DOMAINS: " crm, PriceBook ,REPORTING ",
    };

    expect(loadConfig(env).enabledDomains).toEqual(["crm", "pricebook", "reporting"]);
  });

  it("treats empty ST_DOMAINS as null", () => {
    const env: NodeJS.ProcessEnv = {
      ...validEnv,
      ST_DOMAINS: "   ",
    };

    expect(loadConfig(env).enabledDomains).toBeNull();
  });
});
