import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import {
  activeFilterParam,
  buildParams,
  dateFilterParams,
  paginationParams,
  toolError,
  toolResult,
  getErrorMessage,
} from "../../utils.js";

const hourRangeSchema = z.object({
  fromHour: z.number().int().describe("Starting hour of availability block (0-23)"),
  toHour: z.number().int().describe("Ending hour of availability block (0-23)"),
});

function withDescribedDateFilters<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return dateFilterParams(schema).extend({
    createdBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Return items created before this UTC timestamp"),
    createdOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Return items created on or after this UTC timestamp"),
    modifiedBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Return items modified before this UTC timestamp"),
    modifiedOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Return items modified on or after this UTC timestamp"),
  });
}
const arrivalWindowListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...activeFilterParam(),
    }),
  ),
);

export function registerDispatchArrivalWindowTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "dispatch_arrival_windows_create",
    domain: "dispatch",
    operation: "write",
    description: "Create a new arrival window",
    schema: {
      start: z.string().describe("Arrival window start time"),
      duration: z.string().describe("Arrival window duration"),
      businessUnitIds: z
        .array(z.number().int().describe("Business unit ID"))
        .min(1)
        .describe("Business units that can use this arrival window"),
      active: z.boolean().describe("Whether the arrival window is active"),
    },
    handler: async (params) => {
      const { start, duration, businessUnitIds, active } = params as {
        start: string;
        duration: string;
        businessUnitIds: number[];
        active: boolean;
      };

      try {
        const data = await client.post("/tenant/{tenant}/arrival-windows", {
          start,
          duration,
          businessUnitIds,
          active,
        });
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_arrival_windows_get",
    domain: "dispatch",
    operation: "read",
    description: "Get an arrival window by ID",
    schema: {
      id: z.number().int().describe("Arrival window ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.get(`/tenant/{tenant}/arrival-windows/${id}`);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_arrival_windows_list",
    domain: "dispatch",
    operation: "read",
    description: "List arrival windows",
    schema: arrivalWindowListSchema.shape,
    handler: async (params) => {
      const typed = params as z.infer<typeof arrivalWindowListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/arrival-windows",
          buildParams(typed),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_arrival_windows_activate",
    domain: "dispatch",
    operation: "write",
    description: "Activate an arrival window",
    schema: {
      id: z.number().int().describe("Arrival window ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.put(`/tenant/{tenant}/arrival-windows/${id}/activated`);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_arrival_window_configuration_get",
    domain: "dispatch",
    operation: "read",
    description: "Get arrival window configuration",
    schema: {},
    handler: async () => {
      try {
        const data = await client.get("/tenant/{tenant}/arrival-windows/configuration");
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_arrival_window_configuration_update",
    domain: "dispatch",
    operation: "write",
    description: "Update arrival window configuration",
    schema: {
      enabled: z
        .boolean()
        .optional()
        .describe("Whether arrival windows are enabled for dispatching"),
      defaultArrivalWindowId: z
        .number()
        .int()
        .optional()
        .describe("Default arrival window ID used for scheduling"),
      weekdays: z
        .array(hourRangeSchema)
        .optional()
        .describe("Weekday availability blocks in local business hours"),
      saturday: z
        .array(hourRangeSchema)
        .optional()
        .describe("Saturday availability blocks in local business hours"),
      sunday: z
        .array(hourRangeSchema)
        .optional()
        .describe("Sunday availability blocks in local business hours"),
    },
    handler: async (params) => {
      const typed = params as {
        enabled?: boolean;
        defaultArrivalWindowId?: number;
        weekdays?: Array<{ fromHour: number; toHour: number }>;
        saturday?: Array<{ fromHour: number; toHour: number }>;
        sunday?: Array<{ fromHour: number; toHour: number }>;
      };

      try {
        const data = await client.post(
          "/tenant/{tenant}/arrival-windows/configuration",
          buildParams(typed),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_arrival_windows_update",
    domain: "dispatch",
    operation: "write",
    description: "Update an arrival window",
    schema: {
      id: z.number().int().describe("Arrival window ID"),
      start: z.string().optional().describe("Arrival window start time"),
      duration: z.string().optional().describe("Arrival window duration"),
      businessUnitIds: z
        .array(z.number().int().describe("Business unit ID"))
        .optional()
        .describe("Business units that can use this arrival window"),
      active: z.boolean().optional().describe("Whether the arrival window is active"),
    },
    handler: async (params) => {
      const { id, ...rest } = params as {
        id: number;
        start?: string;
        duration?: string;
        businessUnitIds?: number[];
        active?: boolean;
      };

      try {
        const data = await client.put(
          `/tenant/{tenant}/arrival-windows/${id}`,
          buildParams(rest),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
