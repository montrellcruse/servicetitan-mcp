import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";

const hourRangeSchema = z.object({
  fromHour: z.number().int().describe("Starting hour (0-23)"),
  toHour: z.number().int().describe("Ending hour (0-23)"),
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerSchedulingBusinessHourTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "scheduling_business_hours_list",
    domain: "scheduling",
    operation: "read",
    description: "Get business hour configuration",
    schema: {},
    handler: async () => {
      try {
        const data = await client.get("/tenant/{tenant}/business-hours");
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "scheduling_business_hours_create",
    domain: "scheduling",
    operation: "write",
    description: "Create business hour configuration",
    schema: {
      weekdays: z
        .array(hourRangeSchema)
        .optional()
        .describe("Weekday hour ranges to configure"),
      saturday: z
        .array(hourRangeSchema)
        .optional()
        .describe("Saturday hour ranges to configure"),
      sunday: z.array(hourRangeSchema).optional().describe("Sunday hour ranges to configure"),
    },
    handler: async (params) => {
      const typed = params as {
        weekdays?: Array<z.infer<typeof hourRangeSchema>>;
        saturday?: Array<z.infer<typeof hourRangeSchema>>;
        sunday?: Array<z.infer<typeof hourRangeSchema>>;
      };

      try {
        const data = await client.post("/tenant/{tenant}/business-hours", {
          weekdays: typed.weekdays ?? [],
          saturday: typed.saturday ?? [],
          sunday: typed.sunday ?? [],
        });
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
