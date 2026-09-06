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

const appointmentSummarySchema = z.object({
  id: z.number().int().describe("Appointment ID"),
  notes: z.string().describe("Appointment summary notes"),
  technicianId: z.number().int().describe("Technician ID for the summary"),
});
const appointmentCreateSchema = officialRequestSchema("Appointments_Add") as z.ZodObject<z.ZodRawShape>;

export function registerDispatchAppointmentTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "dispatch_appointments_get",
    domain: "dispatch",
    operation: "read",
    description: "Retrieve one appointment record by ID, including its dispatch and scheduling data. Use dispatch_appointments_list to search by job, customer, technician, status, start time, or other filters.",
    schema: {
      id: z.number().int().describe("Appointment ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.get(`/tenant/{tenant}/appointments/${id}`);
        return toolResult(data);
      } catch (error) {
        return toolError(error);
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
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "dispatch_appointments_list",
    domain: "dispatch",
    operation: "read",
    description: "Search appointments by IDs, job, project, customer, technician, status, start range, or created and modified ranges. Returns one page; use dispatch_appointments_get for a known ID.",
    schema: appointmentListSchema.shape,
    handler: async (params) => {
      const typed = params as z.infer<typeof appointmentListSchema>;

      try {
        const data = await client.get("/tenant/{tenant}/appointments", buildParams(typed));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "dispatch_appointments_create",
    domain: "dispatch",
    operation: "write",
    description: "Create an appointment",
    schema: appointmentCreateSchema.shape,
    handler: async (params) => {
      const typed = appointmentCreateSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/appointments", buildParams(typed));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
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
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "dispatch_appointments_set_summary",
    domain: "dispatch",
    operation: "write",
    description: "Set an appointment summary. Private preview: only works for accounts with the ST feature enabled.",
    schema: appointmentSummarySchema.shape,
    handler: async (params) => {
      const input = appointmentSummarySchema.parse(params);

      try {
        const data = await client.post(`/tenant/{tenant}/appointments/${input.id}/summaries`, {
          notes: input.notes,
          technicianId: input.technicianId,
        });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
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
      reasonId: z.number().int().describe("Hold reason ID"),
      memo: z.string().describe("Reason the appointment is being put on hold"),
    },
    handler: async (params) => {
      const { id, reasonId, memo } = params as { id: number; reasonId: number; memo: string };

      try {
        const data = await client.put(`/tenant/{tenant}/appointments/${id}/hold`, { reasonId, memo });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
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
        return toolError(error);
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
        return toolError(error);
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
        return toolError(error);
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
        return toolError(error);
      }
    },
  });
}
