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

const externalDataEntrySchema = z.object({
  key: z.string().optional().describe("External data key"),
  value: z.string().optional().describe("External data value"),
});

const customFieldValueSchema = z.object({
  typeId: z.number().int().optional().describe("Custom field type ID"),
  name: z.string().optional().describe("Custom field name"),
  value: z.string().optional().describe("Custom field value"),
});

const projectWritePayloadSchema = z.object({
  number: z.string().optional().describe("Project number"),
  name: z.string().optional().describe("Project name"),
  summary: z.string().optional().describe("Project summary"),
  status: z.string().optional().describe("Project status label"),
  statusId: z.number().int().optional().describe("Project status ID"),
  subStatus: z.string().optional().describe("Project sub-status label"),
  subStatusId: z.number().int().optional().describe("Project sub-status ID"),
  customerId: z.number().int().optional().describe("Customer ID"),
  locationId: z.number().int().optional().describe("Location ID"),
  projectTypeId: z.number().int().optional().describe("Project type ID"),
  projectManagerIds: z
    .array(z.number().int())
    .optional()
    .describe("Assigned project manager IDs"),
  businessUnitIds: z.array(z.number().int()).optional().describe("Assigned business unit IDs"),
  startDate: z.string().optional().describe("Project start date/time in RFC3339 format"),
  targetCompletionDate: z
    .string()
    .optional()
    .describe("Target completion date/time in RFC3339 format"),
  actualCompletionDate: z
    .string()
    .optional()
    .describe("Actual completion date/time in RFC3339 format"),
  customFields: z
    .array(customFieldValueSchema)
    .optional()
    .describe("Custom field values for the project"),
  externalData: z
    .array(externalDataEntrySchema)
    .optional()
    .describe("External data entries"),
  jobIds: z.array(z.number().int()).optional().describe("Associated job IDs"),
});

const projectIdSchema = z.object({
  id: z.number().int().describe("Project ID"),
});

const projectUpdateSchema = projectIdSchema.extend(projectWritePayloadSchema.shape);

const projectCreateNoteSchema = projectIdSchema.extend({
  text: z.string().describe("Project note text"),
  isPinned: z.boolean().optional().describe("Whether the note is pinned"),
});

const projectCreateMessageSchema = projectIdSchema.extend({
  message: z.string().describe("Project message content"),
});

const projectAttachJobSchema = projectIdSchema.extend({
  jobId: z.number().int().describe("Job ID to attach"),
});

const projectDetachJobSchema = z.object({
  jobId: z.number().int().describe("Job ID to detach"),
});

const projectTypesListSchema = paginationParams(z.object({}));

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

const projectCustomFieldTypesListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const projectsListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...sortParam(["Id", "ModifiedOn", "CreatedOn", "Name", "TargetCompletionDate"]),
      ids: z.string().optional().describe("Comma-separated project IDs (maximum 50)"),
      customerId: z.number().int().optional().describe("Filter by customer ID"),
      locationId: z.number().int().optional().describe("Filter by location ID"),
      projectTypeId: z.number().int().optional().describe("Filter by project type ID"),
      invoiceId: z.number().int().optional().describe("Filter by invoice ID"),
      technicianId: z.number().int().optional().describe("Filter by technician ID"),
      jobId: z.number().int().optional().describe("Filter by job ID"),
      appointmentId: z.number().int().optional().describe("Filter by appointment ID"),
      projectManagerIds: z
        .string()
        .optional()
        .describe("Comma-separated manager IDs"),
      businessUnitIds: z
        .string()
        .optional()
        .describe("Comma-separated business unit IDs"),
      startsBefore: z
        .string()
        .datetime()
        .optional()
        .describe("Return projects starting before this UTC timestamp"),
      startsOnOrAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Return projects starting on or after this UTC timestamp"),
      completedBefore: z
        .string()
        .datetime()
        .optional()
        .describe("Return completed projects before this UTC timestamp"),
      completedOnOrAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Return completed projects on or after this UTC timestamp"),
      targetCompletionDateBefore: z
        .string()
        .datetime()
        .optional()
        .describe("Return projects with target completion before this UTC timestamp"),
      targetCompletionDateOnOrAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Return projects with target completion on or after this UTC timestamp"),
      status: z.string().optional().describe("Project status filter"),
      externalDataApplicationGuid: z
        .string()
        .uuid()
        .optional()
        .describe("External data application GUID"),
      externalDataKey: z.string().optional().describe("External data key"),
      externalDataValues: z
        .string()
        .optional()
        .describe("External data values (comma-separated)"),
    }),
  ),
);

const projectNotesListSchema = paginationParams(
  z.object({
    id: z.number().int().describe("Project ID"),
  }),
);

const projectStatusesListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...sortParam(["Id", "Name", "Order", "ModifiedOn", "CreatedOn"]),
      name: z.string().optional().describe("Filter by project status name"),
      ids: z.string().optional().describe("Comma-separated status IDs (maximum 50)"),
    }),
  ),
);

const projectSubStatusesListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...activeFilterParam(),
      ...sortParam(["Id", "Name", "Order", "StatusId", "ModifiedOn", "CreatedOn"]),
      name: z.string().optional().describe("Filter by project sub-status name"),
      statusId: z.number().int().optional().describe("Filter by parent project status ID"),
      ids: z.string().optional().describe("Comma-separated sub-status IDs (maximum 50)"),
    }),
  ),
);

const projectEntityGetSchema = z.object({
  id: z.number().int().describe("Entity ID"),
});

