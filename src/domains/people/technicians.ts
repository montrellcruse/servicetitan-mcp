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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const externalDataEntrySchema = z.object({
  key: z.string().optional().describe("External data key"),
  value: z.string().optional().describe("External data value"),
});

const technicianPayloadSchema = z.object({
  name: z.string().optional().describe("Technician display name"),
  firstName: z.string().optional().describe("Technician first name"),
  lastName: z.string().optional().describe("Technician last name"),
  nickname: z.string().optional().describe("Technician nickname"),
  employeeId: z.number().int().optional().describe("Related employee ID"),
  userId: z.number().int().optional().describe("Related user ID"),
  userRoleId: z.number().int().optional().describe("Related user role ID"),
  employeeNumber: z.string().optional().describe("Technician employee number"),
  mobilePhoneNumber: z.string().optional().describe("Mobile phone number"),
  businessUnitId: z.number().int().optional().describe("Default business unit ID"),
  active: z.boolean().optional().describe("Whether the technician is active"),
  color: z.string().optional().describe("Schedule display color"),
  laborWageTypeId: z.number().int().optional().describe("Labor wage type ID"),
  laborCostPerHour: z.number().optional().describe("Labor cost per hour"),
  memo: z.string().optional().describe("Internal note"),
  externalData: z
    .array(externalDataEntrySchema)
    .optional()
    .describe("External data entries"),
});

const technicianIdSchema = z.object({
  id: z.number().int().describe("Technician ID"),
});

const technicianUpdateSchema = technicianPayloadSchema.extend({
  id: z.number().int().describe("Technician ID"),
});

const technicianListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ids: z
        .string()
        .optional()
        .describe("Comma-separated technician IDs (maximum 50)"),
      userIds: z
        .string()
        .optional()
        .describe("Comma-separated user IDs (maximum 50)"),
      name: z
        .string()
        .optional()
        .describe("Filter technicians by name (case-insensitive contains)"),
      ...activeFilterParam(),
    }),
  ),
);

const shiftTypeSchema = z.enum(["Normal", "OnCall", "TimeOff"]);

const technicianShiftCreateSchema = z.object({
  technicianId: z.number().int().describe("Technician ID"),
  start: z.string().datetime().describe("Shift start timestamp"),
  end: z.string().datetime().describe("Shift end timestamp"),
  shiftType: shiftTypeSchema.optional().describe("Shift type"),
  title: z.string().optional().describe("Shift title"),
  note: z.string().optional().describe("Shift note"),
  active: z.boolean().optional().describe("Whether the shift is active"),
  timesheetCodeId: z.number().int().optional().describe("Timesheet code ID"),
});

const technicianShiftIdSchema = z.object({
  id: z.number().int().describe("Technician shift ID"),
});

const technicianShiftListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        startsOnOrAfter: z
          .string()
          .datetime()
          .optional()
          .describe("Return shifts starting on or after this UTC timestamp"),
        endsOnOrBefore: z
          .string()
          .datetime()
          .optional()
          .describe("Return shifts ending on or before this UTC timestamp"),
        shiftType: shiftTypeSchema.optional().describe("Shift type filter"),
        technicianId: z.number().int().optional().describe("Technician ID filter"),
        titleContains: z
          .string()
          .optional()
          .describe("Filter shifts by title substring"),
        noteContains: z.string().optional().describe("Filter shifts by note substring"),
      })
      .extend(activeFilterParam())
      .extend(sortParam(["Id", "CreatedOn", "ModifiedOn"])),
  ),
);

const technicianShiftUpdateSchema = z.object({
  id: z.number().int().describe("Technician shift ID"),
  shiftType: shiftTypeSchema.optional().describe("Shift type"),
  title: z.string().optional().describe("Shift title"),
  note: z.string().optional().describe("Shift note"),
  active: z.boolean().optional().describe("Whether the shift is active"),
  technicianId: z.number().int().optional().describe("Technician ID"),
  start: z.string().datetime().optional().describe("Shift start timestamp"),
  end: z.string().datetime().optional().describe("Shift end timestamp"),
  timesheetCodeId: z.number().int().optional().describe("Timesheet code ID"),
});

const technicianShiftsBulkDeleteSchema = z.object({
  deletedIds: z
    .array(z.number().int().describe("Technician shift ID"))
    .optional()
    .describe("IDs of shifts to delete"),
});

const performanceGetSchema = paginationParams(
  z.object({
    fromUtc: z
      .string()
      .datetime()
      .describe("Start of filtering period in UTC"),
    toUtc: z.string().datetime().describe("End of filtering period in UTC"),
    performanceSegmentationType: z
      .enum(["Campaign", "AdGroup", "Keyword"])
      .describe("Performance segmentation type"),
  }),
);

