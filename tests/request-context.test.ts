import { describe, expect, it } from "vitest";
import { getRequestContext, withRequestContext } from "../src/request-context.js";
import { toolResult } from "../src/utils.js";

describe("isolated MCP request contexts", () => {
  it("keeps concurrent companies' timezones and budgets independent across awaits", async () => {
    const calls = [
      { timezone: "America/New_York", maxResponseChars: 256, label: "NY" },
      { timezone: "America/Phoenix", maxResponseChars: 10000, label: "AZ" },
    ].map((context) => withRequestContext(context, async () => {
      await new Promise((resolve) => setTimeout(resolve, context.label === "NY" ? 2 : 0));
      return { context: getRequestContext(), result: toolResult({ createdAt: "2026-09-04T12:00:00Z", text: "x".repeat(500) }) };
    }));
    const [ny, az] = await Promise.all(calls);
    expect(ny.context.timezone).toBe("America/New_York");
    expect(ny.result.isError).toBe(true);
    expect(az.context.timezone).toBe("America/Phoenix");
    expect(az.result.structuredContent?.createdAt).toBe("2026-09-04T05:00:00.000-07:00");
  });

  it("inherits outer cancellation/storage and restores the parent after nested contexts", async () => {
    const controller = new AbortController();
    const store = () => ({ resultId: "id" });
    await withRequestContext({ signal: controller.signal, timezone: "UTC", storeOversized: store }, async () => {
      await withRequestContext({ timezone: "America/New_York" }, async () => {
        await Promise.resolve();
        expect(getRequestContext()).toMatchObject({ signal: controller.signal, timezone: "America/New_York", storeOversized: store });
      });
      expect(getRequestContext().timezone).toBe("UTC");
    });
  });
});
