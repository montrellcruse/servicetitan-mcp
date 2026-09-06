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

const locationAddressSchema = z.object({
  street: z.string().optional().describe("Street"),
  unit: z.string().optional().describe("Unit"),
  city: z.string().optional().describe("City"),
  state: z.string().optional().describe("State"),
  zip: z.string().optional().describe("Zip code"),
  country: z.string().optional().describe("Country"),
  latitude: z.number().optional().describe("Latitude"),
  longitude: z.number().optional().describe("Longitude"),
});

const locationCustomFieldSchema = z.object({
  typeId: z.number().int().optional().describe("Custom field type ID"),
  name: z.string().optional().describe("Custom field name"),
  value: z.string().optional().describe("Custom field value"),
});

const locationExternalDataSchema = z.object({
  key: z.string().optional().describe("External data key"),
  value: z.string().optional().describe("External data value"),
});

const locationContactSchema = z.object({
  type: z.string().optional().describe("Contact type"),
  value: z.string().optional().describe("Contact value"),
  memo: z.string().optional().describe("Contact memo"),
});

const locationPhoneSettingsSchema = z.object({
  phoneNumber: z.string().optional().describe("Phone number"),
  doNotText: z.boolean().optional().describe("Do not text flag"),
});

const locationIdSchema = z.object({
  id: z.number().int().describe("Location ID"),
});

const locationNoteSchema = z.object({
  id: z.number().int().describe("Location ID"),
  noteId: z.number().int().describe("Note ID"),
});

const locationContactIdSchema = z.object({
  id: z.number().int().describe("Location ID"),
  contactId: z.number().int().describe("Contact ID"),
});

const locationTagSchema = z.object({
  id: z.number().int().describe("Location ID"),
  tagTypeId: z.number().int().describe("Tag type ID"),
});

const locationUpdatePayloadSchema = z.object({
  customerId: z.number().int().optional().describe("Customer ID"),
  active: z.boolean().optional().describe("Active flag"),
  name: z.string().optional().describe("Location name"),
  address: locationAddressSchema.optional().describe("Address"),
  customFields: z.array(locationCustomFieldSchema).optional().describe("Custom fields"),
  zoneId: z.number().int().optional().describe("Zone ID"),
  tagTypeIds: z.array(z.number().int()).optional().describe("Tag type IDs"),
  externalData: z.array(locationExternalDataSchema).optional().describe("External data entries"),
  taxZoneId: z.number().int().optional().describe("Tax zone ID"),
});

const locationUpdateSchema = z.object({
  id: z.number().int().describe("Location ID"),
  payload: locationUpdatePayloadSchema.optional().describe("Location patch payload"),
});

const locationCreateSchema = officialRequestSchema("Locations_Create") as z.ZodObject<z.ZodRawShape>;

const locationListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ids: z.string().optional().describe("Comma-delimited location IDs"),
      name: z.string().optional().describe("Filter by location name"),
      customerId: z.number().int().optional().describe("Filter by customer ID"),
      street: z.string().optional().describe("Filter by street"),
      unit: z.string().optional().describe("Filter by unit"),
      city: z.string().optional().describe("Filter by city"),
      state: z.string().optional().describe("Filter by state"),
      zip: z.string().optional().describe("Filter by zip"),
      country: z.string().optional().describe("Filter by country"),
      latitude: z.number().optional().describe("Filter by latitude"),
      longitude: z.number().optional().describe("Filter by longitude"),
      ...activeFilterParam(),
      externalDataApplicationGuid: z
        .string()
        .uuid()
        .optional()
        .describe("External data application GUID"),
      externalDataKey: z.string().optional().describe("External data key"),
      externalDataValues: z.string().optional().describe("External data values"),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const locationNotesListSchema = dateFilterParams(
  paginationParams(
    z.object({
      id: z.number().int().describe("Location ID"),
    }),
  ),
);

const locationCreateNoteSchema = (officialRequestSchema("Locations_CreateNote") as z.ZodObject<z.ZodRawShape>).extend({ id: z.number().int() });

const locationContactsListSchema = paginationParams(
  z.object({
    id: z.number().int().describe("Location ID"),
  }),
);

const locationCreateContactSchema = (officialRequestSchema("Locations_CreateContact") as z.ZodObject<z.ZodRawShape>).extend({ id: z.number().int() });
const locationUpdateContactSchema = (officialRequestSchema("Locations_UpdateContact") as z.ZodObject<z.ZodRawShape>).extend({ id: z.number().int(), contactId: z.number().int() });

const locationModifiedContactsListSchema = dateFilterParams(
  paginationParams(
    z.object({
      locationIds: z.string().optional().describe("Comma-delimited location IDs"),
    }),
  ),
);

const locationCustomFieldTypesSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const locationLaborTypesListSchema = paginationParams(
  z
    .object({
      locationIds: z.string().optional().describe("Comma-delimited location IDs"),
      createdBefore: z.string().datetime().optional().describe("Created before timestamp"),
      createdOnOrAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Created on or after timestamp"),
      sort: z
        .string()
        .optional()
        .describe("Sort: +Location/-Location or +CreatedOn/-CreatedOn"),
    })
    .extend(activeFilterParam()),
);


