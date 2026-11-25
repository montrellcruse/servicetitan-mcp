import axios from "axios";

axios.defaults.adapter = async config => {
  const url = new URL(config.url, config.baseURL);
  if (url.hostname === "auth-integration.servicetitan.io" && url.pathname === "/connect/token" && config.method === "post") {
    return { status: 200, statusText: "OK", config, headers: {}, data: { access_token: "readiness-fixture-token", expires_in: 900 } };
  }
  if (url.hostname !== "api-integration.servicetitan.io"
    || url.pathname !== "/reporting/v2/tenant/42/report-category/accounting/reports/166"
    || config.method !== "get") {
    throw new Error("Wire readiness fixture blocked an unexpected upstream request");
  }
  const fields = ["EmployeeName", "Date", "RegularHours", "OvertimeHours", "DoubleOvertimeHours"];
  return {
    status: 200, statusText: "OK", config, headers: {},
    data: {
      parameters: ["From", "To"].map(name => ({ name, dataType: "Date", isArray: false, isRequired: true })),
      fields: (process.env.WIRE_INCOMPATIBLE_LABOR_REPORT ? ["EmployeeName"] : fields).map(name => ({ name })),
    },
  };
};
