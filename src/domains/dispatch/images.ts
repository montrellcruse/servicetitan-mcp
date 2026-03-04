import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, toolError, toolResult } from "../../utils.js";

const imageGetSchema = z.object({
  path: z.string().optional().describe("Storage path of the image to retrieve"),
});

const imageCreateSchema = z.object({
  alias: z.string().optional().describe("Image alias"),
  fileName: z.string().optional().describe("Image file name"),
  url: z.string().optional().describe("Public image URL"),
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerDispatchImageTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "dispatch_images_get",
    domain: "dispatch",
    operation: "read",
    description: "Get image metadata by storage path",
    schema: imageGetSchema.shape,
    handler: async (params) => {
      const input = imageGetSchema.parse(params);

      try {
        const data = await client.get("/tenant/{tenant}/images", buildParams({ path: input.path }));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_images_create",
    domain: "dispatch",
    operation: "write",
    description: "Create an image placeholder",
    schema: imageCreateSchema.shape,
    handler: async (params) => {
      const input = imageCreateSchema.parse(params);

      try {
        const payload = buildParams(input);
        const data = await client.post(
          "/tenant/{tenant}/images",
          Object.keys(payload).length > 0 ? payload : undefined,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