export function registerLocationTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "crm_locations_get",
    domain: "crm",
    operation: "read",
    description: "Retrieve one service-location record by ID, including its customer and address data. Use crm_locations_list to search by customer, address, external data, activity, or date ranges.",
    schema: locationIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationIdSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/locations/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_locations_update",
    domain: "crm",
    operation: "write",
    description: "Patch a location",
    schema: locationUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationUpdateSchema>;

      try {
        const data = await client.patch(`/tenant/{tenant}/locations/${input.id}`, input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_locations_create",
    domain: "crm",
    operation: "write",
    description: "Create a location",
    schema: locationCreateSchema.shape,
    handler: async (params) => {
      const input = locationCreateSchema.parse(params);

      try {
        const data = await client.post(
          "/tenant/{tenant}/locations",
          input,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_locations_list",
    domain: "crm",
    operation: "read",
    description: "Search service locations by IDs, customer, name, address, coordinates, external data, activity, or date ranges. Returns one page; use crm_locations_get for a known ID.",
    schema: locationListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/locations",
          buildParams({
            ids: input.ids,
            name: input.name,
            customerId: input.customerId,
            street: input.street,
            unit: input.unit,
            city: input.city,
            state: input.state,
            zip: input.zip,
            country: input.country,
            latitude: input.latitude,
            longitude: input.longitude,
            active: input.active,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            sort: input.sort,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            externalDataApplicationGuid: input.externalDataApplicationGuid,
            externalDataKey: input.externalDataKey,
            externalDataValues: input.externalDataValues,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_locations_notes_list",
    domain: "crm",
    operation: "read",
    description: "List one page of notes attached to a known service location, optionally filtered by created or modified timestamps. Requires the location ID.",
    schema: locationNotesListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationNotesListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/locations/${input.id}/notes`,
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
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_locations_notes_create",
    domain: "crm",
    operation: "write",
    description: "Create a note for a location",
    schema: locationCreateNoteSchema.shape,
    handler: async (params) => {
      const input = locationCreateNoteSchema.parse(params); const { id, ...body } = input;

      try {
        const data = await client.post(`/tenant/{tenant}/locations/${id}/notes`, body);

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_locations_notes_delete",
    domain: "crm",
    operation: "delete",
    description: "Delete a location note",
    schema: locationNoteSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationNoteSchema>;

      try {
        await client.delete(`/tenant/{tenant}/locations/${input.id}/notes/${input.noteId}`);
        return toolResult({
          success: true,
          message: "Location note deleted successfully",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_locations_contacts_list",
    domain: "crm",
    operation: "read",
    description: "List one page of contacts attached to a known service location. Use crm_locations_contacts_modified_list for cross-location incremental contact queries.",
    schema: locationContactsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationContactsListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/locations/${input.id}/contacts`,
          buildParams({
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

  registry.register({
    name: "crm_locations_contacts_create",
    domain: "crm",
    operation: "write",
    description: "Create a contact for a location",
    schema: locationCreateContactSchema.shape,
    handler: async (params) => {
      const input = locationCreateContactSchema.parse(params); const { id, ...body } = input;

      try {
        const data = await client.post(
          `/tenant/{tenant}/locations/${id}/contacts`, body,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_locations_contacts_delete",
    domain: "crm",
    operation: "delete",
    description: "Delete a location contact",
    schema: locationContactIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationContactIdSchema>;

      try {
        await client.delete(`/tenant/{tenant}/locations/${input.id}/contacts/${input.contactId}`);
        return toolResult({
          success: true,
          message: "Location contact deleted successfully",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_locations_contacts_update",
    domain: "crm",
    operation: "write",
    description: "Patch a location contact",
    schema: locationUpdateContactSchema.shape,
    handler: async (params) => {
      const input = locationUpdateContactSchema.parse(params); const { id, contactId, ...body } = input;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/locations/${id}/contacts/${contactId}`, body,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_locations_contacts_modified_list",
    domain: "crm",
    operation: "read",
    description: "Search contact records across specified locations using created or modified time ranges. Returns one page; use crm_locations_contacts_list for all contacts of one known location.",
    schema: locationModifiedContactsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationModifiedContactsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/locations/contacts",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            locationIds: input.locationIds,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_locations_tags_create",
    domain: "crm",
    operation: "write",
    description: "Create a tag assignment for a location",
    schema: locationTagSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationTagSchema>;

      try {
        const data = await client.post(
          `/tenant/{tenant}/locations/${input.id}/tags/${input.tagTypeId}`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_locations_tags_delete",
    domain: "crm",
    operation: "delete",
    description: "Delete a tag assignment from a location",
    schema: locationTagSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationTagSchema>;

      try {
        await client.delete(`/tenant/{tenant}/locations/${input.id}/tags/${input.tagTypeId}`);
        return toolResult({
          success: true,
          message: "Location tag deleted successfully",
        });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_locations_custom_field_types_list",
    domain: "crm",
    operation: "read",
    description: "List one page of custom-field type definitions available to locations, with created and modified date filters. This returns field metadata, not values for one location.",
    schema: locationCustomFieldTypesSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationCustomFieldTypesSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/locations/custom-fields",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
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
    name: "crm_location_labor_types_list",
    domain: "crm",
    operation: "read",
    description: "List one page of labor-type assignment records for specified location IDs, optionally filtered by active state or creation time. Use this to determine which labor types apply across known service locations.",
    schema: locationLaborTypesListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationLaborTypesListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/locations/rates",
          buildParams({
            locationIds: input.locationIds,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            active: input.active,
            sort: input.sort,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
