import type { DomainLoader } from "../../registry.js";

import { registerIntelligenceCampaignPerformanceTool } from "./campaign-roi.js";
import { registerIntelligenceCsrPerformanceTool } from "./csr-performance.js";
import { registerIntelligenceInvoiceTrackingTool } from "./invoice-tracking.js";
import { registerIntelligenceLaborCostTool } from "./labor-cost.js";
import { registerIntelligenceLookupTool } from "./lookup.js";
import { registerIntelligenceMembershipHealthTool } from "./membership-health.js";
import { registerIntelligenceDailySnapshotTool } from "./operational.js";
import { registerIntelligenceEstimatePipelineTool } from "./pipeline.js";
import { registerIntelligenceRevenueTool } from "./revenue.js";
import { registerIntelligenceTechnicianPerformanceTool } from "./technician-performance.js";

export const loadIntelligenceDomain: DomainLoader = (client, registry) => {
  registerIntelligenceLookupTool(client, registry);
  registerIntelligenceRevenueTool(client, registry);
  registerIntelligenceTechnicianPerformanceTool(client, registry);
  registerIntelligenceMembershipHealthTool(client, registry);
  registerIntelligenceEstimatePipelineTool(client, registry);
  registerIntelligenceCampaignPerformanceTool(client, registry);
  registerIntelligenceDailySnapshotTool(client, registry);
  registerIntelligenceCsrPerformanceTool(client, registry);
  registerIntelligenceLaborCostTool(client, registry);
  registerIntelligenceInvoiceTrackingTool(client, registry);
};

export default loadIntelligenceDomain;
