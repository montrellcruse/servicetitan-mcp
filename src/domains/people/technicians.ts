import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { officialRequestSchema } from "../../contracts/index.js";
import {
  activeFilterParam,
  buildParams,
  dateFilterParams,
  paginationParams,
  sortParam,
  toolError,
  toolResult,
} from "../../utils.js";
const technicianPayloadSchema = officialRequestSchema("Technicians_Create") as z.ZodObject<z.ZodRawShape>;
const technicianUpdatePayloadSchema = officialRequestSchema("Technicians_Update") as z.ZodObject<z.ZodRawShape>;

const technicianIdSchema = z.object({
  id: z.number().int().describe("Technician ID"),
});

const technicianUpdateSchema = technicianUpdatePayloadSchema.extend({
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

const repeatTypeSchema = z.enum(["Never", "Daily", "Weekly"]);

const technicianShiftCreateSchema = z.object({
  technicianIds: z
    .array(z.number().int())
    .min(1)
    .describe("Technician IDs to assign the shift to (one or more)"),
  start: z.string().datetime().describe("Shift start timestamp (ISO UTC)"),
  end: z.string().datetime().describe("Shift end timestamp (ISO UTC)"),
  shiftType: shiftTypeSchema.describe("Shift type"),
  title: z.string().min(1).describe("Shift title"),
  repeatType: repeatTypeSchema.describe(
    "Repeat type. Use 'Never' for a single shift or 'Daily'/'Weekly' for recurrence.",
  ),
  repeatEndDate: z
    .string()
    .datetime()
    .optional()
    .describe("Optional end date for recurrence"),
  repeatInterval: z.number().int().optional(),
  shiftDays: z.string().optional().describe("Comma-delimited weekdays for weekly recurrence"),
  note: z.string().optional().describe("Shift note"),
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
  start: z.string().datetime().optional().describe("Shift start timestamp"),
  end: z.string().datetime().optional().describe("Shift end timestamp"),
  timesheetCodeId: z.number().int().optional().describe("Timesheet code ID"),
});

const technicianShiftsBulkDeleteSchema = z.object({
  start: z.string().datetime().describe("Start of the shift deletion range"),
  end: z.string().datetime().describe("End of the shift deletion range"),
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
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "people_technicians_get",
    domain: "people",
    operation: "read",
    description: "Retrieve one technician by its required ID. Use people_technicians_list to search when the technician ID is unknown.",
    schema: technicianIdSchema.shape,
    handler: async (params) => {
      const input = technicianIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/technicians/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "people_technicians_list",
    domain: "people",
    operation: "read",
    description: "List one requested page of technicians, optionally filtered by IDs, user IDs, name, active state, or dates. Use the get tool for one known ID or the export feed for synchronization.",
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
        return toolError(error);
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
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "people_technicians_accountactions",
    domain: "people",
    operation: "write",
    description: "Run account actions for a technician",
    schema: {
      ...technicianIdSchema.shape,
      action: z.enum(["Activate", "Deactivate", "SendInvite", "SendPasswordResetLink"]),
      licenseType: z.enum(["NonManagedTechnician", "ManagedTechnician", "ManagedInstaller"]).nullable().optional(),
      truckId: z.number().int().nullable().optional(),
    },
    handler: async (params) => {
      const input = technicianIdSchema.extend({
        action: z.enum(["Activate", "Deactivate", "SendInvite", "SendPasswordResetLink"]),
        licenseType: z.enum(["NonManagedTechnician", "ManagedTechnician", "ManagedInstaller"]).nullable().optional(),
        truckId: z.number().int().nullable().optional(),
      }).parse(params);
      const { id, ...body } = input;

      try {
        const data = await client.post(`/tenant/{tenant}/technicians/${id}/account-actions`, body);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
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
      value: z.number().min(0).max(10).describe("Rating from 0 to 10"),
    },
    handler: async (params) => {
      const { technicianId, jobId, value } = z
        .object({
          technicianId: z.number().int(),
          jobId: z.number().int(),
          value: z.number().min(0).max(10),
        })
        .parse(params);

      try {
        await client.put(
          `/tenant/{tenant}/technician-rating/technician/${technicianId}/job/${jobId}`,
          { value },
        );
        return toolResult({
          success: true,
          message: "Technician rating updated successfully.",
        });
      } catch (error: unknown) {
        return toolError(error);
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
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "people_technician_shifts_get",
    domain: "people",
    operation: "read",
    description: "Retrieve one technician shift by its required ID. Use people_technician_shifts_list to search when the shift ID is unknown.",
    schema: technicianShiftIdSchema.shape,
    handler: async (params) => {
      const input = technicianShiftIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/technician-shifts/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "people_technician_shifts_list",
    domain: "people",
    operation: "read",
    description: "List one requested page of technician shifts, including normal, on-call, and time-off shifts. Filter by technician, time bounds, text, type, or active state; use the get tool for one known shift ID.",
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
        return toolError(error);
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
        return toolError(error);
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
        return toolError(error);
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
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "people_performance_get",
    domain: "people",
    operation: "read",
    description: "Retrieve one requested page of marketing performance metrics for a UTC period, segmented by campaign, ad group, or keyword. Use this to compare acquisition performance at one selected grain.",
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
        return toolError(error);
      }
    },
  });
}
