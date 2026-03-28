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

const timesheetCodeListSchema = paginationParams(
  dateFilterParams(
    z.object({
      ...activeFilterParam(),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const timesheetCodeGetSchema = z.object({
  id: z.number().int().describe("Timesheet code ID"),
});

const jobTimesheetPayloadSchema = z
  .object({
    technicianId: z.number().int().optional().describe("Technician ID"),
    employeeId: z.number().int().optional().describe("Employee ID"),
    employeeType: z
      .enum(["Technician", "Employee"])
      .optional()
      .describe("Employee type"),
    startedOn: z.string().datetime().optional().describe("Start timestamp"),
    endedOn: z.string().datetime().optional().describe("End timestamp"),
    durationMinutes: z.number().int().optional().describe("Duration in minutes"),
    timesheetCodeId: z.number().int().optional().describe("Timesheet code ID"),
    payrollId: z.number().int().optional().describe("Payroll ID"),
    note: z.string().optional().describe("Timesheet note"),
    memo: z.string().optional().describe("Timesheet memo"),
    active: z.boolean().optional().describe("Whether timesheet is active"),
  })
  .passthrough();

const createJobTimesheetSchema = z.object({
  jobId: z.number().int().describe("Job ID"),
  payload: jobTimesheetPayloadSchema
    .optional()
    .describe("Optional payload for job timesheet creation"),
});

const jobTimesheetsListSchema = paginationParams(
  dateFilterParams(
    z.object({
      jobId: z.number().int().describe("Job ID"),
      technicianId: z.number().int().optional().describe("Technician ID"),
      startedOn: z
        .string()
        .datetime()
        .optional()
        .describe("Filter by started-on date/time"),
      endedOn: z.string().datetime().optional().describe("Filter by ended-on date/time"),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const jobsTimesheetsListSchema = paginationParams(
  dateFilterParams(
    z.object({
      jobIds: z.string().optional().describe("Comma-delimited job IDs"),
      technicianId: z.number().int().optional().describe("Technician ID"),
      startedOn: z
        .string()
        .datetime()
        .optional()
        .describe("Filter by started-on date/time"),
      endedOn: z.string().datetime().optional().describe("Filter by ended-on date/time"),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const updateJobTimesheetSchema = z.object({
  jobId: z.number().int().describe("Job ID"),
  id: z.number().int().describe("Job timesheet ID"),
  payload: jobTimesheetPayloadSchema
    .optional()
    .describe("Payload for updating a job timesheet"),
});

const nonJobTimesheetsListSchema = paginationParams(
  dateFilterParams(
    z.object({
      employeeId: z.number().int().optional().describe("Employee ID"),
      employeeType: z
        .enum(["Technician", "Employee"])
        .optional()
        .describe("Employee type"),
      ...activeFilterParam(),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const nonJobTimesheetIdSchema = z.object({
  id: z.number().int().describe("Non-job timesheet ID"),
});

const nonJobTimesheetPayloadSchema = z
  .object({
    employeeId: z.number().int().optional().describe("Employee ID"),
    employeeType: z
      .enum(["Technician", "Employee"])
      .optional()
      .describe("Employee type"),
    startedOn: z.string().datetime().optional().describe("Start timestamp"),
    endedOn: z.string().datetime().optional().describe("End timestamp"),
    durationMinutes: z.number().int().optional().describe("Duration in minutes"),
    timesheetCodeId: z.number().int().optional().describe("Timesheet code ID"),
    payrollId: z.number().int().optional().describe("Payroll ID"),
    note: z.string().optional().describe("Timesheet note"),
    memo: z.string().optional().describe("Timesheet memo"),
    active: z.boolean().optional().describe("Whether timesheet is active"),
  })
  .passthrough();

const createNonJobTimesheetSchema = nonJobTimesheetPayloadSchema;

const updateNonJobTimesheetSchema = nonJobTimesheetPayloadSchema.extend({
  id: z.number().int().describe("Non-job timesheet ID"),
});
export function registerPayrollTimesheetTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "payroll_timesheet_codes_get",
    domain: "payroll",
    operation: "read",
    description: "Get a timesheet code by ID",
    schema: timesheetCodeGetSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof timesheetCodeGetSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/timesheet-codes/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_timesheet_codes_list",
    domain: "payroll",
    operation: "read",
    description: "List timesheet codes",
    schema: timesheetCodeListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof timesheetCodeListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/timesheet-codes",
          buildParams({
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            active: input.active,
            sort: input.sort,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_timesheets_non_job_create",
    domain: "payroll",
    operation: "write",
    description: "Create a non-job timesheet",
    schema: createNonJobTimesheetSchema.shape,
    handler: async (params) => {
      const input = createNonJobTimesheetSchema.parse(params);

      try {
        const data = await client.post(
          "/tenant/{tenant}/non-job-timesheets",
          buildParams(input),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_timesheets_non_job_get",
    domain: "payroll",
    operation: "read",
    description: "Get a non-job timesheet by ID",
    schema: nonJobTimesheetIdSchema.shape,
    handler: async (params) => {
      const input = nonJobTimesheetIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/non-job-timesheets/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_timesheets_create_job",
    domain: "payroll",
    operation: "write",
    description: "Create a job timesheet",
    schema: createJobTimesheetSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof createJobTimesheetSchema>;

      try {
        const data = await client.post(
          `/tenant/{tenant}/jobs/${input.jobId}/timesheets`,
          input.payload,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_timesheets_job_list",
    domain: "payroll",
    operation: "read",
    description: "List job timesheets for a job",
    schema: jobTimesheetsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof jobTimesheetsListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/jobs/${input.jobId}/timesheets`,
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            technicianId: input.technicianId,
            startedOn: input.startedOn,
            endedOn: input.endedOn,
            sort: input.sort,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_timesheets_jobs_list",
    domain: "payroll",
    operation: "read",
    description: "List job timesheets across multiple jobs",
    schema: jobsTimesheetsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof jobsTimesheetsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/jobs/timesheets",
          buildParams({
            jobIds: input.jobIds,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            technicianId: input.technicianId,
            startedOn: input.startedOn,
            endedOn: input.endedOn,
            sort: input.sort,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_timesheets_job_update",
    domain: "payroll",
    operation: "write",
    description: "Update a job timesheet",
    schema: updateJobTimesheetSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof updateJobTimesheetSchema>;

      try {
        const data = await client.put(
          `/tenant/{tenant}/jobs/${input.jobId}/timesheets/${input.id}`,
          input.payload,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_timesheets_non_job_list",
    domain: "payroll",
    operation: "read",
    description: "List non-job timesheets",
    schema: nonJobTimesheetsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof nonJobTimesheetsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/non-job-timesheets",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            employeeId: input.employeeId,
            employeeType: input.employeeType,
            active: input.active,
            sort: input.sort,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_timesheets_non_job_update",
    domain: "payroll",
    operation: "write",
    description: "Update a non-job timesheet",
    schema: updateNonJobTimesheetSchema.shape,
    handler: async (params) => {
      const parsed = updateNonJobTimesheetSchema.parse(params);
      const { id, ...payload } = parsed;

      try {
        const data = await client.put(
          `/tenant/{tenant}/non-job-timesheets/${id}`,
          buildParams(payload),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "payroll_timesheets_non_job_delete",
    domain: "payroll",
    operation: "delete",
    description: "Delete a non-job timesheet",
    schema: nonJobTimesheetIdSchema.shape,
    handler: async (params) => {
      const input = nonJobTimesheetIdSchema.parse(params);

      try {
        await client.delete(`/tenant/{tenant}/non-job-timesheets/${input.id}`);
        return toolResult({
          success: true,
          message: "Non-job timesheet deleted",
        });
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
