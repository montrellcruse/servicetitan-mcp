import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import {
  activeFilterParam,
  buildParams,
  dateFilterParams,
  paginationParams,
  sortParam,
  toolError,
  toolResult,
  getErrorMessage,
} from "../../utils.js";

const shiftTypeSchema = z.enum(["Normal", "OnCall", "TimeOff"]);

function withDescribedDateFilters<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return dateFilterParams(schema).extend({
    createdBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Return shifts created before this UTC timestamp"),
    createdOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Return shifts created on or after this UTC timestamp"),
    modifiedBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Return shifts modified before this UTC timestamp"),
    modifiedOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Return shifts modified on or after this UTC timestamp"),
  });
}
const technicianShiftListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...activeFilterParam(),
      ...sortParam(["Id", "CreatedOn", "ModifiedOn"]),
      startsOnOrAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Return shifts starting on or after this UTC timestamp"),
      endsOnOrBefore: z
        .string()
        .datetime()
        .optional()
        .describe("Return shifts ending on or before this UTC timestamp"),
      shiftType: shiftTypeSchema.optional().describe("Shift type filter"),
      technicianId: z.number().int().optional().describe("Technician ID filter"),
      titleContains: z
        .string()
        .optional()
        .describe("Filter shifts by title substring"),
      noteContains: z.string().optional().describe("Filter shifts by note substring"),
    }),
  ),
);

export function registerSchedulingTechnicianShiftTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "scheduling_technician_shifts_create",
    domain: "scheduling",
    operation: "write",
    description: "Create a technician shift",
    schema: {
      technicianId: z.number().int().describe("Technician ID"),
      start: z.string().datetime().describe("Shift start timestamp"),
      end: z.string().datetime().describe("Shift end timestamp"),
      shiftType: shiftTypeSchema.optional().describe("Shift type"),
      title: z.string().optional().describe("Shift title"),
      note: z.string().optional().describe("Shift note"),
      active: z.boolean().optional().describe("Whether the shift is active"),
      timesheetCodeId: z.number().int().optional().describe("Timesheet code ID"),
    },
    handler: async (params) => {
      const typed = params as {
        technicianId: number;
        start: string;
        end: string;
        shiftType?: z.infer<typeof shiftTypeSchema>;
        title?: string;
        note?: string;
        active?: boolean;
        timesheetCodeId?: number;
      };

      try {
        const data = await client.post(
          "/tenant/{tenant}/technician-shifts",
          buildParams(typed),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "scheduling_technician_shifts_get",
    domain: "scheduling",
    operation: "read",
    description: "Get a technician shift by ID",
    schema: {
      id: z.number().int().describe("Technician shift ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.get(`/tenant/{tenant}/technician-shifts/${id}`);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "scheduling_technician_shifts_list",
    domain: "scheduling",
    operation: "read",
    description: "List technician shifts",
    schema: technicianShiftListSchema.shape,
    handler: async (params) => {
      const typed = params as z.infer<typeof technicianShiftListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/technician-shifts",
          buildParams(typed),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "scheduling_technician_shifts_delete",
    domain: "scheduling",
    operation: "delete",
    description: "Delete a technician shift",
    schema: {
      id: z.number().int().describe("Technician shift ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.delete(`/tenant/{tenant}/technician-shifts/${id}`);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "scheduling_technician_shifts_update",
    domain: "scheduling",
    operation: "write",
    description: "Update a technician shift",
    schema: {
      id: z.number().int().describe("Technician shift ID"),
      shiftType: shiftTypeSchema.optional().describe("Shift type"),
      title: z.string().optional().describe("Shift title"),
      note: z.string().optional().describe("Shift note"),
      active: z.boolean().optional().describe("Whether the shift is active"),
      technicianId: z.number().int().optional().describe("Technician ID"),
      start: z.string().optional().describe("Shift start timestamp"),
      end: z.string().optional().describe("Shift end timestamp"),
      timesheetCodeId: z.number().int().optional().describe("Timesheet code ID"),
    },
    handler: async (params) => {
      const { id, ...payload } = params as {
        id: number;
        shiftType?: z.infer<typeof shiftTypeSchema>;
        title?: string;
        note?: string;
        active?: boolean;
        technicianId?: number;
        start?: string;
        end?: string;
        timesheetCodeId?: number;
      };

      try {
        const data = await client.patch(
          `/tenant/{tenant}/technician-shifts/${id}`,
          buildParams(payload),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "scheduling_technician_shifts_bulk_delete",
    domain: "scheduling",
    operation: "write",
    description: "Delete multiple technician shifts",
    schema: {
      deletedIds: z
        .array(z.number().int().describe("Technician shift ID"))
        .optional()
        .describe("IDs of shifts to delete"),
    },
    handler: async (params) => {
      const typed = params as { deletedIds?: number[] };

      try {
        const data = await client.post(
          "/tenant/{tenant}/technician-shifts/bulk-delete",
          buildParams(typed),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
