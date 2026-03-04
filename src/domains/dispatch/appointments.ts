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
} from "../../utils.js";

const appointmentStatusSchema = z.enum([
  "Scheduled",
  "Dispatched",
  "Working",
  "Hold",
  "Done",
  "Canceled",
]);

function withDescribedDateFilters<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return dateFilterParams(schema).extend({
    createdBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Return appointments created before this UTC timestamp"),
    createdOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Return appointments created on or after this UTC timestamp"),
    modifiedBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Return appointments modified before this UTC timestamp"),
    modifiedOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Return appointments modified on or after this UTC timestamp"),
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const appointmentListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
      ids: z
        .string()
        .optional()
        .describe("Comma-separated appointment IDs (maximum 50)"),
      jobId: z.number().int().optional().describe("Filter by job ID"),
      projectId: z.number().int().optional().describe("Filter by project ID"),
      number: z.string().optional().describe("Filter by appointment number"),
      status: appointmentStatusSchema
        .optional()
        .describe("Filter by appointment status"),
      startsOnOrAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Return appointments starting on or after this UTC timestamp"),
      startsBefore: z
        .string()
        .datetime()
        .optional()
        .describe("Return appointments starting before this UTC timestamp"),
      technicianId: z
        .number()
        .int()
        .optional()
        .describe("Filter by assigned technician ID"),
      customerId: z.number().int().optional().describe("Filter by customer ID"),
      unused: z.boolean().optional().describe("Return unused appointments only"),
    }),
  ),
);

export function registerDispatchAppointmentTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "dispatch_appointments_get",
    domain: "dispatch",
    operation: "read",
    description: "Get an appointment by ID",
    schema: {
      id: z.number().int().describe("Appointment ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.get(`/tenant/{tenant}/appointments/${id}`);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_appointments_delete",
    domain: "dispatch",
    operation: "delete",
    description: "Delete an appointment by ID",
    schema: {
      id: z.number().int().describe("Appointment ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.delete(`/tenant/{tenant}/appointments/${id}`);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_appointments_list",
    domain: "dispatch",
    operation: "read",
    description: "List appointments",
    schema: appointmentListSchema.shape,
    handler: async (params) => {
      const typed = params as z.infer<typeof appointmentListSchema>;

      try {
        const data = await client.get("/tenant/{tenant}/appointments", buildParams(typed));
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_appointments_create",
    domain: "dispatch",
    operation: "write",
    description: "Create an appointment",
    schema: {
      jobId: z.number().int().describe("Job ID"),
      appointmentNumber: z.string().describe("Appointment number"),
      start: z.string().describe("Appointment start time"),
      end: z.string().describe("Appointment end time"),
      arrivalWindowStart: z
        .string()
        .optional()
        .describe("Arrival window start timestamp"),
      arrivalWindowEnd: z.string().optional().describe("Arrival window end timestamp"),
      status: appointmentStatusSchema.optional().describe("Initial appointment status"),
      specialInstructions: z
        .string()
        .optional()
        .describe("Special instructions for dispatch"),
      customerId: z.number().int().describe("Customer ID"),
      createdById: z.number().int().describe("User ID creating the appointment"),
      isConfirmed: z
        .boolean()
        .optional()
        .describe("Whether the appointment is confirmed"),
    },
    handler: async (params) => {
      const typed = params as {
        jobId: number;
        appointmentNumber: string;
        start: string;
        end: string;
        arrivalWindowStart?: string;
        arrivalWindowEnd?: string;
        status?: z.infer<typeof appointmentStatusSchema>;
        specialInstructions?: string;
        customerId: number;
        createdById: number;
        isConfirmed?: boolean;
      };

      try {
        const data = await client.post("/tenant/{tenant}/appointments", buildParams(typed));
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_appointments_reschedule",
    domain: "dispatch",
    operation: "write",
    description: "Reschedule an appointment",
    schema: {
      id: z.number().int().describe("Appointment ID"),
      start: z.string().optional().describe("Updated appointment start time"),
      end: z.string().optional().describe("Updated appointment end time"),
      arrivalWindowStart: z
        .string()
        .optional()
        .describe("Updated arrival window start time"),
      arrivalWindowEnd: z
        .string()
        .optional()
        .describe("Updated arrival window end time"),
      specialInstructions: z
        .string()
        .optional()
        .describe("Updated special instructions"),
    },
    handler: async (params) => {
      const { id, ...body } = params as {
        id: number;
        start?: string;
        end?: string;
        arrivalWindowStart?: string;
        arrivalWindowEnd?: string;
        specialInstructions?: string;
      };

      try {
        const payload = buildParams(body);
        const data = await client.patch(
          `/tenant/{tenant}/appointments/${id}/reschedule`,
          Object.keys(payload).length > 0 ? payload : undefined,
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_appointments_hold",
    domain: "dispatch",
    operation: "write",
    description: "Put an appointment on hold",
    schema: {
      id: z.number().int().describe("Appointment ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.put(`/tenant/{tenant}/appointments/${id}/hold`);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_appointments_unhold",
    domain: "dispatch",
    operation: "delete",
    description: "Remove hold from an appointment",
    schema: {
      id: z.number().int().describe("Appointment ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.delete(`/tenant/{tenant}/appointments/${id}/hold`);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_appointments_update_special_instructions",
    domain: "dispatch",
    operation: "write",
    description: "Update appointment special instructions",
    schema: {
      id: z.number().int().describe("Appointment ID"),
      specialInstructions: z
        .string()
        .describe("Special instructions to store on the appointment"),
    },
    handler: async (params) => {
      const { id, specialInstructions } = params as {
        id: number;
        specialInstructions: string;
      };

      try {
        const data = await client.put(
          `/tenant/{tenant}/appointments/${id}/special-instructions`,
          { specialInstructions },
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_appointments_confirm",
    domain: "dispatch",
    operation: "write",
    description: "Confirm an appointment",
    schema: {
      id: z.number().int().describe("Appointment ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.put(`/tenant/{tenant}/appointments/${id}/confirmation`);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_appointments_unconfirm",
    domain: "dispatch",
    operation: "delete",
    description: "Remove appointment confirmation",
    schema: {
      id: z.number().int().describe("Appointment ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.delete(`/tenant/{tenant}/appointments/${id}/confirmation`);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
