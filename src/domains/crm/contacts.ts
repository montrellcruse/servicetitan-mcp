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

const contactIdSchema = z.object({
  id: z.string().uuid().describe("Contact ID"),
});

const contactPayloadSchema = z.object({
  id: z.string().uuid().optional().describe("Contact ID"),
  referenceId: z.string().optional().describe("External reference ID"),
  name: z.string().optional().describe("Contact name"),
  title: z.string().optional().describe("Contact title"),
  isArchived: z.boolean().optional().describe("Archived flag"),
  createdOn: z.string().datetime().optional().describe("Created timestamp"),
  createdBy: z.number().int().optional().describe("Created by user ID"),
  modifiedOn: z.string().datetime().optional().describe("Modified timestamp"),
  modifiedBy: z.number().int().optional().describe("Modified by user ID"),
}).passthrough();

const contactReplaceSchema = z.object({
  id: z.string().uuid().describe("Contact ID"),
  body: contactPayloadSchema.describe("Contact replacement payload"),
});

const contactUpdateSchema = z.object({
  id: z.string().uuid().describe("Contact ID"),
  referenceId: z.string().optional().describe("External reference ID"),
  name: z.string().optional().describe("Contact name"),
  title: z.string().optional().describe("Contact title"),
  isArchived: z.boolean().optional().describe("Archived flag"),
});

const contactsCreateSchema = contactPayloadSchema;

const contactListFiltersSchema = dateFilterParams(
  paginationParams(
    z.object({
      name: z.string().optional().describe("Filter by contact name"),
      title: z.string().optional().describe("Filter by contact title"),
      referenceId: z.string().optional().describe("Filter by external reference ID"),
      isArchived: z.string().optional().describe("Filter by archive status"),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const contactsByRelationshipListSchema = contactListFiltersSchema.extend({
  relationshipId: z.number().int().describe("Contact relationship ID"),
});

const contactRelationshipPathSchema = z.object({
  contactId: z.string().uuid().describe("Contact ID"),
  relatedEntityId: z.number().int().describe("Related entity ID"),
  typeSlug: z.string().describe("Relationship type slug"),
});

const contactRelationshipListSchema = paginationParams(
  z.object({
    contactId: z.string().uuid().describe("Contact ID"),
    relatedEntityId: z.number().int().optional().describe("Related entity ID filter"),
    typeSlug: z.string().optional().describe("Relationship type slug filter"),
    typeName: z.string().optional().describe("Relationship type name filter"),
    createdBefore: z
      .string()
      .datetime()
      .optional()
      .describe("List relationships created before this timestamp"),
    createdOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("List relationships created on/after this timestamp"),
    ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
  }),
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerContactTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "crm_contacts_get",
    domain: "crm",
    operation: "read",
    description: "Get a contact by ID",
    schema: contactIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof contactIdSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/contacts/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_contacts_delete",
    domain: "crm",
    operation: "delete",
    description: "Delete a contact",
    schema: contactIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof contactIdSchema>;

      try {
        await client.delete(`/tenant/{tenant}/contacts/${input.id}`);
        return toolResult({
          success: true,
          message: "Contact deleted successfully",
        });
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_contacts_replace",
    domain: "crm",
    operation: "write",
    description: "Replace a contact",
    schema: contactReplaceSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof contactReplaceSchema>;

      try {
        const data = await client.put(`/tenant/{tenant}/contacts/${input.id}`, input.body);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_contacts_update",
    domain: "crm",
    operation: "write",
    description: "Patch a contact",
    schema: contactUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof contactUpdateSchema>;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/contacts/${input.id}`,
          buildParams({
            referenceId: input.referenceId,
            name: input.name,
            title: input.title,
            isArchived: input.isArchived,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_contacts_create",
    domain: "crm",
    operation: "write",
    description: "Create a contact",
    schema: contactsCreateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof contactsCreateSchema>;

      try {
        const data = await client.post(
          "/tenant/{tenant}/contacts",
          buildParams({
            id: input.id,
            referenceId: input.referenceId,
            name: input.name,
            title: input.title,
            isArchived: input.isArchived,
            createdOn: input.createdOn,
            createdBy: input.createdBy,
            modifiedOn: input.modifiedOn,
            modifiedBy: input.modifiedBy,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_contacts_by_relationship_list",
    domain: "crm",
    operation: "read",
    description: "List contacts by relationship ID",
    schema: contactsByRelationshipListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof contactsByRelationshipListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/contacts/relationships/${input.relationshipId}`,
          buildParams({
            name: input.name,
            title: input.title,
            referenceId: input.referenceId,
            isArchived: input.isArchived,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            sort: input.sort,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_contacts_list",
    domain: "crm",
    operation: "read",
    description: "List contacts",
    schema: contactListFiltersSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof contactListFiltersSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/contacts",
          buildParams({
            name: input.name,
            title: input.title,
            referenceId: input.referenceId,
            isArchived: input.isArchived,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            sort: input.sort,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_contact_relationships_delete",
    domain: "crm",
    operation: "delete",
    description: "Delete a contact relationship",
    schema: contactRelationshipPathSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof contactRelationshipPathSchema>;

      try {
        await client.delete(
          `/tenant/{tenant}/contacts/${input.contactId}/relationships/${input.relatedEntityId}/${input.typeSlug}`,
        );

        return toolResult({
          success: true,
          message: "Contact relationship deleted successfully",
        });
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_contact_relationships_create",
    domain: "crm",
    operation: "write",
    description: "Create a contact relationship",
    schema: contactRelationshipPathSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof contactRelationshipPathSchema>;

      try {
        const data = await client.post(
          `/tenant/{tenant}/contacts/${input.contactId}/relationships/${input.relatedEntityId}/${input.typeSlug}`,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_contact_relationships_list",
    domain: "crm",
    operation: "read",
    description: "List relationships for a contact",
    schema: contactRelationshipListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof contactRelationshipListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/contacts/${input.contactId}/relationships`,
          buildParams({
            relatedEntityId: input.relatedEntityId,
            typeSlug: input.typeSlug,
            typeName: input.typeName,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            sort: input.sort,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });
}
