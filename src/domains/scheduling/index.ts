import type { DomainLoader } from "../../registry.js";

import { registerSchedulingAppointmentAssignmentTools } from "./appointment-assignments.js";
import { registerSchedulingBusinessHourTools } from "./business-hours.js";
import { registerSchedulingCapacityTools } from "./capacity.js";
import { registerSchedulingNonJobAppointmentTools } from "./non-job-appointments.js";
import { registerSchedulingTeamTools } from "./teams.js";
import { registerSchedulingTechnicianShiftTools } from "./technician-shifts.js";
import { registerSchedulingZoneTools } from "./zones.js";

export const loadSchedulingDomain: DomainLoader = (client, registry) => {
  registerSchedulingAppointmentAssignmentTools(client, registry);
  registerSchedulingBusinessHourTools(client, registry);
  registerSchedulingCapacityTools(client, registry);
  registerSchedulingNonJobAppointmentTools(client, registry);
  registerSchedulingTeamTools(client, registry);
  registerSchedulingTechnicianShiftTools(client, registry);
  registerSchedulingZoneTools(client, registry);
};
export default loadSchedulingDomain;