const projectsGetSchema = projectIdSchema.extend({
  externalDataApplicationGuid: z
    .string()
    .uuid()
    .optional()
    .describe("External data application GUID"),
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerDispatchProjectTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "dispatch_projects_get",
    domain: "dispatch",
    operation: "read",
    description: "Get a project by ID",
    schema: projectsGetSchema.shape,
    handler: async (params) => {
      const input = projectsGetSchema.parse(params);

      try {
        const data = await client.get(
          `/tenant/{tenant}/projects/${input.id}`,
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
    name: "dispatch_projects_list",
    domain: "dispatch",
    operation: "read",
    description: "List projects",
    schema: projectsListSchema.shape,
    handler: async (params) => {
      const input = projectsListSchema.parse(params);

      try {
        const data = await client.get("/tenant/{tenant}/projects", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_projects_create",
    domain: "dispatch",
    operation: "write",
    description: "Create a project",
    schema: projectWritePayloadSchema.shape,
    handler: async (params) => {
      const input = projectWritePayloadSchema.parse(params);

      try {
        const payload = buildParams(input);
        const data = await client.post(
          "/tenant/{tenant}/projects",
          Object.keys(payload).length > 0 ? payload : undefined,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_projects_update",
    domain: "dispatch",
    operation: "write",
    description: "Update a project",
    schema: projectUpdateSchema.shape,
    handler: async (params) => {
      const input = projectUpdateSchema.parse(params);
      const { id, ...body } = input;

      try {
        const payload = buildParams(body);
        const data = await client.patch(
          `/tenant/{tenant}/projects/${id}`,
          Object.keys(payload).length > 0 ? payload : undefined,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_projects_delete",
    domain: "dispatch",
    operation: "delete",
    description: "Delete a project",
    schema: projectIdSchema.shape,
    handler: async (params) => {
      const { id } = projectIdSchema.parse(params);

      try {
        const data = await client.delete(`/tenant/{tenant}/projects/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_projects_attach_job",
    domain: "dispatch",
    operation: "write",
    description: "Attach a job to a project",
    schema: projectAttachJobSchema.shape,
    handler: async (params) => {
      const input = projectAttachJobSchema.parse(params);

      try {
        const data = await client.post(
          `/tenant/{tenant}/projects/${input.id}/attach-job/${input.jobId}`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_projects_detach_job",
    domain: "dispatch",
    operation: "write",
    description: "Detach a job from a project",
    schema: projectDetachJobSchema.shape,
    handler: async (params) => {
      const input = projectDetachJobSchema.parse(params);

      try {
        const data = await client.post(`/tenant/{tenant}/projects/detach-job/${input.jobId}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_projects_notes_list",
    domain: "dispatch",
    operation: "read",
    description: "List notes for a project",
    schema: projectNotesListSchema.shape,
    handler: async (params) => {
      const input = projectNotesListSchema.parse(params);

      try {
        const data = await client.get(
          `/tenant/{tenant}/projects/${input.id}/notes`,
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
    name: "dispatch_projects_notes_create",
    domain: "dispatch",
    operation: "write",
    description: "Create a note for a project",
    schema: projectCreateNoteSchema.shape,
    handler: async (params) => {
      const input = projectCreateNoteSchema.parse(params);

      try {
        const data = await client.post(`/tenant/{tenant}/projects/${input.id}/notes`, {
          text: input.text,
          isPinned: input.isPinned,
        });
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_projects_messages_create",
    domain: "dispatch",
    operation: "write",
    description: "Create a message for a project",
    schema: projectCreateMessageSchema.shape,
    handler: async (params) => {
      const input = projectCreateMessageSchema.parse(params);

      try {
        const data = await client.post(`/tenant/{tenant}/projects/${input.id}/messages`, {
          message: input.message,
        });
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_projects_custom_field_types_list",
    domain: "dispatch",
    operation: "read",
    description: "List project custom field types",
    schema: projectCustomFieldTypesListSchema.shape,
    handler: async (params) => {
      const input = projectCustomFieldTypesListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/projects/custom-fields",
          buildParams(input),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_project_types_get",
    domain: "dispatch",
    operation: "read",
    description: "Get a project type by ID",
    schema: projectEntityGetSchema.shape,
    handler: async (params) => {
      const input = projectEntityGetSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/project-types/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_project_types_list",
    domain: "dispatch",
    operation: "read",
    description: "List project types",
    schema: projectTypesListSchema.shape,
    handler: async (params) => {
      const input = projectTypesListSchema.parse(params);

      try {
        const data = await client.get("/tenant/{tenant}/project-types", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_project_statuses_get",
    domain: "dispatch",
    operation: "read",
    description: "Get a project status by ID",
    schema: projectEntityGetSchema.shape,
    handler: async (params) => {
      const input = projectEntityGetSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/project-statuses/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_project_statuses_list",
    domain: "dispatch",
    operation: "read",
    description: "List project statuses",
    schema: projectStatusesListSchema.shape,
    handler: async (params) => {
      const input = projectStatusesListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/project-statuses",
          buildParams(input),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_project_sub_statuses_get",
    domain: "dispatch",
    operation: "read",
    description: "Get a project sub-status by ID",
    schema: projectEntityGetSchema.shape,
    handler: async (params) => {
      const input = projectEntityGetSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/project-substatuses/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_project_sub_statuses_list",
    domain: "dispatch",
    operation: "read",
    description: "List project sub-statuses",
    schema: projectSubStatusesListSchema.shape,
    handler: async (params) => {
      const input = projectSubStatusesListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/project-substatuses",
          buildParams(input),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
