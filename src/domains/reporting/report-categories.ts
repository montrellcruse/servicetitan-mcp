import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, paginationParams, toolError, toolResult } from "../../utils.js";

const reportCategoryListSchema = paginationParams(z.object({}));
export function registerReportCategoryTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "reporting_report_categories_list",
    domain: "reporting",
    operation: "read",
    description: "List one requested page of report categories with paging and total-count controls. Start here to discover a category ID, then use reporting_reports_list for reports in that category and reporting_reports_get for a report parameter definition.",
    schema: reportCategoryListSchema.shape,
    handler: async (params) => {
      const query = buildParams(params as Record<string, unknown>);

      try {
        const data = await client.get(`/tenant/{tenant}/report-categories`, query);
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  });
}
