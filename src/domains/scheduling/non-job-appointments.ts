import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import {
  buildParams,
  dateFilterParams,
  paginationParams,
  sortParam,
  toolError,
  toolResult,
  getErrorMessage,
} from "../../utils.js";

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
const nonJobAppointmentCreateSchema = {
  technicianId: z.number().int().describe("Technician ID"),
  start: z.string().describe("Appointment start timestamp"),
  name: z.string().describe("Appointment name"),
  duration: z.string().describe("Appointment duration"),
  timesheetCodeId: z.number().int().describe("Timesheet code ID"),
  summary: z.string().optional().describe("Appointment summary"),
  clearDispatchBoard: z
    .boolean()
    .optional()
    .describe("Whether to clear the dispatch board slot"),
  clearTechnicianView: z
    .boolean()
    .optional()
    .describe("Whether to clear technician view visibility"),
  removeTechnicianFromCapacityPlanning: z
    .boolean()
    .optional()
    .describe("Whether technician should be removed from capacity planning"),
  allDay: z.boolean().optional().describe("Whether appointment is all day"),
  showOnTechnicianSchedule: z
    .boolean()
    .optional()
    .describe("Whether to show on technician schedule"),
  active: z.boolean().optional().describe("Whether appointment is active"),
  repeat: z.boolean().optional().describe("Whether appointment repeats"),
  countOccurrences: z
    .number()
    .int()
    .optional()
    .describe("Number of repeated occurrences"),
  interval: z.number().int().optional().describe("Repeat interval"),
  frequency: z.string().optional().describe("Repeat frequency"),
  endType: z.string().optional().describe("Repeat end type"),
  endOn: z.string().optional().describe("Repeat end timestamp"),
  daysOfWeek: z.string().optional().describe("Comma-separated days of week"),
} as const;

const nonJobAppointmentListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...sortParam(["Id", "CreatedOn", "ModifiedOn"]),
      technicianId: z.number().int().optional().describe("Filter by technician ID"),
      startsOnOrAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Return items starting on or after this UTC timestamp"),
      startsOnOrBefore: z
        .string()
        .datetime()
        .optional()
        .describe("Return items starting on or before this UTC timestamp"),
      timesheetCodeId: z.number().int().optional().describe("Filter by timesheet code ID"),
      activeOnly: z.boolean().optional().describe("Return active items only"),
      showOnTechnicianSchedule: z
        .boolean()
        .optional()
        .describe("Filter by technician schedule visibility"),
      ids: z.string().optional().describe("Comma-separated IDs (maximum 50)"),
    }),
  ),
);

export function registerSchedulingNonJobAppointmentTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "scheduling_non_job_appointments_get",
    domain: "scheduling",
    operation: "read",
    description: "Get a non-job appointment by ID",
    schema: {
      id: z.number().int().describe("Non-job appointment ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.get(`/tenant/{tenant}/non-job-appointments/${id}`);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "scheduling_non_job_appointments_delete",
    domain: "scheduling",
    operation: "delete",
    description: "Delete a non-job appointment",
    schema: {
      id: z.number().int().describe("Non-job appointment ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.delete(`/tenant/{tenant}/non-job-appointments/${id}`);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "scheduling_non_job_appointments_update",
    domain: "scheduling",
    operation: "write",
    description: "Update a non-job appointment",
    schema: {
      id: z.number().int().describe("Non-job appointment ID"),
      technicianId: z.number().int().optional().describe("Technician ID"),
      start: z.string().optional().describe("Appointment start timestamp"),
      name: z.string().optional().describe("Appointment name"),
      duration: z.string().optional().describe("Appointment duration"),
      timesheetCodeId: z.number().int().optional().describe("Timesheet code ID"),
      summary: z.string().optional().describe("Appointment summary"),
      clearDispatchBoard: z
        .boolean()
        .optional()
        .describe("Whether to clear the dispatch board slot"),
      clearTechnicianView: z
        .boolean()
        .optional()
        .describe("Whether to clear technician view visibility"),
      removeTechnicianFromCapacityPlanning: z
        .boolean()
        .optional()
        .describe("Whether technician should be removed from capacity planning"),
      allDay: z.boolean().optional().describe("Whether appointment is all day"),
      showOnTechnicianSchedule: z
        .boolean()
        .optional()
        .describe("Whether to show on technician schedule"),
      active: z.boolean().optional().describe("Whether appointment is active"),
    },
    handler: async (params) => {
      const { id, ...payload } = params as {
        id: number;
        technicianId?: number;
        start?: string;
        name?: string;
        duration?: string;
        timesheetCodeId?: number;
        summary?: string;
        clearDispatchBoard?: boolean;
        clearTechnicianView?: boolean;
        removeTechnicianFromCapacityPlanning?: boolean;
        allDay?: boolean;
        showOnTechnicianSchedule?: boolean;
        active?: boolean;
      };

      try {
        const data = await client.put(
          `/tenant/{tenant}/non-job-appointments/${id}`,
          buildParams(payload),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "scheduling_non_job_appointments_list",
    domain: "scheduling",
    operation: "read",
    description: "List non-job appointments",
    schema: nonJobAppointmentListSchema.shape,
    handler: async (params) => {
      const typed = params as z.infer<typeof nonJobAppointmentListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/non-job-appointments",
          buildParams(typed),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "scheduling_non_job_appointments_create",
    domain: "scheduling",
    operation: "write",
    description: "Create a non-job appointment",
    schema: nonJobAppointmentCreateSchema,
    handler: async (params) => {
      const typed = params as {
        technicianId: number;
        start: string;
        name: string;
        duration: string;
        timesheetCodeId: number;
        summary?: string;
        clearDispatchBoard?: boolean;
        clearTechnicianView?: boolean;
        removeTechnicianFromCapacityPlanning?: boolean;
        allDay?: boolean;
        showOnTechnicianSchedule?: boolean;
        active?: boolean;
        repeat?: boolean;
        countOccurrences?: number;
        interval?: number;
        frequency?: string;
        endType?: string;
        endOn?: string;
        daysOfWeek?: string;
      };

      try {
        const data = await client.post(
          "/tenant/{tenant}/non-job-appointments",
          buildParams(typed),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
