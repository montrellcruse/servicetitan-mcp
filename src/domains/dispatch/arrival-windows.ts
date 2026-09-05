import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { officialRequestSchema } from "../../contracts/index.js";
import {
  activeFilterParam,
  buildParams,
  paginationParams,
  toolError,
  toolResult,
} from "../../utils.js";

const hourRangeSchema = z.object({
  fromHour: z.number().int().describe("Starting hour of availability block (0-23)"),
  toHour: z.number().int().describe("Ending hour of availability block (0-23)"),
});
const arrivalWindowConfigurationSchema = officialRequestSchema("ArrivalWindows_UpdatedConfiguration") as z.ZodObject<z.ZodRawShape>;

function withDescribedDateFilters<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.extend({
    createdBefore: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("Return items created before this UTC timestamp"),
    createdOnOrAfter: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("Return items created on or after this UTC timestamp"),
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
        return toolError(error);
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
        return toolError(error);
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
      const typed = arrivalWindowListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/arrival-windows",
          buildParams(typed),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(error);
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
      isActive: z.boolean().describe("Whether the arrival window is active"),
    },
    handler: async (params) => {
      const { id, isActive } = params as { id: number; isActive: boolean };

      try {
        const data = await client.put(`/tenant/{tenant}/arrival-windows/${id}/activated`, { isActive });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
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
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "dispatch_arrival_window_configuration_update",
    domain: "dispatch",
    operation: "write",
    description: "Update arrival window configuration",
    schema: arrivalWindowConfigurationSchema.shape,
    handler: async (params) => {
      const typed = arrivalWindowConfigurationSchema.parse(params);

      try {
        const data = await client.post(
          "/tenant/{tenant}/arrival-windows/configuration",
          buildParams(typed),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(error);
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
        return toolError(error);
      }
    },
  });
}
