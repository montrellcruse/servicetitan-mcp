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
      confirmWrites: false,
      maxResponseChars: 100000,
      enabledDomains: null,
      logLevel: "info",
      timezone: "UTC",
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

  it("defaults ST_CONFIRM_WRITES to false", () => {
    const env: NodeJS.ProcessEnv = {
      ...validEnv,
      ST_CONFIRM_WRITES: undefined,
    };

    expect(loadConfig(env).confirmWrites).toBe(false);
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

  it.each([
    ["true", true],
    ["TRUE", true],
    ["1", true],
    ["false", false],
    ["FALSE", false],
    ["0", false],
  ])("parses ST_CONFIRM_WRITES value %s", (value, expected) => {
    const env: NodeJS.ProcessEnv = {
      ...validEnv,
      ST_CONFIRM_WRITES: value,
    };

    expect(loadConfig(env).confirmWrites).toBe(expected);
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

  it("defaults ST_MAX_RESPONSE_CHARS to 100000", () => {
    const env: NodeJS.ProcessEnv = {
      ...validEnv,
      ST_MAX_RESPONSE_CHARS: undefined,
    };

    expect(loadConfig(env).maxResponseChars).toBe(100000);
  });

  it("parses ST_MAX_RESPONSE_CHARS when valid", () => {
    const env: NodeJS.ProcessEnv = {
      ...validEnv,
      ST_MAX_RESPONSE_CHARS: "2048",
    };

    expect(loadConfig(env).maxResponseChars).toBe(2048);
  });

  it.each(["0", "-1", "1.5", "abc"])(
    "throws on invalid ST_MAX_RESPONSE_CHARS value %s",
    (value) => {
      const env: NodeJS.ProcessEnv = {
        ...validEnv,
        ST_MAX_RESPONSE_CHARS: value,
      };

      expect(() => loadConfig(env)).toThrow(
        /ST_MAX_RESPONSE_CHARS must be a positive integer/,
      );
    },
  );

  it("defaults timezone to UTC when ST_TIMEZONE is not set", () => {
    const config = loadConfig(validEnv);
    expect(config.timezone).toBe("UTC");
  });

  it("accepts a valid IANA timezone", () => {
    const config = loadConfig({ ...validEnv, ST_TIMEZONE: "America/New_York" });
    expect(config.timezone).toBe("America/New_York");
  });

  it("accepts US/Eastern shorthand", () => {
    const config = loadConfig({ ...validEnv, ST_TIMEZONE: "US/Eastern" });
    expect(config.timezone).toBe("US/Eastern");
  });

  it("throws on invalid timezone", () => {
    expect(() =>
      loadConfig({ ...validEnv, ST_TIMEZONE: "Not/A/Timezone" }),
    ).toThrow(/ST_TIMEZONE must be a valid IANA timezone/);
  });
});
