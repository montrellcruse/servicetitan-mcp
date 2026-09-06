import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { officialRequestSchema } from "../../contracts/index.js";
import {
  buildParams,
  dateFilterParams,
  paginationParams,
  sortParam,
  toolError,
  toolResult,
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
const nonJobAppointmentCreateSchema = officialRequestSchema("NonJobAppointments_Create") as z.ZodObject<z.ZodRawShape>;
const nonJobAppointmentUpdateSchema = (officialRequestSchema("NonJobAppointments_Update") as z.ZodObject<z.ZodRawShape>).extend({ id: z.number().int() });

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
    description: "Retrieve a non-job appointment by its ServiceTitan ID. Returns the single upstream record without pagination; use scheduling_non_job_appointments_list to search when the ID is unknown.",
    schema: {
      id: z.number().int().describe("Non-job appointment ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.get(`/tenant/{tenant}/non-job-appointments/${id}`);
        return toolResult(data);
      } catch (error) {
        return toolError(error);
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
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "scheduling_non_job_appointments_update",
    domain: "scheduling",
    operation: "write",
    description: "Update a non-job appointment",
    schema: nonJobAppointmentUpdateSchema.shape,
    handler: async (params) => {
      const { id, ...payload } = nonJobAppointmentUpdateSchema.parse(params);

      try {
        const data = await client.put(
          `/tenant/{tenant}/non-job-appointments/${id}`,
          buildParams(payload),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "scheduling_non_job_appointments_list",
    domain: "scheduling",
    operation: "read",
    description: "List one requested page of non-job appointments using IDs, technician, timesheet code, schedule visibility, active state, start bounds, and created or modified timestamps. Use scheduling_non_job_appointments_get for a known appointment; use dispatch appointment tools for appointments attached to jobs.",
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
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "scheduling_non_job_appointments_create",
    domain: "scheduling",
    operation: "write",
    description: "Create a non-job appointment",
    schema: nonJobAppointmentCreateSchema.shape,
    handler: async (params) => {
      const typed = nonJobAppointmentCreateSchema.parse(params);

      try {
        const data = await client.post(
          "/tenant/{tenant}/non-job-appointments",
          buildParams(typed),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  });
}
