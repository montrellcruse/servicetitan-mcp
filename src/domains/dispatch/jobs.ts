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

const jobStatusSchema = z.enum([
  "Scheduled",
  "Dispatched",
  "InProgress",
  "Hold",
  "Completed",
  "Canceled",
]);

const appointmentStatusSchema = z.enum([
  "Scheduled",
  "Dispatched",
  "Working",
  "Hold",
  "Done",
  "Canceled",
]);

const jobPrioritySchema = z.enum(["Low", "Normal", "High", "Urgent"]);

const externalDataEntrySchema = z.object({
  key: z.string().optional().describe("External data key"),
  value: z.string().optional().describe("External data value"),
});

const customFieldValueSchema = z.object({
  typeId: z.number().int().optional().describe("Custom field type ID"),
  name: z.string().optional().describe("Custom field name"),
  value: z.string().optional().describe("Custom field value"),
});

const jobWritePayloadSchema = z.object({
  number: z.string().optional().describe("Job number"),
  projectId: z.number().int().optional().describe("Project ID"),
  bookingId: z.number().int().optional().describe("Booking ID"),
  customerId: z.number().int().optional().describe("Customer ID"),
  locationId: z.number().int().optional().describe("Location ID"),
  soldById: z.number().int().optional().describe("Selling technician ID"),
  jobTypeId: z.number().int().optional().describe("Job type ID"),
  campaignId: z.number().int().optional().describe("Campaign ID"),
  businessUnitId: z.number().int().optional().describe("Business unit ID"),
  status: jobStatusSchema.optional().describe("Job status"),
  priority: jobPrioritySchema.optional().describe("Job priority"),
  summary: z.string().optional().describe("Job summary"),
  noCharge: z.boolean().optional().describe("Whether this job is no-charge"),
  externalData: z.array(externalDataEntrySchema).optional().describe("External data entries"),
  customFields: z.array(customFieldValueSchema).optional().describe("Custom field values"),
  tagTypeIds: z.array(z.number().int()).optional().describe("Tag type IDs"),
});

const jobIdSchema = z.object({
  id: z.number().int().describe("Job ID"),
});

const jobGetSchema = jobIdSchema.extend({
  externalDataApplicationGuid: z
    .string()
    .uuid()
    .optional()
    .describe("External data application GUID"),
});

const jobUpdateSchema = jobIdSchema.extend(jobWritePayloadSchema.shape);

const jobAttachmentCreateSchema = jobIdSchema.extend({
  file: z.string().describe("Base64-encoded attachment file"),
  fileName: z.string().optional().describe("Attachment file name"),
  contentType: z.string().optional().describe("Attachment content type"),
});

const jobAttachmentIdSchema = z.object({
  id: z.number().int().describe("Job attachment ID"),
});

const jobCreateNoteSchema = jobIdSchema.extend({
  text: z.string().describe("Note text"),
});

const jobCreateMessageSchema = jobIdSchema.extend({
  message: z.string().describe("Message content"),
});

const jobsCancelReasonsSchema = z.object({
  ids: z
    .string()
    .optional()
    .describe("Comma-separated cancel reason IDs (maximum 50)"),
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

const jobAttachmentListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...sortParam(["Id", "CreatedOn"]),
      jobId: z.number().int().describe("Job ID"),
    }),
  ),
);

const reasonListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...activeFilterParam(),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const jobsListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...sortParam(["Id", "ModifiedOn", "CreatedOn", "Priority"]),
      ids: z.string().optional().describe("Comma-separated job IDs (maximum 50)"),
      number: z.string().optional().describe("Filter by job number"),
      projectId: z.number().int().optional().describe("Filter by project ID"),
      bookingId: z.number().int().optional().describe("Filter by booking ID"),
      jobStatus: jobStatusSchema.optional().describe("Job status filter"),
      appointmentStatus: appointmentStatusSchema
        .optional()
        .describe("Appointment status filter"),
      priority: jobPrioritySchema.optional().describe("Job priority filter"),
      firstAppointmentStartsOnOrAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Return jobs whose first appointment starts on or after this UTC timestamp"),
      firstAppointmentStartsBefore: z
        .string()
        .datetime()
        .optional()
        .describe("Return jobs whose first appointment starts before this UTC timestamp"),
      appointmentStartsOnOrAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Return jobs with any appointment on or after this UTC timestamp"),
      appointmentStartsBefore: z
        .string()
        .datetime()
        .optional()
        .describe("Return jobs with any appointment before this UTC timestamp"),
      technicianId: z.number().int().optional().describe("Filter by technician ID"),
      customerId: z.number().int().optional().describe("Filter by customer ID"),
      locationId: z.number().int().optional().describe("Filter by location ID"),
      soldById: z.number().int().optional().describe("Filter by selling technician ID"),
      jobTypeId: z.number().int().optional().describe("Filter by job type ID"),
      campaignId: z.number().int().optional().describe("Filter by campaign ID"),
      businessUnitId: z.number().int().optional().describe("Filter by business unit ID"),
      invoiceId: z.number().int().optional().describe("Filter by invoice ID"),
      completedOnOrAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Return jobs completed on or after this UTC timestamp"),
      completedBefore: z
        .string()
        .datetime()
        .optional()
        .describe("Return jobs completed before this UTC timestamp"),
      tagTypeIds: z
        .string()
        .optional()
        .describe("Comma-separated tag type IDs"),
      externalDataApplicationGuid: z
        .string()
        .uuid()
        .optional()
        .describe("External data application GUID"),
      externalDataKey: z.string().optional().describe("External data key"),
      externalDataValues: z
        .string()
        .optional()
        .describe("External data values (comma-separated, maximum 50)"),
      hasUnusedAppointments: z
        .boolean()
        .optional()
        .describe("Return jobs with unused appointments"),
    }),
  ),
);

