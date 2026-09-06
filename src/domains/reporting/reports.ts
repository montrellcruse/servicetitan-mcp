import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, paginationParams, toolError, toolResult } from "../../utils.js";

const reportListSchema = paginationParams(
  z.object({
    reportCategory: z.string().describe("Report category ID"),
  }),
);

const reportParameterSchema = z.object({
  name: z.string().describe("Parameter name (from report definition)"),
  value: z.unknown().describe("Parameter value, using the data type declared by the report definition"),
});

const reportDataSchema = z.object({
  reportCategory: z.string().describe("Report category ID"),
  reportId: z.number().int().describe("Report ID"),
  parameters: z
    .array(reportParameterSchema)
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
    description: "List report definitions within a known report category. Use reporting_report_categories_list to discover category IDs, then use reporting_reports_get for one report definition before executing it.",
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
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "reporting_reports_get",
    domain: "reporting",
    operation: "read",
    description: "Retrieve one report definition from a known category and report ID, including its parameter contract. Use reporting_reports_list to discover reports and reporting_reports_data_create to execute the selected definition.",
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
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "reporting_reports_data_create",
    domain: "reporting",
    operation: "read",
    description: "Execute one requested page of a known report and return the upstream report-data response. First inspect reporting_reports_get for that report's required parameter names, value types, and accepted formats; pass those entries in parameters, and use page, pageSize, and includeTotal to control this request. This generic reporting call is not subject to the intelligence tools' report scheduler or 65-second spacing.",
    schema: reportDataSchema.shape,
    handler: async (params) => {
      const { reportCategory, reportId, parameters, ...query } = params as z.infer<
        typeof reportDataSchema
      >;

      try {
        const data = await client.post(
          `/tenant/{tenant}/report-category/${reportCategory}/reports/${reportId}/data`,
          { parameters },
          buildParams(query),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  });
}
