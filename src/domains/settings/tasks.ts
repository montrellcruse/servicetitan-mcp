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

const taskGetSchema = z.object({
  id: z.number().int().describe("Task ID"),
  includeSubtasks: z.boolean().optional().describe("Include subtasks in the response"),
});

const taskListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...activeFilterParam(),
      ...sortParam(["Id", "CreatedOn", "DescriptionModifiedOn", "CompletedBy", "Priority"]),
      reportedBefore: z.string().datetime().optional().describe("Reported date upper bound (UTC)"),
      reportedOnOrAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Reported date lower bound (UTC)"),
      completeBefore: z.string().datetime().optional().describe("Completion date upper bound (UTC)"),
      completeOnOrAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Completion date lower bound (UTC)"),
      isClosed: z
        .boolean()
        .optional()
        .describe("Deprecated: filter by task closure state (use statuses when possible)"),
      statuses: z.string().optional().describe("Comma-separated task statuses"),
      ids: z.string().optional().describe("Comma-separated task IDs"),
      name: z.string().optional().describe("Task name filter"),
      includeSubtasks: z.boolean().optional().describe("Include subtasks in each task payload"),
      businessUnitIds: z.string().optional().describe("Comma-separated business unit IDs"),
      employeeTaskTypeIds: z.string().optional().describe("Comma-separated employee task type IDs"),
      employeeTaskSourceIds: z
        .string()
        .optional()
        .describe("Comma-separated employee task source IDs"),
      employeeTaskResolutionIds: z
        .string()
        .optional()
        .describe("Comma-separated employee task resolution IDs"),
      reportedById: z.number().int().optional().describe("Reported by employee ID"),
      assignedToId: z.number().int().optional().describe("Assigned to employee ID"),
      involvedEmployeeIdList: z
        .string()
        .optional()
        .describe("Comma-separated involved employee IDs"),
      customerId: z.number().int().optional().describe("Customer ID"),
      jobId: z.number().int().optional().describe("Job ID"),
      projectId: z.number().int().optional().describe("Project ID"),
      priorities: z.string().optional().describe("Comma-separated task priorities"),
      taskNumber: z.number().int().optional().describe("Task number"),
      jobNumber: z.string().optional().describe("Job number"),
    }),
  ),
);

const taskCreateSchema = z.object({
  reportedById: z.number().int().optional().describe("ID of the person who reported the task"),
  assignedToId: z.number().int().optional().describe("ID of the assignee"),
  isClosed: z.boolean().optional().describe("Whether the task is already closed"),
  status: z.string().optional().describe("Task status"),
  name: z.string().describe("Task name"),
  businessUnitId: z.number().int().optional().describe("Business unit ID"),
  employeeTaskTypeId: z.number().int().optional().describe("Employee task type ID"),
  employeeTaskSourceId: z.number().int().optional().describe("Employee task source ID"),
  employeeTaskResolutionId: z.number().int().optional().describe("Employee task resolution ID"),
  reportedDate: z.string().optional().describe("Date the task was reported"),
  completeBy: z.string().optional().describe("Target completion date"),
  startedOn: z.string().optional().describe("Task start date"),
  involvedEmployeeIdList: z
    .array(z.number().int())
    .optional()
    .describe("List of involved employee IDs"),
  customerId: z.number().int().optional().describe("Customer ID"),
  jobId: z.number().int().optional().describe("Job ID"),
  projectId: z.number().int().optional().describe("Project ID"),
  description: z.string().optional().describe("Task description"),
  priority: z.string().optional().describe("Task priority"),
  customerName: z.string().optional().describe("Customer name"),
  jobNumber: z.string().optional().describe("Job number"),
  refundIssued: z.number().optional().describe("Refund issued amount"),
  descriptionModifiedOn: z.string().optional().describe("Description modified timestamp"),
  descriptionModifiedBy: z.string().optional().describe("User who modified description"),
  createdOn: z.string().optional().describe("Task created timestamp"),
  modifiedOn: z.string().optional().describe("Task modified timestamp"),
});

const taskCreateSubtaskSchema = z.object({
  id: z.number().int().describe("Parent task ID"),
  body: z
    .object({
      name: z.string().optional().describe("Subtask name"),
      description: z.string().optional().describe("Subtask description"),
      assignedToId: z.number().int().optional().describe("Assigned employee ID"),
      status: z.string().optional().describe("Subtask status"),
      priority: z.string().optional().describe("Subtask priority"),
      completeBy: z.string().optional().describe("Target completion date"),
      isClosed: z.boolean().optional().describe("Whether the subtask is closed"),
    })
    .passthrough()
    .optional()
    .describe("Subtask payload"),
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerTaskTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "settings_tasks_get",
    domain: "settings",
    operation: "read",
    description: "Get a task by ID",
    schema: taskGetSchema.shape,
    handler: async (params) => {
      const input = taskGetSchema.parse(params);

      try {
        const data = await client.get(
          `/tenant/{tenant}/tasks/${input.id}`,
          buildParams({ includeSubtasks: input.includeSubtasks }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_tasks_list",
    domain: "settings",
    operation: "read",
    description: "List tasks",
    schema: taskListSchema.shape,
    handler: async (params) => {
      const input = taskListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/tasks",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            active: input.active,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            reportedBefore: input.reportedBefore,
            reportedOnOrAfter: input.reportedOnOrAfter,
            completeBefore: input.completeBefore,
            completeOnOrAfter: input.completeOnOrAfter,
            isClosed: input.isClosed,
            statuses: input.statuses,
            ids: input.ids,
            name: input.name,
            includeSubtasks: input.includeSubtasks,
            businessUnitIds: input.businessUnitIds,
            employeeTaskTypeIds: input.employeeTaskTypeIds,
            employeeTaskSourceIds: input.employeeTaskSourceIds,
            employeeTaskResolutionIds: input.employeeTaskResolutionIds,
            reportedById: input.reportedById,
            assignedToId: input.assignedToId,
            involvedEmployeeIdList: input.involvedEmployeeIdList,
            customerId: input.customerId,
            jobId: input.jobId,
            projectId: input.projectId,
            priorities: input.priorities,
            taskNumber: input.taskNumber,
            jobNumber: input.jobNumber,
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
    name: "settings_tasks_create",
    domain: "settings",
    operation: "write",
    description: "Create a task",
    schema: taskCreateSchema.shape,
    handler: async (params) => {
      const input = taskCreateSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/tasks", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_tasks_create_subtask",
    domain: "settings",
    operation: "write",
    description: "Create a subtask under an existing task",
    schema: taskCreateSubtaskSchema.shape,
    handler: async (params) => {
      const input = taskCreateSubtaskSchema.parse(params);

      try {
        const data = await client.post(
          `/tenant/{tenant}/tasks/${input.id}/subtasks`,
          input.body ? buildParams(input.body) : undefined,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
