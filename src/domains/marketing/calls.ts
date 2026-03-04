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

const callIdSchema = z.object({
  id: z.number().int().describe("Call ID"),
});

const callUpdateSchema = z.object({
  id: z.number().int().describe("Call ID"),
  payload: z.object({}).passthrough().describe("Call update payload"),
});

const v3CallsListSchema = paginationParams(
  dateFilterParams(
    z.object({
      ...activeFilterParam(),
      ids: z.string().optional().describe("Comma-delimited call IDs"),
      createdAfter: z.string().datetime().optional().describe("Created after UTC timestamp"),
      modifiedAfter: z.string().datetime().optional().describe("Modified after UTC timestamp"),
      campaignId: z.number().int().optional().describe("Campaign ID"),
      agentId: z.number().int().optional().describe("Agent ID"),
      minDuration: z.number().int().optional().describe("Minimum duration in seconds"),
      phoneNumberCalled: z.string().optional().describe("Phone number called"),
      callerPhoneNumber: z.string().optional().describe("Caller phone number"),
      agentName: z.string().optional().describe("Agent name"),
      agentIsExternal: z.boolean().optional().describe("Whether agent is external"),
      agentExternalId: z.number().int().optional().describe("Agent external ID"),
      ...sortParam(["Id", "CreatedOn", "ModifiedOn"]),
    }),
  ),
);

const v2CallsListSchema = paginationParams(
  z.object({
    modifiedBefore: z.string().datetime().optional().describe("Modified before UTC timestamp"),
    modifiedOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Modified on or after UTC timestamp"),
    createdOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Created on or after UTC timestamp"),
    modifiedAfter: z.string().datetime().optional().describe("Modified after UTC timestamp"),
    minDuration: z.number().int().optional().describe("Minimum duration in seconds"),
    phoneNumberCalled: z.string().optional().describe("Phone number called"),
    campaignId: z.number().int().optional().describe("Campaign ID"),
    agentId: z.number().int().optional().describe("Agent ID"),
    agentName: z.string().optional().describe("Agent name"),
    agentIsExternal: z.boolean().optional().describe("Whether agent is external"),
    agentExternalId: z.number().int().optional().describe("Agent external ID"),
    orderBy: z
      .enum(["Id", "CreatedOn", "ModifiedOn", "createdOn", "modifiedOn"])
      .optional()
      .describe("Field used for ordering"),
    orderByDirection: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
    activeOnly: z.boolean().optional().describe("Return only active calls"),
    createdAfter: z.string().datetime().optional().describe("Created after UTC timestamp"),
    createdBefore: z.string().datetime().optional().describe("Created before UTC timestamp"),
    ids: z.array(z.number().int()).optional().describe("Specific call IDs"),
  }),
);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerMarketingCallTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "marketing_calls_v3_list",
    domain: "marketing",
    operation: "read",
    description: "List calls from v3 calls endpoint",
    schema: v3CallsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof v3CallsListSchema>;

      try {
        const data = await client.get(
          "/v3/tenant/{tenant}/calls",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            ids: input.ids,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            active: input.active,
            createdAfter: input.createdAfter,
            modifiedAfter: input.modifiedAfter,
            campaignId: input.campaignId,
            agentId: input.agentId,
            minDuration: input.minDuration,
            phoneNumberCalled: input.phoneNumberCalled,
            callerPhoneNumber: input.callerPhoneNumber,
            agentName: input.agentName,
            agentIsExternal: input.agentIsExternal,
            agentExternalId: input.agentExternalId,
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
    name: "marketing_calls_get",
    domain: "marketing",
    operation: "read",
    description: "Get call details by ID (v2)",
    schema: callIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof callIdSchema>;

      try {
        const data = await client.get(`/v2/tenant/{tenant}/calls/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_calls_update",
    domain: "marketing",
    operation: "write",
    description: "Update a call (v2)",
    schema: callUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof callUpdateSchema>;

      try {
        const data = await client.put(`/v2/tenant/{tenant}/calls/${input.id}`, input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_calls_recording_get",
    domain: "marketing",
    operation: "read",
    description: "Get call recording metadata or payload (v2)",
    schema: callIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof callIdSchema>;

      try {
        const data = await client.get(`/v2/tenant/{tenant}/calls/${input.id}/recording`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_calls_voice_mail_get",
    domain: "marketing",
    operation: "read",
    description: "Get call voicemail metadata or payload (v2)",
    schema: callIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof callIdSchema>;

      try {
        const data = await client.get(`/v2/tenant/{tenant}/calls/${input.id}/voicemail`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "marketing_calls_v2_list",
    domain: "marketing",
    operation: "read",
    description: "List calls from v2 calls endpoint",
    schema: v2CallsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof v2CallsListSchema>;

      try {
        const data = await client.get(
          "/v2/tenant/{tenant}/calls",
          buildParams({
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedAfter: input.modifiedAfter,
            minDuration: input.minDuration,
            phoneNumberCalled: input.phoneNumberCalled,
            campaignId: input.campaignId,
            agentId: input.agentId,
            agentName: input.agentName,
            agentIsExternal: input.agentIsExternal,
            agentExternalId: input.agentExternalId,
            orderBy: input.orderBy,
            orderByDirection: input.orderByDirection,
            activeOnly: input.activeOnly,
            createdAfter: input.createdAfter,
            createdBefore: input.createdBefore,
            ids: input.ids,
            page: input.page,
            pageSize: input.pageSize,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
