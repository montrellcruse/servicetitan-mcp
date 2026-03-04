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

const assignmentSchema = z.object({
  appointmentId: z.number().int().describe("Appointment ID to assign"),
  technicianId: z.number().int().describe("Technician ID to assign"),
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    description: "Assign technicians to appointments",
    schema: {
      assignments: z
        .array(assignmentSchema)
        .optional()
        .describe("Appointment/technician assignment items"),
      overrideExisting: z
        .boolean()
        .optional()
        .describe("Replace existing technician assignments when true"),
    },
    handler: async (params) => {
      const typed = params as {
        assignments?: Array<z.infer<typeof assignmentSchema>>;
        overrideExisting?: boolean;
      };

      try {
        const payload = buildParams(typed);
        const data = await client.post(
          "/tenant/{tenant}/appointment-assignments/assign-technicians",
          Object.keys(payload).length > 0 ? payload : undefined,
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "scheduling_appointment_assignments_unassign_technicians",
    domain: "scheduling",
    operation: "write",
    description: "Unassign technicians from appointments",
    schema: {
      assignmentIds: z
        .array(z.number().int().describe("Appointment assignment ID"))
        .optional()
        .describe("Assignment IDs to remove"),
    },
    handler: async (params) => {
      const typed = params as { assignmentIds?: number[] };

      try {
        const payload = buildParams(typed);
        const data = await client.post(
          "/tenant/{tenant}/appointment-assignments/unassign-technicians",
          Object.keys(payload).length > 0 ? payload : undefined,
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "scheduling_appointment_assignments_list",
    domain: "scheduling",
    operation: "read",
    description: "List appointment assignments",
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
        return toolError(getErrorMessage(error));
      }
    },
  });
}
