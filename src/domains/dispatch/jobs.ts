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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const jobAttachmentListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...sortParam(["Id", "CreatedOn"]),
      jobId: z.number().int().describe("Job ID to list attachments for"),
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

export function registerDispatchJobTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "dispatch_jobs_create_attachment",
    domain: "dispatch",
    operation: "write",
    description: "Attach a file to a job",
    schema: {
      id: z.number().int().describe("Job ID"),
      file: z.string().describe("Base64-encoded attachment file"),
      fileName: z.string().optional().describe("Original attachment filename"),
      contentType: z.string().optional().describe("Attachment MIME type"),
    },
    handler: async (params) => {
      const { id, file, fileName, contentType } = params as {
        id: number;
        file: string;
        fileName?: string;
        contentType?: string;
      };

      try {
        const data = await client.post(`/tenant/{tenant}/jobs/${id}/attachments`, {
          file,
          fileName,
          contentType,
        });
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_jobs_get_attachment",
    domain: "dispatch",
    operation: "read",
    description: "Get a job attachment by attachment ID",
    schema: {
      id: z.number().int().describe("Job attachment ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.get(`/tenant/{tenant}/jobs/attachment/${id}`);
        return toolResult(data);
      } catch (error) {
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
      const { jobId, ...query } = params as z.infer<typeof jobAttachmentListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/jobs/${jobId}/attachments`,
          buildParams(query),
        );
        return toolResult(data);
      } catch (error) {
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
      const typed = params as z.infer<typeof reasonListSchema>;

      try {
        const data = await client.get("/tenant/{tenant}/call-reasons", buildParams(typed));
        return toolResult(data);
      } catch (error) {
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
      const typed = params as z.infer<typeof reasonListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/job-cancel-reasons",
          buildParams(typed),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