export function registerPeopleTechnicianTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "people_technicians_create",
    domain: "people",
    operation: "write",
    description: "Create a technician",
    schema: technicianPayloadSchema.shape,
    handler: async (params) => {
      const input = technicianPayloadSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/technicians", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_technicians_get",
    domain: "people",
    operation: "read",
    description: "Get a technician by ID",
    schema: technicianIdSchema.shape,
    handler: async (params) => {
      const input = technicianIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/technicians/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_technicians_list",
    domain: "people",
    operation: "read",
    description: "List technicians",
    schema: technicianListSchema.shape,
    handler: async (params) => {
      const input = technicianListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/technicians",
          buildParams({
            ids: input.ids,
            userIds: input.userIds,
            name: input.name,
            active: input.active,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_technicians_update",
    domain: "people",
    operation: "write",
    description: "Update a technician",
    schema: technicianUpdateSchema.shape,
    handler: async (params) => {
      const parsed = technicianUpdateSchema.parse(params);
      const { id, ...payload } = parsed;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/technicians/${id}`,
          buildParams(payload),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_technicians_accountactions",
    domain: "people",
    operation: "write",
    description: "Run account actions for a technician",
    schema: technicianIdSchema.shape,
    handler: async (params) => {
      const input = technicianIdSchema.parse(params);

      try {
        const data = await client.post(`/tenant/{tenant}/technicians/${input.id}/account-actions`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_technician_ratings_update",
    domain: "people",
    operation: "write",
    description: "Update technician rating for a specific job",
    schema: {
      technicianId: z.number().int().describe("Technician ID"),
      jobId: z.number().int().describe("Job ID"),
    },
    handler: async (params) => {
      const { technicianId, jobId } = z
        .object({
          technicianId: z.number().int(),
          jobId: z.number().int(),
        })
        .parse(params);

      try {
        await client.put(
          `/tenant/{tenant}/technician-rating/technician/${technicianId}/job/${jobId}`,
        );
        return toolResult({
          success: true,
          message: "Technician rating updated successfully.",
        });
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_technician_shifts_create",
    domain: "people",
    operation: "write",
    description: "Create a technician shift",
    schema: technicianShiftCreateSchema.shape,
    handler: async (params) => {
      const input = technicianShiftCreateSchema.parse(params);

      try {
        const data = await client.post(
          "/tenant/{tenant}/technician-shifts",
          buildParams(input),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_technician_shifts_get",
    domain: "people",
    operation: "read",
    description: "Get a technician shift by ID",
    schema: technicianShiftIdSchema.shape,
    handler: async (params) => {
      const input = technicianShiftIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/technician-shifts/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_technician_shifts_list",
    domain: "people",
    operation: "read",
    description: "List technician shifts",
    schema: technicianShiftListSchema.shape,
    handler: async (params) => {
      const input = technicianShiftListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/technician-shifts",
          buildParams({
            startsOnOrAfter: input.startsOnOrAfter,
            endsOnOrBefore: input.endsOnOrBefore,
            shiftType: input.shiftType,
            technicianId: input.technicianId,
            titleContains: input.titleContains,
            noteContains: input.noteContains,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            active: input.active,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
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
    name: "people_technician_shifts_delete",
    domain: "people",
    operation: "delete",
    description: "Delete a technician shift",
    schema: technicianShiftIdSchema.shape,
    handler: async (params) => {
      const input = technicianShiftIdSchema.parse(params);

      try {
        const data = await client.delete(`/tenant/{tenant}/technician-shifts/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_technician_shifts_update",
    domain: "people",
    operation: "write",
    description: "Update a technician shift",
    schema: technicianShiftUpdateSchema.shape,
    handler: async (params) => {
      const parsed = technicianShiftUpdateSchema.parse(params);
      const { id, ...payload } = parsed;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/technician-shifts/${id}`,
          buildParams(payload),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_technician_shifts_bulk_delete",
    domain: "people",
    operation: "write",
    description: "Delete multiple technician shifts",
    schema: technicianShiftsBulkDeleteSchema.shape,
    handler: async (params) => {
      const input = technicianShiftsBulkDeleteSchema.parse(params);

      try {
        const data = await client.post(
          "/tenant/{tenant}/technician-shifts/bulk-delete",
          buildParams(input),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_performance_get",
    domain: "people",
    operation: "read",
    description: "Get performance segmented by campaign/ad group/keyword",
    schema: performanceGetSchema.shape,
    handler: async (params) => {
      const input = performanceGetSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/performance",
          buildParams({
            fromUtc: input.fromUtc,
            toUtc: input.toUtc,
            performanceSegmentationType: input.performanceSegmentationType,
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
}
