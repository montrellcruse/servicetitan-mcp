import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, paginationParams, toolError, toolResult, getErrorMessage } from "../../utils.js";

const reportListSchema = paginationParams(
  z.object({
    reportCategory: z.string().describe("Report category ID"),
  }),
);

const reportParameterSchema = z.object({
  name: z.string().describe("Parameter name (from report definition)"),
  value: z.string().describe("Parameter value"),
});

const reportDataSchema = z.object({
  reportCategory: z.string().describe("Report category ID"),
  reportId: z.number().int().describe("Report ID"),
  parameters: z
    .array(reportParameterSchema)
    .optional()
    .describe("Report parameters (name/value pairs from report definition)"),
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
    operation: "read",
    description:
      "Fetch report data rows. Use the report definition to discover required parameters. Date parameters use YYYY-MM-DD format.",
    schema: reportDataSchema.shape,
    handler: async (params) => {
      const { reportCategory, reportId, parameters, ...query } = params as z.infer<
        typeof reportDataSchema
      >;

      try {
        const data = await client.post(
          `/tenant/{tenant}/report-category/${reportCategory}/reports/${reportId}/data`,
          parameters ? { parameters } : {},
          buildParams(query),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
