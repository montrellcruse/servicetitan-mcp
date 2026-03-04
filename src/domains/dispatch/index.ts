import type { DomainLoader } from "../../registry.js";

import { registerDispatchAppointmentTools } from "./appointments.js";
import { registerDispatchArrivalWindowTools } from "./arrival-windows.js";
import { registerDispatchFormTools } from "./forms.js";
import { registerDispatchJobTools } from "./jobs.js";

export const loadDispatchDomain: DomainLoader = (client, registry) => {
  registerDispatchArrivalWindowTools(client, registry);
  registerDispatchAppointmentTools(client, registry);
  registerDispatchJobTools(client, registry);
  registerDispatchFormTools(client, registry);
};
export default loadDispatchDomain;
