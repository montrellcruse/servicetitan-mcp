import axios from "axios";

const REPORT_175_FIELDS = [
  { name: "Name" },
  { name: "CompletedRevenue" },
  { name: "OpportunityJobAverage" },
  { name: "OpportunityConversionRate" },
  { name: "Opportunity" },
  { name: "ConvertedJobs" },
  { name: "CustomerSatisfaction" },
  { name: "AdjustmentRevenue" },
  { name: "TotalRevenue" },
  { name: "NonJobRevenue" },
];

const REPORT_177_FIELDS = [
  { name: "Name" },
  { name: "RevenuePerHour" },
  { name: "BillableEfficiency" },
  { name: "Upsold" },
  { name: "TasksPerOpportunity" },
  { name: "OptionsPerOpportunity" },
  { name: "RecallsCaused" },
  { name: "AdjustmentRevenue" },
  { name: "TotalRevenue" },
  { name: "NonJobRevenue" },
];

const REPORT_179_FIELDS = [
  { name: "Name" },
  { name: "TotalSales" },
  { name: "ClosedAverageSale" },
  { name: "CloseRate" },
  { name: "SalesOpportunity" },
  { name: "OptionsPerOpportunity" },
  { name: "AdjustmentRevenue" },
  { name: "TotalRevenue" },
  { name: "NonJobRevenue" },
];

axios.post = async (url) => {
  if (String(url).includes("/connect/token")) {
    return {
      data: {
        access_token: "mock-access-token",
        expires_in: 3600,
      },
    };
  }

  throw new Error(`Unexpected axios.post url: ${url}`);
};

axios.create = () => {
  let requestInterceptor = async (request) => request;

  return {
    interceptors: {
      request: {
        use(handler) {
          requestInterceptor = handler;
          return 0;
        },
      },
      response: {
        use() {
          return 0;
        },
      },
    },
    async request(requestConfig) {
      const config = await requestInterceptor({
        ...requestConfig,
        headers: requestConfig.headers ?? {},
      });

      const url = String(config.url);

      if (url === "/settings/v2/tenant/dummy-tenant/business-units") {
        return { data: { data: [], hasMore: false, page: 1 } };
      }

      if (url === "/reporting/v2/tenant/dummy-tenant/report-category/business-unit-dashboard/reports/175/data") {
        return {
          data: {
            fields: REPORT_175_FIELDS,
            data: [
              ["HVAC - Install", 400, 200, 1.0, 5, 5, 0, 0, 450, 50],
              ["HVAC - Service", 100, 100, 0.5, 10, 5, 0, 0, 150, 50],
            ],
            hasMore: false,
          },
        };
      }

      if (url === "/reporting/v2/tenant/dummy-tenant/report-category/business-unit-dashboard/reports/177/data") {
        return {
          data: {
            fields: REPORT_177_FIELDS,
            data: [
              ["HVAC - Install", 100, 0.8, 300, 2, 1.5, 1, 0, 450, 50],
              ["HVAC - Service", 80, 0.7, 100, 1.5, 1, 0, 0, 150, 50],
            ],
            hasMore: false,
          },
        };
      }

      if (url === "/reporting/v2/tenant/dummy-tenant/report-category/business-unit-dashboard/reports/179/data") {
        return {
          data: {
            fields: REPORT_179_FIELDS,
            data: [
              ["HVAC - Install", 1000, 500, 0.5, 4, 1.2, 0, 450, 50],
              ["HVAC - Service", 300, 300, 1.0, 1, 1, 0, 150, 50],
            ],
            hasMore: false,
          },
        };
      }

      if (url === "/accounting/v2/tenant/dummy-tenant/payments") {
        return {
          data: {
            data: [{ id: 1, amount: 250 }, { id: 2, amount: 100 }],
            hasMore: false,
            page: 1,
            totalCount: 2,
          },
        };
      }

      throw new Error(`Unexpected axios request: ${config.method} ${url}`);
    },
  };
};
