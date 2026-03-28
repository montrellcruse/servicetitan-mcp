import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult, getErrorMessage } from "../../utils.js";

const phoneNumbersShapeSchema = z.object({
  contact_numbers: z
    .array(z.string())
    .optional()
    .describe("Phone numbers to opt out (legacy naming)"),
  contactNumbers: z.array(z.string()).optional().describe("Phone numbers to opt out"),
});

const phoneNumbersSchema = phoneNumbersShapeSchema.refine(
  (value) => Boolean(value.contact_numbers ?? value.contactNumbers),
  {
    message: "Provide contact_numbers or contactNumbers",
  },
);

const phoneNumbersLookupShapeSchema = z.object({
  contact_numbers: z
    .array(z.string())
    .optional()
    .describe("Phone numbers to lookup (legacy naming)"),
  contactNumbers: z.array(z.string()).optional().describe("Phone numbers to lookup"),
});

const phoneNumbersLookupSchema = phoneNumbersLookupShapeSchema.refine(
  (value) => Boolean(value.contact_numbers ?? value.contactNumbers),
  {
    message: "Provide contact_numbers or contactNumbers",
  },
);
function getNumbers(input: z.infer<typeof phoneNumbersSchema>): string[] {
  return input.contact_numbers ?? input.contactNumbers ?? [];
}

function registerOptOutListTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
  name: "marketing_opt_in_out_get_all_opt_outs" | "marketing_opt_in_outs_list",
  description: string,
): void {
  registry.register({
    name,
    domain: "marketing",
    operation: "read",
    description,
    schema: {},
    handler: async () => {
      try {
        const data = await client.get("/v3/tenant/{tenant}/optinouts/optouts");
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}

function registerOptOutCreateTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
  name: "marketing_opt_in_out_create_opt_out_list" | "marketing_opt_in_outs_create",
  description: string,
): void {
  registry.register({
    name,
    domain: "marketing",
    operation: "write",
    description,
    schema: phoneNumbersShapeSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof phoneNumbersSchema>;

      try {
        const data = await client.post("/v3/tenant/{tenant}/optinouts/optouts", {
          contactNumbers: getNumbers(input),
        });
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}

function registerOptOutLookupTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
  name: "marketing_opt_in_out_lookup_create" | "marketing_opt_in_outs_lookup_create",
  description: string,
): void {
  registry.register({
    name,
    domain: "marketing",
    operation: "write",
    description,
    schema: phoneNumbersLookupShapeSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof phoneNumbersLookupSchema>;

      try {
        const data = await client.post(
          "/v3/tenant/{tenant}/optinouts/optouts/getlist",
          input.contact_numbers ?? input.contactNumbers,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}

export function registerMarketingOptInOutTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registerOptOutListTool(
    client,
    registry,
    "marketing_opt_in_out_get_all_opt_outs",
    "List all opt-out records",
  );

  registerOptOutListTool(
    client,
    registry,
    "marketing_opt_in_outs_list",
    "List all opt-out records (legacy naming)",
  );

  registerOptOutCreateTool(
    client,
    registry,
    "marketing_opt_in_out_create_opt_out_list",
    "Create opt-out records for phone numbers",
  );

  registerOptOutCreateTool(
    client,
    registry,
    "marketing_opt_in_outs_create",
    "Create opt-out records for phone numbers (legacy naming)",
  );

  registerOptOutLookupTool(
    client,
    registry,
    "marketing_opt_in_out_lookup_create",
    "Lookup opt-out records for phone numbers",
  );

  registerOptOutLookupTool(
    client,
    registry,
    "marketing_opt_in_outs_lookup_create",
    "Lookup opt-out records for phone numbers (legacy naming)",
  );
}
