import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";

const gpsPingSchema = z.object({
  recordedOn: z
    .string()
    .datetime()
    .describe("UTC timestamp when the GPS ping was recorded"),
  latitude: z.number().describe("Latitude in decimal degrees"),
  longitude: z.number().describe("Longitude in decimal degrees"),
  speed: z.number().optional().describe("Speed reported by the source device"),
  heading: z.number().optional().describe("Heading in degrees from true north"),
  accuracy: z.number().optional().describe("GPS horizontal accuracy in meters"),
  technicianId: z.number().int().optional().describe("Related technician ID"),
  vehicleId: z.number().int().optional().describe("Related vehicle ID"),
  providerTechnicianId: z
    .string()
    .optional()
    .describe("Technician identifier from the provider system"),
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerPeopleGpsTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "people_gps_create",
    domain: "people",
    operation: "write",
    description: "Submit GPS pings from an external provider",
    schema: {
      gpsProvider: z.string().describe("GPS provider identifier"),
      pings: z
        .array(gpsPingSchema)
        .min(1)
        .describe("One or more GPS ping events to ingest"),
    },
    handler: async (params) => {
      const { gpsProvider, pings } = params as {
        gpsProvider: string;
        pings: Array<z.infer<typeof gpsPingSchema>>;
      };

      try {
        const data = await client.post(
          `/tenant/{tenant}/gps-provider/${gpsProvider}/gps-pings`,
          { pings },
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
