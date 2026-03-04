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

const glAccountCreateSchema = z.object({
  name: z.string().describe("GL account name"),
  number: z.string().describe("GL account number"),
  description: z.string().optional().describe("GL account description"),
  type: z.string().describe("GL account type"),
  subtype: z.string().describe("GL account subtype"),
  active: z.boolean().optional().describe("Whether account is active"),
  isIntacctGroup: z
    .boolean()
    .optional()
    .describe("Whether this is an Intacct group account"),
  isIntacctBankAccount: z
    .boolean()
    .optional()
    .describe("Whether this is an Intacct bank account"),
});

const glAccountUpdateSchema = glAccountCreateSchema.partial();

const glAccountsListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ids: z.string().optional().describe("Comma-delimited account IDs (max 50)"),
      names: z
        .string()
        .optional()
        .describe("Comma-delimited account names (max 50)"),
      numbers: z
        .string()
        .optional()
        .describe("Comma-delimited account numbers (max 50)"),
      types: z
        .string()
        .optional()
        .describe("Comma-delimited account types (max 50)"),
      subtypes: z
        .string()
        .optional()
        .describe("Comma-delimited account subtypes (max 50)"),
      description: z
        .string()
        .max(255)
        .optional()
        .describe("Description contains value"),
      source: z
        .enum(["Undefined", "AccountingSystem", "ManuallyCreated", "PublicApi"])
        .optional()
        .describe("Account source"),
      ...activeFilterParam(),
      isIntacctGroup: z
        .boolean()
        .optional()
        .describe("Only Intacct group accounts"),
      isIntacctBankAccount: z
        .boolean()
        .optional()
        .describe("Only Intacct bank accounts"),
      ...sortParam(["Id", "Name", "Number", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const glAccountTypesListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ids: z
        .string()
        .optional()
        .describe("Comma-delimited account type IDs (max 50)"),
      names: z
        .string()
        .optional()
        .describe("Comma-delimited account type names (max 50)"),
      ...activeFilterParam(),
      ...sortParam(["Id", "Name", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const glAccountGetSchema = z.object({
  accountId: z.number().int().describe("GL account ID"),
});

const glAccountUpdateInputSchema = z.object({
  accountId: z.number().int().describe("GL account ID"),
  payload: glAccountUpdateSchema
    .optional()
    .describe("Fields to patch on the GL account"),
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerGlAccountTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "accounting_gl_accounts_get",
    domain: "accounting",
    operation: "read",
    description: "Get a GL account by ID",
    schema: glAccountGetSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof glAccountGetSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/gl-accounts/${input.accountId}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_gl_accounts_create",
    domain: "accounting",
    operation: "write",
    description: "Create a GL account",
    schema: glAccountCreateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof glAccountCreateSchema>;

      try {
        const data = await client.post("/tenant/{tenant}/gl-accounts", input);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_gl_accounts_list",
    domain: "accounting",
    operation: "read",
    description: "List GL accounts",
    schema: glAccountsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof glAccountsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/gl-accounts",
          buildParams({
            ids: input.ids,
            names: input.names,
            numbers: input.numbers,
            types: input.types,
            subtypes: input.subtypes,
            description: input.description,
            source: input.source,
            active: input.active,
            isIntacctGroup: input.isIntacctGroup,
            isIntacctBankAccount: input.isIntacctBankAccount,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
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

  registry.register({
    name: "accounting_gl_accounts_update",
    domain: "accounting",
    operation: "write",
    description: "Patch a GL account",
    schema: glAccountUpdateInputSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof glAccountUpdateInputSchema>;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/gl-accounts/${input.accountId}`,
          input.payload,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_gl_account_types_list",
    domain: "accounting",
    operation: "read",
    description: "List GL account types",
    schema: glAccountTypesListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof glAccountTypesListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/gl-accounts/types",
          buildParams({
            ids: input.ids,
            names: input.names,
            active: input.active,
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
}
