import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerPeopleTechnicianTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "people_technician_ratings_update",
    domain: "people",
    operation: "write",
    description: "Update technician rating for a specific job",
    schema: {
      technicianId: z.number().int().describe("Technician ID"),
      jobId: z.number().int().describe("Job ID"),
    },
    handler: async (params) => {
      const { technicianId, jobId } = params as {
        technicianId: number;
        jobId: number;
      };

      try {
        await client.put(
          `/tenant/{tenant}/technician-rating/technician/${technicianId}/job/${jobId}`,
        );
        return toolResult({
          success: true,
          message: "Technician rating updated successfully.",
        });
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
