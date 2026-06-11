import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import {
  activeFilterParam,
  buildParams,
  dateFilterParams,
  paginationParams,
  toolError,
  toolResult,
  getErrorMessage,
} from "../../utils.js";

const templateIdSchema = z.object({
  id: z.number().int().describe("Template ID"),
});

const estimateTemplateItemSchema = z.object({
  id: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Existing template item ID to update; omit or null to create a new item"),
  skuId: z.number().int().describe("Pricebook SKU ID"),
  skuType: z
    .enum(["Service", "Material", "Equipment", "PriceModifier"])
    .describe("Pricebook SKU type"),
  description: z.string().nullable().optional().describe("Item description"),
  quantity: z.number().describe("Item quantity"),
  unitPrice: z
    .number()
    .nullable()
    .optional()
    .describe("Unit price. Required by ServiceTitan for Static estimate templates."),
  isAddOn: z.boolean().describe("Whether the item is an add-on"),
  chargeable: z.boolean().nullable().optional().describe("Whether the item is chargeable"),
  allowDiscounts: z
    .boolean()
    .nullable()
    .optional()
    .describe("Whether discounts are allowed for the item"),
  unitCost: z.number().nullable().optional().describe("Unit cost"),
  memo: z.string().nullable().optional().describe("Item memo"),
  parentItemId: z.number().int().nullable().optional().describe("Parent item ID"),
  itemGroupParentId: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Item group parent ID"),
  itemGroupName: z.string().nullable().optional().describe("Item group name"),
  projectLabels: z
    .string()
    .nullable()
    .optional()
    .describe("Project labels. Empty string clears labels; null leaves labels unchanged."),
});

const estimateTemplateListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...activeFilterParam(),
    }),
  ),
);

const estimateTemplatePayloadSchema = z.object({
  name: z.string().optional().describe("Estimate template name"),
  internalName: z.string().optional().describe("Internal estimate template name"),
  summary: z
    .string()
    .nullable()
    .optional()
    .describe("Template summary. For PATCH, omit or null to leave unchanged."),
  mode: z.enum(["Dynamic", "Static"]).optional().describe("Estimate template mode"),
  active: z.boolean().optional().describe("Whether the template is active"),
  businessUnitId: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Business unit ID. For PATCH, omit or null to leave unchanged."),
  items: z
    .array(estimateTemplateItemSchema)
    .optional()
    .describe("Template items. For PATCH, providing this list replaces all existing items; omit to preserve."),
});

const estimateTemplateCreateSchema = estimateTemplatePayloadSchema.extend({
  name: z.string().describe("Estimate template name"),
  internalName: z.string().describe("Internal estimate template name"),
  mode: z.enum(["Dynamic", "Static"]).describe("Estimate template mode"),
  items: z.array(estimateTemplateItemSchema).describe("Template items"),
});

const estimateTemplateUpdateSchema = templateIdSchema.extend(
  estimateTemplatePayloadSchema.shape,
);

const proposalTemplateAssignmentSchema = z.object({
  proposalTypeOptionId: z.number().int().describe("Proposal type option ID"),
  estimateTemplateId: z.number().int().describe("Estimate template ID"),
  order: z.number().int().describe("Assignment display order"),
});

const proposalTypeIdFilterSchema = {
  proposalTypeId: z.number().int().optional().describe("Filter by proposal type ID"),
};

const proposalTemplateListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...activeFilterParam(),
      ...proposalTypeIdFilterSchema,
    }),
  ),
);

const proposalTemplatePayloadSchema = z.object({
  name: z.string().optional().describe("Proposal template name"),
  description: z
    .string()
    .nullable()
    .optional()
    .describe("Proposal template description. For PATCH, omit or null to leave unchanged."),
  proposalTypeId: z.number().int().optional().describe("Proposal type ID"),
  status: z.enum(["Publish", "Draft"]).optional().describe("Proposal template status"),
  active: z.boolean().optional().describe("Whether the template is active"),
  businessUnitIds: z
    .array(z.number().int())
    .optional()
    .describe("Business unit IDs. For PATCH, providing this list replaces all existing assignments; empty list clears all."),
  estimateAssignments: z
    .array(proposalTemplateAssignmentSchema)
    .optional()
    .describe("Estimate assignments. For PATCH, providing this list replaces all existing assignments; empty list clears all."),
});

