import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, dateFilterParams, paginationParams, sortParam, toolError, toolResult } from "../../utils.js";
import { getErrorMessage } from "../intelligence/helpers.js";

const contactMethodPathSchema = z.object({
  contactId: z.string().uuid().describe("Contact ID"),
  contactMethodId: z.string().uuid().describe("Contact method ID"),
});

const contactMethodPayloadSchema = z.object({
  id: z.string().uuid().optional().describe("Contact method ID"),
  contactId: z.string().uuid().optional().describe("Contact ID"),
  referenceId: z.string().optional().describe("External reference ID"),
  type: z.string().optional().describe("Contact method type"),
  value: z.string().optional().describe("Contact method value"),
  memo: z.string().optional().describe("Contact method memo"),
  createdOn: z
    .string()
    .datetime()
    .optional()
    .describe("Contact method created timestamp"),
  createdBy: z.number().int().optional().describe("Creator user ID"),
  modifiedOn: z
    .string()
    .datetime()
    .optional()
    .describe("Contact method modified timestamp"),
  modifiedBy: z.number().int().optional().describe("Modifier user ID"),
});

const createContactMethodSchema = z.object({
  contactId: z.string().uuid().describe("Contact ID"),
  type: z.string().describe("Contact method type"),
  value: z.string().describe("Contact method value"),
  memo: z.string().optional().describe("Contact method memo"),
});

const listContactMethodsSchema = dateFilterParams(
  paginationParams(
    z.object({
      contactId: z.string().uuid().describe("Contact ID"),
      referenceId: z.string().optional().describe("Reference ID filter"),
      type: z.string().optional().describe("Contact method type filter"),
      value: z.string().optional().describe("Contact method value filter"),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const updateContactMethodSchema = z.object({
  contactId: z.string().uuid().describe("Contact ID"),
  contactMethodId: z.string().uuid().describe("Contact method ID"),
  payload: z
    .object({
      value: z.string().optional().describe("Contact method value"),
      memo: z.string().optional().describe("Contact method memo"),
    })
    .optional()
    .describe("Contact method patch payload"),
});

const upsertContactMethodSchema = z.object({
  contactId: z.string().uuid().describe("Contact ID"),
  contactMethodId: z.string().uuid().describe("Contact method ID"),
  payload: contactMethodPayloadSchema
    .optional()
    .describe("Contact method replace payload"),
});


export function registerContactMethodTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "crm_contact_methods_get",
    domain: "crm",
    operation: "read",
    description: "Get a contact method",
    schema: contactMethodPathSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof contactMethodPathSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/contacts/${input.contactId}/contact-methods/${input.contactMethodId}`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_contact_methods_create",
    domain: "crm",
    operation: "write",
    description: "Create a contact method",
    schema: createContactMethodSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof createContactMethodSchema>;

      try {
        const data = await client.post(
          `/tenant/{tenant}/contacts/${input.contactId}/contact-methods`,
          {
            type: input.type,
            value: input.value,
            memo: input.memo,
          },
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_contact_methods_list",
    domain: "crm",
    operation: "read",
    description: "List contact methods for a contact",
    schema: listContactMethodsSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof listContactMethodsSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/contacts/${input.contactId}/contact-methods`,
          buildParams({
            referenceId: input.referenceId,
            type: input.type,
            value: input.value,
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_contact_methods_update",
    domain: "crm",
    operation: "write",
    description: "Patch a contact method",
    schema: updateContactMethodSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof updateContactMethodSchema>;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/contacts/${input.contactId}/contact-methods/${input.contactMethodId}`,
          input.payload,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_contact_methods_upsert",
    domain: "crm",
    operation: "write",
    description: "Replace a contact method",
    schema: upsertContactMethodSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof upsertContactMethodSchema>;

      try {
        const data = await client.put(
          `/tenant/{tenant}/contacts/${input.contactId}/contact-methods/${input.contactMethodId}`,
          input.payload,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_contact_methods_delete",
    domain: "crm",
    operation: "delete",
    description: "Delete a contact method",
    schema: contactMethodPathSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof contactMethodPathSchema>;

      try {
        await client.delete(
          `/tenant/{tenant}/contacts/${input.contactId}/contact-methods/${input.contactMethodId}`,
        );

        return toolResult({
          success: true,
          message: "Contact method deleted successfully",
        });
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
