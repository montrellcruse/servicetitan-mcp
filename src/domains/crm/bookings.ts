import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, dateFilterParams, paginationParams, sortParam, toolError, toolResult } from "../../utils.js";
import { getErrorMessage } from "../intelligence/helpers.js";

const bookingIdSchema = z.object({
  id: z.number().int().describe("Booking ID"),
});

const bookingProviderScopedIdSchema = z.object({
  bookingProvider: z.number().int().describe("Booking provider ID"),
  id: z.number().int().describe("Booking ID"),
});

const bookingListFilterSchema = dateFilterParams(
  paginationParams(
    z.object({
      ids: z.string().optional().describe("Comma-delimited booking IDs (max 50)"),
      externalId: z.string().optional().describe("External booking ID"),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const bookingBodySchema = z.object({
  externalId: z.string().optional().describe("External booking ID"),
  start: z.string().optional().describe("Booking start date-time"),
  end: z.string().optional().describe("Booking end date-time"),
  notes: z.string().optional().describe("Booking notes"),
  summary: z.string().optional().describe("Booking summary"),
  customerId: z.number().int().optional().describe("Customer ID"),
  locationId: z.number().int().optional().describe("Location ID"),
  leadId: z.number().int().optional().describe("Lead ID"),
  campaignId: z.number().int().optional().describe("Campaign ID"),
});

const bookingProviderUpdateSchema = z.object({
  bookingProvider: z.number().int().describe("Booking provider ID"),
  id: z.number().int().describe("Booking ID"),
  payload: bookingBodySchema.optional().describe("Booking patch payload"),
});

const bookingProviderCreateSchema = z.object({
  bookingProvider: z.number().int().describe("Booking provider ID"),
  body: bookingBodySchema.describe("Booking create payload"),
});

const bookingContactSchema = z.object({
  type: z.string().describe("Contact type"),
  value: z.string().describe("Contact value"),
  memo: z.string().optional().describe("Contact memo"),
});

const bookingCreateContactSchema = z.object({
  bookingProvider: z.number().int().describe("Booking provider ID"),
  id: z.number().int().describe("Booking ID"),
  type: z.string().describe("Contact type"),
  value: z.string().describe("Contact value"),
  memo: z.string().optional().describe("Contact memo"),
});

const bookingUpdateContactSchema = z.object({
  bookingProvider: z.number().int().describe("Booking provider ID"),
  id: z.number().int().describe("Booking ID"),
  contactId: z.number().int().describe("Contact ID"),
  type: z.string().describe("Contact type"),
  value: z.string().describe("Contact value"),
  memo: z.string().optional().describe("Contact memo"),
});

const bookingContactsListSchema = paginationParams(
  z.object({
    id: z.number().int().describe("Booking ID"),
  }),
);

const bookingProviderContactsListSchema = paginationParams(
  z.object({
    bookingProvider: z.number().int().describe("Booking provider ID"),
    id: z.number().int().describe("Booking ID"),
  }),
);

const bookingProviderListSchema = bookingListFilterSchema.extend({
  bookingProvider: z.number().int().describe("Booking provider ID"),
});


export function registerBookingTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "crm_bookings_get",
    domain: "crm",
    operation: "read",
    description: "Get a booking by ID",
    schema: bookingIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingIdSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/bookings/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_bookings_provider_get",
    domain: "crm",
    operation: "read",
    description: "Get a provider-scoped booking",
    schema: bookingProviderScopedIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingProviderScopedIdSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings/${input.id}`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_bookings_contacts_list",
    domain: "crm",
    operation: "read",
    description: "List contacts for a booking",
    schema: bookingContactsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingContactsListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/bookings/${input.id}/contacts`,
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
    name: "crm_bookings_list",
    domain: "crm",
    operation: "read",
    description: "List bookings",
    schema: bookingListFilterSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingListFilterSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/bookings",
          buildParams({
            ids: input.ids,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            externalId: input.externalId,
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
    name: "crm_bookings_provider_update",
    domain: "crm",
    operation: "write",
    description: "Patch a provider-scoped booking",
    schema: bookingProviderUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingProviderUpdateSchema>;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings/${input.id}`,
          input.payload,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_bookings_provider_create",
    domain: "crm",
    operation: "write",
    description: "Create a booking for a booking provider",
    schema: bookingProviderCreateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingProviderCreateSchema>;

      try {
        const data = await client.post(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings`,
          input.body,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_bookings_provider_contacts_create",
    domain: "crm",
    operation: "write",
    description: "Create a contact on a provider-scoped booking",
    schema: bookingCreateContactSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingCreateContactSchema>;

      try {
        const body = bookingContactSchema.parse({
          type: input.type,
          value: input.value,
          memo: input.memo,
        });

        const data = await client.post(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings/${input.id}/contacts`,
          body,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_bookings_provider_list",
    domain: "crm",
    operation: "read",
    description: "List bookings for a booking provider",
    schema: bookingProviderListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingProviderListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings`,
          buildParams({
            ids: input.ids,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            externalId: input.externalId,
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
    name: "crm_bookings_provider_contacts_list",
    domain: "crm",
    operation: "read",
    description: "List contacts for a provider-scoped booking",
    schema: bookingProviderContactsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingProviderContactsListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings/${input.id}/contacts`,
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
    name: "crm_bookings_get_contact_list2",
    domain: "crm",
    operation: "read",
    description: "List contacts for a provider-scoped booking (legacy naming)",
    schema: bookingProviderContactsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingProviderContactsListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings/${input.id}/contacts`,
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
    name: "crm_bookings_provider_contacts_update",
    domain: "crm",
    operation: "write",
    description: "Patch a provider-scoped booking contact",
    schema: bookingUpdateContactSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingUpdateContactSchema>;

      try {
        const body = bookingContactSchema.parse({
          type: input.type,
          value: input.value,
          memo: input.memo,
        });

        const data = await client.patch(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings/${input.id}/contacts/${input.contactId}`,
          body,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_bookings_updatebookingcontact",
    domain: "crm",
    operation: "write",
    description: "Patch a provider-scoped booking contact (legacy naming)",
    schema: bookingUpdateContactSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingUpdateContactSchema>;

      try {
        const body = bookingContactSchema.parse({
          type: input.type,
          value: input.value,
          memo: input.memo,
        });

        const data = await client.patch(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings/${input.id}/contacts/${input.contactId}`,
          body,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