const proposalTemplateCreateSchema = proposalTemplatePayloadSchema.extend({
  name: z.string().describe("Proposal template name"),
  proposalTypeId: z.number().int().describe("Proposal type ID"),
  estimateAssignments: z
    .array(proposalTemplateAssignmentSchema)
    .describe("Estimate assignments"),
});

const proposalTemplateUpdateSchema = templateIdSchema.extend(
  proposalTemplatePayloadSchema.shape,
);

const proposalTypesListSchema = z.object({
  ...activeFilterParam(),
});

export function registerEstimateTemplateTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "estimates_estimate_templates_list",
    domain: "estimates",
    operation: "read",
    description: "List estimate templates",
    schema: estimateTemplateListSchema.shape,
    handler: async (params) => {
      const input = estimateTemplateListSchema.parse(params);

      try {
        const data = await client.get("/tenant/{tenant}/estimate-templates", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_estimate_templates_get",
    domain: "estimates",
    operation: "read",
    description: "Get an estimate template by ID",
    schema: templateIdSchema.shape,
    handler: async (params) => {
      const input = templateIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/estimate-templates/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_estimate_templates_create",
    domain: "estimates",
    operation: "write",
    description: "Create an estimate template",
    schema: estimateTemplateCreateSchema.shape,
    handler: async (params) => {
      const input = estimateTemplateCreateSchema.parse(params);

      try {
        const data = await client.post(
          "/tenant/{tenant}/estimate-templates",
          buildParams(input),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_estimate_templates_update",
    domain: "estimates",
    operation: "write",
    description: "Update an estimate template. Warning: items are full-replace when provided; omit items to preserve existing template items.",
    schema: estimateTemplateUpdateSchema.shape,
    handler: async (params) => {
      const input = estimateTemplateUpdateSchema.parse(params);
      const { id, ...body } = input;

      try {
        const payload = buildParams(body);
        const data = await client.patch(
          `/tenant/{tenant}/estimate-templates/${id}`,
          Object.keys(payload).length > 0 ? payload : undefined,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_estimate_templates_delete",
    domain: "estimates",
    operation: "delete",
    description: "Delete an estimate template by ID",
    schema: templateIdSchema.shape,
    handler: async (params) => {
      const input = templateIdSchema.parse(params);

      try {
        const data = await client.delete(`/tenant/{tenant}/estimate-templates/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}

export function registerProposalTemplateTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "estimates_proposal_templates_list",
    domain: "estimates",
    operation: "read",
    description: "List proposal templates",
    schema: proposalTemplateListSchema.shape,
    handler: async (params) => {
      const input = proposalTemplateListSchema.parse(params);

      try {
        const data = await client.get("/tenant/{tenant}/proposal-templates", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_proposal_templates_get",
    domain: "estimates",
    operation: "read",
    description: "Get a proposal template by ID",
    schema: templateIdSchema.shape,
    handler: async (params) => {
      const input = templateIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/proposal-templates/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_proposal_templates_create",
    domain: "estimates",
    operation: "write",
    description: "Create a proposal template",
    schema: proposalTemplateCreateSchema.shape,
    handler: async (params) => {
      const input = proposalTemplateCreateSchema.parse(params);

      try {
        const data = await client.post(
          "/tenant/{tenant}/proposal-templates",
          buildParams(input),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_proposal_templates_update",
    domain: "estimates",
    operation: "write",
    description: "Update a proposal template. Warning: businessUnitIds and estimateAssignments are full-replace when provided; omit them to preserve existing assignments.",
    schema: proposalTemplateUpdateSchema.shape,
    handler: async (params) => {
      const input = proposalTemplateUpdateSchema.parse(params);
      const { id, ...body } = input;

      try {
        const payload = buildParams(body);
        const data = await client.patch(
          `/tenant/{tenant}/proposal-templates/${id}`,
          Object.keys(payload).length > 0 ? payload : undefined,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_proposal_templates_delete",
    domain: "estimates",
    operation: "delete",
    description: "Delete a proposal template by ID",
    schema: templateIdSchema.shape,
    handler: async (params) => {
      const input = templateIdSchema.parse(params);

      try {
        const data = await client.delete(`/tenant/{tenant}/proposal-templates/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}

export function registerProposalTypeTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "estimates_proposal_types_list",
    domain: "estimates",
    operation: "read",
    description: "List proposal types",
    schema: proposalTypesListSchema.shape,
    handler: async (params) => {
      const input = proposalTypesListSchema.parse(params);

      try {
        const data = await client.get("/tenant/{tenant}/proposal-types", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
