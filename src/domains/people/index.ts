import type { DomainLoader } from "../../registry.js";

import { registerPeopleEmployeeTools } from "./employees.js";
import { registerPeopleGpsTools } from "./gps.js";
import { registerPeopleTechnicianTools } from "./technicians.js";
import { registerPeopleTruckTools } from "./trucks.js";

export const loadPeopleDomain: DomainLoader = (client, registry) => {
  registerPeopleEmployeeTools(client, registry);
  registerPeopleTechnicianTools(client, registry);
  registerPeopleTruckTools(client, registry);
  registerPeopleGpsTools(client, registry);
};
export default loadPeopleDomain;
