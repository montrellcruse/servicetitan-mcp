import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, paginationParams, toolError, toolResult } from "../../utils.js";

const reportListSchema = paginationParams(
  z.object({
    reportCategory: z.string().describe("Report category ID"),
  }),
);

const reportDataSchema = z.object({
  reportCategory: z.string().describe("Report category ID"),
  reportId: z.number().int().describe("Report ID"),
  page: z.number().int().optional().describe("Page number (starts at 1)"),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(25000)
    .optional()
    .describe("Records per page"),
  includeTotal: z.boolean().optional().describe("Include total count"),
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerReportTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "reporting_reports_list",
    domain: "reporting",
    operation: "read",
    description: "List reports in a report category",
    schema: reportListSchema.shape,
    handler: async (params) => {
      const { reportCategory, ...query } = params as {
        reportCategory: string;
        page?: number;
        pageSize?: number;
        includeTotal?: boolean;
      };

      try {
        const data = await client.get(
          `/tenant/{tenant}/report-category/${reportCategory}/reports`,
          buildParams(query),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "reporting_reports_get",
    domain: "reporting",
    operation: "read",
    description: "Get a report definition in a category",
    schema: {
      reportCategory: z.string().describe("Report category ID"),
      reportId: z.number().int().describe("Report ID"),
    },
    handler: async (params) => {
      const { reportCategory, reportId } = params as {
        reportCategory: string;
        reportId: number;
      };

      try {
        const data = await client.get(
          `/tenant/{tenant}/report-category/${reportCategory}/reports/${reportId}`,
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "reporting_reports_data_create",
    domain: "reporting",
    operation: "write",
    description: "Fetch report data rows",
    schema: reportDataSchema.shape,
    handler: async (params) => {
      const { reportCategory, reportId, ...query } = params as z.infer<typeof reportDataSchema>;

      try {
        const data = await client.post(
          `/tenant/{tenant}/report-category/${reportCategory}/reports/${reportId}/data`,
          {},
          buildParams(query),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
