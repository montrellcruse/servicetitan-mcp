import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult, getErrorMessage } from "../../utils.js";

// ServiceTitan's /capacity endpoint requires `skillBasedAvailability` (boolean).
// Including `jobTypeId` without a matching `args` object triggers a second
// validation error from ST. Both gotchas are documented inline so the LLM
// (or any caller) can see them in the schema description.
const capacityCalculateSchema = z
  .object({
    startsOnOrAfter: z
      .string()
      .datetime()
      .describe("UTC start of search window (ISO datetime, e.g. 2026-05-01T12:00:00Z)"),
    endsOnOrBefore: z
      .string()
      .datetime()
      .describe("UTC end of search window (ISO datetime)"),
    businessUnitIds: z
      .array(z.number().int())
      .min(1)
      .describe("One or more business unit IDs to query"),
    skillBasedAvailability: z
      .boolean()
      .describe(
        "Whether to apply skill-based availability filtering. Required by ST. " +
          "Pass false to skip skill filtering.",
      ),
    jobTypeId: z
      .number()
      .int()
      .optional()
      .describe(
        "Optional job type ID. If set, ST also requires `args` — see below. " +
          "Omit both for general capacity-by-BU queries.",
      ),
    args: z
      .record(z.unknown())
      .optional()
      .describe(
        "Per-job-type arguments (required when jobTypeId is set). " +
          "Shape varies by tenant configuration.",
      ),
  })
  .passthrough();

export function registerSchedulingCapacityTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "scheduling_capacity_calculate",
    domain: "scheduling",
    operation: "write",
    description:
      "Calculate available time slots for scheduling. Returns arrival windows " +
      "with technician availability for the given business unit(s) within the " +
      "time window. Note: this is a POST that does not mutate state — it is " +
      "flagged 'write' due to the HTTP verb.",
    schema: capacityCalculateSchema.shape,
    handler: async (params) => {
      const input = capacityCalculateSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/capacity", input);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
