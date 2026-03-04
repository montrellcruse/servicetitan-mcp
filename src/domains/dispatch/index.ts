import type { DomainLoader } from "../../registry.js";

import { registerDispatchAppointmentTools } from "./appointments.js";
import { registerDispatchArrivalWindowTools } from "./arrival-windows.js";
import { registerDispatchFormTools } from "./forms.js";
import { registerDispatchImageTools } from "./images.js";
import { registerDispatchInstalledEquipmentTools } from "./installed-equipment.js";
import { registerDispatchJobTypeTools } from "./job-types.js";
import { registerDispatchJobTools } from "./jobs.js";
import { registerDispatchProjectTools } from "./projects.js";

export const loadDispatchDomain: DomainLoader = (client, registry) => {
  registerDispatchArrivalWindowTools(client, registry);
  registerDispatchAppointmentTools(client, registry);
  registerDispatchJobTools(client, registry);
  registerDispatchJobTypeTools(client, registry);
  registerDispatchProjectTools(client, registry);
  registerDispatchInstalledEquipmentTools(client, registry);
  registerDispatchImageTools(client, registry);
  registerDispatchFormTools(client, registry);
};
export default loadDispatchDomain;