const jobNotesListSchema = paginationParams(
  z.object({
    id: z.number().int().describe("Job ID"),
  }),
);

const jobCanceledLogsListSchema = paginationParams(
  z.object({
    id: z.number().int().describe("Job ID"),
  }),
);

const jobCustomFieldTypesSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...sortParam(["Id", "CreatedOn", "ModifiedOn"]),
    }),
  ),
);

const jobSplitsListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...activeFilterParam(),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
      jobId: z.number().int().describe("Job ID"),
    }),
  ),
);

const jobSplitsByJobsListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...activeFilterParam(),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
      jobIds: z
        .string()
        .optional()
        .describe("Comma-separated job IDs to include"),
    }),
  ),
);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerDispatchJobTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "dispatch_jobs_create_attachment",
    domain: "dispatch",
    operation: "write",
    description: "Attach a file to a job",
    schema: jobAttachmentCreateSchema.shape,
    handler: async (params) => {
      const input = jobAttachmentCreateSchema.parse(params);

      try {
        const data = await client.post(`/tenant/{tenant}/jobs/${input.id}/attachments`, {
          file: input.file,
          fileName: input.fileName,
          contentType: input.contentType,
        });
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_get_attachment",
    domain: "dispatch",
    operation: "read",
    description: "Get a job attachment by ID",
    schema: jobAttachmentIdSchema.shape,
    handler: async (params) => {
      const input = jobAttachmentIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/jobs/attachment/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_list_attachments",
    domain: "dispatch",
    operation: "read",
    description: "List attachments for a job",
    schema: jobAttachmentListSchema.shape,
    handler: async (params) => {
      const input = jobAttachmentListSchema.parse(params);
      const { jobId, ...query } = input;

      try {
        const data = await client.get(`/tenant/{tenant}/jobs/${jobId}/attachments`, buildParams(query));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_call_reasons_list",
    domain: "dispatch",
    operation: "read",
    description: "List call reasons",
    schema: reasonListSchema.shape,
    handler: async (params) => {
      const input = reasonListSchema.parse(params);

      try {
        const data = await client.get("/tenant/{tenant}/call-reasons", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_job_cancel_reasons_list",
    domain: "dispatch",
    operation: "read",
    description: "List job cancel reasons",
    schema: reasonListSchema.shape,
    handler: async (params) => {
      const input = reasonListSchema.parse(params);

      try {
        const data = await client.get("/tenant/{tenant}/job-cancel-reasons", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_job_hold_reasons_list",
    domain: "dispatch",
    operation: "read",
    description: "List job hold reasons",
    schema: reasonListSchema.shape,
    handler: async (params) => {
      const input = reasonListSchema.parse(params);

      try {
        const data = await client.get("/tenant/{tenant}/job-hold-reasons", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_get",
    domain: "dispatch",
    operation: "read",
    description: "Get a job by ID",
    schema: jobGetSchema.shape,
    handler: async (params) => {
      const input = jobGetSchema.parse(params);

      try {
        const data = await client.get(
          `/tenant/{tenant}/jobs/${input.id}`,
          buildParams({
            externalDataApplicationGuid: input.externalDataApplicationGuid,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_list",
    domain: "dispatch",
    operation: "read",
    description: "List jobs",
    schema: jobsListSchema.shape,
    handler: async (params) => {
      const input = jobsListSchema.parse(params);

      try {
        const data = await client.get("/tenant/{tenant}/jobs", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_create",
    domain: "dispatch",
    operation: "write",
    description: "Create a job",
    schema: jobWritePayloadSchema.shape,
    handler: async (params) => {
      const input = jobWritePayloadSchema.parse(params);

      try {
        const payload = buildParams(input);
        const data = await client.post(
          "/tenant/{tenant}/jobs",
          Object.keys(payload).length > 0 ? payload : undefined,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_update",
    domain: "dispatch",
    operation: "write",
    description: "Update a job",
    schema: jobUpdateSchema.shape,
    handler: async (params) => {
      const input = jobUpdateSchema.parse(params);
      const { id, ...body } = input;

      try {
        const payload = buildParams(body);
        const data = await client.patch(
          `/tenant/{tenant}/jobs/${id}`,
          Object.keys(payload).length > 0 ? payload : undefined,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_cancel",
    domain: "dispatch",
    operation: "write",
    description: "Cancel a job",
    schema: jobIdSchema.shape,
    handler: async (params) => {
      const input = jobIdSchema.parse(params);

      try {
        const data = await client.put(`/tenant/{tenant}/jobs/${input.id}/cancel`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_remove_cancellation",
    domain: "dispatch",
    operation: "write",
    description: "Remove cancellation from a job",
    schema: jobIdSchema.shape,
    handler: async (params) => {
      const input = jobIdSchema.parse(params);

      try {
        const data = await client.put(`/tenant/{tenant}/jobs/${input.id}/remove-cancellation`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_hold",
    domain: "dispatch",
    operation: "write",
    description: "Put a job on hold",
    schema: jobIdSchema.shape,
    handler: async (params) => {
      const input = jobIdSchema.parse(params);

      try {
        const data = await client.put(`/tenant/{tenant}/jobs/${input.id}/hold`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_complete",
    domain: "dispatch",
    operation: "write",
    description: "Complete a job",
    schema: jobIdSchema.shape,
    handler: async (params) => {
      const input = jobIdSchema.parse(params);

      try {
        const data = await client.put(`/tenant/{tenant}/jobs/${input.id}/complete`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_notes_list",
    domain: "dispatch",
    operation: "read",
    description: "List notes for a job",
    schema: jobNotesListSchema.shape,
    handler: async (params) => {
      const input = jobNotesListSchema.parse(params);

      try {
        const data = await client.get(
          `/tenant/{tenant}/jobs/${input.id}/notes`,
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_notes_create",
    domain: "dispatch",
    operation: "write",
    description: "Create a note for a job",
    schema: jobCreateNoteSchema.shape,
    handler: async (params) => {
      const input = jobCreateNoteSchema.parse(params);

      try {
        const data = await client.post(`/tenant/{tenant}/jobs/${input.id}/notes`, {
          text: input.text,
        });
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_cancel_reasons_list",
    domain: "dispatch",
    operation: "read",
    description: "List cancel reasons available for jobs",
    schema: jobsCancelReasonsSchema.shape,
    handler: async (params) => {
      const input = jobsCancelReasonsSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/jobs/cancel-reasons",
          buildParams({ ids: input.ids }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_history_get",
    domain: "dispatch",
    operation: "read",
    description: "Get history for a job",
    schema: jobIdSchema.shape,
    handler: async (params) => {
      const input = jobIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/jobs/${input.id}/history`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_messages_create",
    domain: "dispatch",
    operation: "write",
    description: "Create a message for a job",
    schema: jobCreateMessageSchema.shape,
    handler: async (params) => {
      const input = jobCreateMessageSchema.parse(params);

      try {
        const data = await client.post(`/tenant/{tenant}/jobs/${input.id}/messages`, {
          message: input.message,
        });
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_canceled_logs_list",
    domain: "dispatch",
    operation: "read",
    description: "List canceled log entries for a job",
    schema: jobCanceledLogsListSchema.shape,
    handler: async (params) => {
      const input = jobCanceledLogsListSchema.parse(params);

      try {
        const data = await client.get(
          `/tenant/{tenant}/jobs/${input.id}/canceled-log`,
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_booked_log_get",
    domain: "dispatch",
    operation: "read",
    description: "Get booked log details for a job",
    schema: jobIdSchema.shape,
    handler: async (params) => {
      const input = jobIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/jobs/${input.id}/booked-log`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_custom_field_types_list",
    domain: "dispatch",
    operation: "read",
    description: "List job custom field types",
    schema: jobCustomFieldTypesSchema.shape,
    handler: async (params) => {
      const input = jobCustomFieldTypesSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/jobs/custom-fields",
          buildParams(input),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_job_splits_list",
    domain: "dispatch",
    operation: "read",
    description: "List splits for a single job",
    schema: jobSplitsListSchema.shape,
    handler: async (params) => {
      const input = jobSplitsListSchema.parse(params);
      const { jobId, ...query } = input;

      try {
        const data = await client.get(`/tenant/{tenant}/jobs/${jobId}/splits`, buildParams(query));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_job_splits_by_jobs_list",
    domain: "dispatch",
    operation: "read",
    description: "List splits filtered by one or more jobs",
    schema: jobSplitsByJobsListSchema.shape,
    handler: async (params) => {
      const input = jobSplitsByJobsListSchema.parse(params);

      try {
        const data = await client.get("/tenant/{tenant}/jobs/splits", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
