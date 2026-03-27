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
import { getErrorMessage } from "../intelligence/helpers.js";

const leadStatusSchema = z.enum(["Open", "Dismissed", "Converted"]);

const leadIdSchema = z.object({
  id: z.number().int().describe("Lead ID"),
});

const leadPayloadSchema = z.object({
  campaignId: z.number().int().optional().describe("Campaign ID"),
  customerId: z.number().int().optional().describe("Customer ID"),
  locationId: z.number().int().optional().describe("Location ID"),
  businessUnitId: z.number().int().optional().describe("Business unit ID"),
  jobTypeId: z.number().int().optional().describe("Job type ID"),
  source: z.string().optional().describe("Lead source"),
  summary: z.string().optional().describe("Lead summary"),
  status: leadStatusSchema.optional().describe("Lead status"),
  priority: z.string().optional().describe("Lead priority"),
  firstName: z.string().optional().describe("First name"),
  lastName: z.string().optional().describe("Last name"),
  phone: z.string().optional().describe("Phone number"),
  email: z.string().optional().describe("Email address"),
  street: z.string().optional().describe("Street"),
  unit: z.string().optional().describe("Unit"),
  city: z.string().optional().describe("City"),
  state: z.string().optional().describe("State"),
  zip: z.string().optional().describe("Zip code"),
  country: z.string().optional().describe("Country"),
  isProspect: z.boolean().optional().describe("Prospect flag"),
  callReason: z.string().optional().describe("Lead call reason"),
  value: z.number().optional().describe("Lead value"),
  externalId: z.string().optional().describe("External ID"),
});

const leadUpdateSchema = z.object({
  id: z.number().int().describe("Lead ID"),
  payload: leadPayloadSchema.optional().describe("Lead patch payload"),
});

const leadCreateSchema = z.object({
  payload: leadPayloadSchema.describe("Lead create payload"),
});

const leadCreateFollowUpSchema = z.object({
  id: z.number().int().describe("Lead ID"),
  followUpDate: z.string().describe("Follow-up date"),
  text: z.string().describe("Follow-up text"),
  pinToTop: z.boolean().describe("Pin follow-up to top"),
});

const leadCreateNoteSchema = z.object({
  id: z.number().int().describe("Lead ID"),
  text: z.string().describe("Note text"),
  isPinned: z.boolean().optional().describe("Pinned flag"),
});

const leadNotesListSchema = dateFilterParams(
  paginationParams(
    z.object({
      id: z.number().int().describe("Lead ID"),
    }),
  ),
);

const leadListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ids: z.string().optional().describe("Comma-delimited lead IDs"),
      customerId: z.number().int().optional().describe("Associated customer ID"),
      isProspect: z.boolean().optional().describe("Filter by prospect state"),
      withoutCustomer: z.boolean().optional().describe("Filter by missing customer/location"),
      status: leadStatusSchema.optional().describe("Lead status"),
      customerCity: z.string().optional().describe("Filter by customer city"),
      customerState: z.string().optional().describe("Filter by customer state"),
      customerZip: z.string().optional().describe("Filter by customer zip"),
      customerCreatedOnOrAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Customer created on/after timestamp"),
      customerCreatedBefore: z
        .string()
        .datetime()
        .optional()
        .describe("Customer created before timestamp"),
      customerModifiedOnOrAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Customer modified on/after timestamp"),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
      genPermUrl: z.boolean().optional().describe("Generate permanent URL"),
    }),
  ),
);

const leadFormSubmitSchema = z.object({
  id: z.number().int().optional().describe("Lead form ID"),
});


export function registerLeadTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "crm_leads_get",
    domain: "crm",
    operation: "read",
    description: "Get a lead by ID",
    schema: leadIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof leadIdSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/leads/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_leads_update",
    domain: "crm",
    operation: "write",
    description: "Patch a lead",
    schema: leadUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof leadUpdateSchema>;

      try {
        const data = await client.patch(`/tenant/{tenant}/leads/${input.id}`, input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_leads_create",
    domain: "crm",
    operation: "write",
    description: "Create a lead",
    schema: leadCreateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof leadCreateSchema>;

      try {
        const data = await client.post("/tenant/{tenant}/leads", input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_leads_follow_ups_create",
    domain: "crm",
    operation: "write",
    description: "Create a follow-up for a lead",
    schema: leadCreateFollowUpSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof leadCreateFollowUpSchema>;

      try {
        const data = await client.post(`/tenant/{tenant}/leads/${input.id}/follow-up`, {
          followUpDate: input.followUpDate,
          text: input.text,
          pinToTop: input.pinToTop,
        });

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_leads_notes_create",
    domain: "crm",
    operation: "write",
    description: "Create a note for a lead",
    schema: leadCreateNoteSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof leadCreateNoteSchema>;

      try {
        const data = await client.post(`/tenant/{tenant}/leads/${input.id}/notes`, {
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
    name: "crm_leads_notes_list",
    domain: "crm",
    operation: "read",
    description: "List notes for a lead",
    schema: leadNotesListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof leadNotesListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/leads/${input.id}/notes`,
          buildParams({
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
    name: "crm_leads_list",
    domain: "crm",
    operation: "read",
    description: "List leads",
    schema: leadListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof leadListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/leads",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            ids: input.ids,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            customerId: input.customerId,
            isProspect: input.isProspect,
            withoutCustomer: input.withoutCustomer,
            status: input.status,
            customerCity: input.customerCity,
            customerState: input.customerState,
            customerZip: input.customerZip,
            customerCreatedOnOrAfter: input.customerCreatedOnOrAfter,
            customerCreatedBefore: input.customerCreatedBefore,
            customerModifiedOnOrAfter: input.customerModifiedOnOrAfter,
            sort: input.sort,
            genPermUrl: input.genPermUrl,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_leads_dismiss",
    domain: "crm",
    operation: "write",
    description: "Dismiss a lead",
    schema: leadIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof leadIdSchema>;

      try {
        const data = await client.post(`/tenant/{tenant}/leads/${input.id}/dismiss`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_leads_form_submit",
    domain: "crm",
    operation: "write",
    description: "Submit a lead form",
    schema: leadFormSubmitSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof leadFormSubmitSchema>;

      try {
        const data = await client.post(
          "/tenant/{tenant}/leads/form",
          {},
          buildParams({ id: input.id }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
