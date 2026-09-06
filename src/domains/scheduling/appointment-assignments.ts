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
const appointmentAssignmentListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...activeFilterParam(),
      ...sortParam(["Id", "CreatedOn", "ModifiedOn"]),
      ids: z.string().optional().describe("Comma-separated assignment IDs (maximum 50)"),
      appointmentIds: z
        .string()
        .optional()
        .describe("Comma-separated appointment IDs (maximum 50)"),
      jobId: z.number().int().optional().describe("Return assignments for a job ID"),
    }),
  ),
);

export function registerSchedulingAppointmentAssignmentTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "scheduling_appointment_assignments_assign_technicians",
    domain: "scheduling",
    operation: "write",
    description: "Assign technicians to an appointment",
    schema: {
      jobAppointmentId: z
        .number()
        .int()
        .describe("Job appointment ID to assign technicians to"),
      technicianIds: z
        .array(z.number().int())
        .min(1)
        .describe("Technician IDs to assign to the appointment"),
    },
    handler: async (params) => {
      const typed = params as {
        jobAppointmentId: number;
        technicianIds: number[];
      };

      try {
        const data = await client.post(
          "/tenant/{tenant}/appointment-assignments/assign-technicians",
          {
            jobAppointmentId: typed.jobAppointmentId,
            technicianIds: typed.technicianIds,
          },
        );
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "scheduling_appointment_assignments_unassign_technicians",
    domain: "scheduling",
    operation: "write",
    description: "Unassign technicians from appointments",
    schema: {
      jobAppointmentId: z.number().int().describe("Appointment ID"),
      technicianIds: z.array(z.number().int()).min(1).describe("Technician IDs to unassign"),
    },
    handler: async (params) => {
      const typed = params as { jobAppointmentId: number; technicianIds: number[] };

      try {
        const data = await client.post(
          "/tenant/{tenant}/appointment-assignments/unassign-technicians",
          typed,
        );
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "scheduling_appointment_assignments_list",
    domain: "scheduling",
    operation: "read",
    description: "Find one page of technician-to-appointment assignments by assignment IDs, appointment IDs, job ID, active state, or creation and modification dates. Use dispatch_appointments_get or dispatch_appointments_list for the appointment records themselves; this tool returns the assignment relationships.",
    schema: appointmentAssignmentListSchema.shape,
    handler: async (params) => {
      const typed = params as z.infer<typeof appointmentAssignmentListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/appointment-assignments",
          buildParams(typed),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  });
}
