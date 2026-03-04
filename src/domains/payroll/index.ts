import type { DomainLoader } from "../../registry.js";

import { registerPayrollAdjustmentTools } from "./adjustments.js";
import { registerPayrollGrossPayTools } from "./gross-pay.js";
import { registerPayrollTools } from "./payrolls.js";
import { registerPayrollTimesheetTools } from "./timesheets.js";

export const loadPayrollDomain: DomainLoader = (client, registry) => {
  registerPayrollTools(client, registry);
  registerPayrollTimesheetTools(client, registry);
  registerPayrollGrossPayTools(client, registry);
  registerPayrollAdjustmentTools(client, registry);
};

export default loadPayrollDomain;
