import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from 'axios';  

// Create an MCP server
const server = new McpServer({
    name: "ServiceTitan",
    version: "1.0.0"
});


// ServiceTitan API environments
const ENVIRONMENTS = {
  integration: {
    authUrl: 'https://auth-integration.servicetitan.io',
    apiUrl: 'https://api-integration.servicetitan.io'
  },
  production: {
    authUrl: 'https://auth.servicetitan.io',
    apiUrl: 'https://api.servicetitan.io'
  }
};

// Configuration interface
interface ServiceTitanConfig {
  clientId: string;
  clientSecret: string;
  appKey: string;
  tenantId: string;
  environment: 'integration' | 'production';
}

class ServiceTitanClient {
  private config: ServiceTitanConfig;
  private accessToken: string | null = null;
  private tokenExpiration: Date | null = null;

  constructor(config: ServiceTitanConfig) {
    this.config = config;
  }

  // Get a valid access token, refreshing if necessary
  private async getAccessToken(): Promise<string> {
    // Check if token exists and is not expired (with 60 second buffer)
    const now = new Date();
    if (this.accessToken && this.tokenExpiration && 
        this.tokenExpiration.getTime() - now.getTime() > 60000) {
      return this.accessToken;
    }

    try {
      // Create form data for token request
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', this.config.clientId);
      params.append('client_secret', this.config.clientSecret);

      // Get environment URLs
      const env = ENVIRONMENTS[this.config.environment];
      
      // Make token request
      const response = await api.post(`${env.authUrl}/connect/token`, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      // Save token and expiration
      this.accessToken = response.data.access_token;
      
      // Set expiration date (token expires_in is in seconds)
      const expiresInMs = (response.data.expires_in - 60) * 1000; // 60s buffer
      this.tokenExpiration = new Date(Date.now() + expiresInMs);
      
      return this.accessToken;
    } catch (error) {
      console.error('Error obtaining ServiceTitan access token:', error);
      throw new Error('Failed to authenticate with ServiceTitan API');
    }
  }

  // Create API instance with authentication headers
  private async createApiInstance() {
    const token = await this.getAccessToken();
    const env = ENVIRONMENTS[this.config.environment];
    
    return axios.create({
      baseURL: env.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'ST-App-Key': this.config.appKey
      }
    });
  }

  async request(method: string, endpoint: string, data?: any, params?: any) {
    try {
      const api = await this.createApiInstance();
      
      // Add tenant ID to the endpoint if it contains the placeholder
      const formattedEndpoint = endpoint.replace('{tenant}', this.config.tenantId);
      
      const response = await api.request({
        method,
        url: formattedEndpoint,
        data,
        params // Add support for query parameters
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error making ${method} request to ${endpoint}:`, error);
      throw error;
    }
  }
  
  // Update the convenience methods to support params
  async get(endpoint: string, params?: any) {
    return this.request('GET', endpoint, undefined, params);
  }
  
  async post(endpoint: string, data?: any, params?: any) {
    return this.request('POST', endpoint, data, params);
  }
  
  async put(endpoint: string, data?: any, params?: any) {
    return this.request('PUT', endpoint, data, params);
  }

  async patch(endpoint: string, data?: any, params?: any) {
    return this.request('PATCH', endpoint, data, params);
  }
  
  async delete(endpoint: string, params?: any) {
    return this.request('DELETE', endpoint, undefined, params);
  }
}


const api = new ServiceTitanClient({
  clientId: process.env.SERVICE_TITAN_CLIENT_ID!,
  clientSecret: process.env.SERVICE_TITAN_CLIENT_SECRET!,
  appKey: process.env.SERVICE_TITAN_APP_KEY!,
  tenantId: process.env.SERVICE_TITAN_TENANT_ID!,
  environment: 'integration' // Use 'production' for production environment
});


// Tool: Ap Credits Mark As Exported
server.tool("ap_credits_markasexported",
  {
      tenant: z.number().int().describe("Tenant ID"),
  },
  async ({ tenant }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/ap-credits/markasexported`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: ApCredits_GetList
  server.tool("ApCredits_GetList",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      sort: z.string().optional().describe("Applies sorting by specified fields")
  },
  async ({ tenant, ids, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/ap-credits`, {
              params: {
                  ids: ids || undefined,
                  page: page || undefined,
                  pageSize: pageSize || undefined,
                  includeTotal: includeTotal || undefined,
                  createdBefore: createdBefore || undefined,
                  createdOnOrAfter: createdOnOrAfter || undefined,
                  modifiedBefore: modifiedBefore || undefined,
                  modifiedOnOrAfter: modifiedOnOrAfter || undefined,
                  sort: sort || undefined
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: ApPayments MarkAsExported
  server.tool(
  "ApPayments_MarkAsExported",
  {
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  },
  async ({ tenant }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/ap-payments/markasexported`);
  return {
  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
  };
  } catch (error: any) {
  return {
  content: [{ type: "text", text: `Error: ${error.message}` }],
  };
  }
  }
  );
  // Tool: Export Invoices
  server.tool("export_invoices",
  {
      tenant: z.number().int().describe("Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token or date string"),
      includeRecentChanges: z.boolean().nullable().optional().describe("Include recent changes")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/export/invoices`, {
              params: { from, includeRecentChanges }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: ApPayments GetList
  server.tool("ap_payments_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      sort: z.string().nullable().optional().describe("Applies sorting by specified fields")
  },
  async ({ tenant, ids, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
      try {
          const endpoint = `/tenant/${tenant}/ap-payments`;
          const response = await api.get(endpoint, {
              params: {
                  ids: ids || undefined,
                  page: page || undefined,
                  pageSize: pageSize || undefined,
                  includeTotal: includeTotal || undefined,
                  createdBefore: createdBefore || undefined,
                  createdOnOrAfter: createdOnOrAfter || undefined,
                  modifiedBefore: modifiedBefore || undefined,
                  modifiedOnOrAfter: modifiedOnOrAfter || undefined,
                  sort: sort || undefined
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Export Invoice Items
  server.tool("export_invoice_items",
  {
      tenant: z.number().int().describe("Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token from previous export or custom date string (e.g., '2020-01-01')"),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use 'true' for quicker recent changes (may cause duplicates)")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/export/invoice-items`, {
              params: {
                  from: from || undefined,
                  includeRecentChanges: includeRecentChanges || undefined
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Export Payments
  server.tool("export_payments",
  {
      tenant: z.number().int().describe("Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token or custom date string"),
      includeRecentChanges: z.boolean().nullable().optional().describe("Receive recent changes quicker")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/export/payments`, {
              params: { from, includeRecentChanges }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Export_InventoryBills
  server.tool("export_inventory_bills",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/export/inventory-bills`, {
              params: { from, includeRecentChanges }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: GlAccounts GetAccount
  server.tool("GlAccounts_GetAccount",
  {
      accountId: z.number().int().describe("Format - int64. Long integer id of the General Ledger account to be retrieved"),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ accountId, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/gl-accounts/${accountId}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: GlAccounts CreateAccount
  server.tool(
  "glaccounts_createaccount",
  {
      tenant: z.number().int().describe("Tenant ID"),
      name: z.string().describe("The name of the GL Account"),
      number: z.string().describe("The number of the GL Account"),
      description: z.string().optional().describe("The description of the GL Account"),
      type: z.string().describe("The type of the GL Account"),
      subtype: z.string().describe("The subtype of the GL Account"),
      active: z.boolean().optional().default(true).describe("Whether the GL Account is active"),
      isIntacctGroup: z.boolean().optional().default(false).describe("Whether the GL Account is an Intacct group"),
      isIntacctBankAccount: z.boolean().optional().default(false).describe("Whether the GL Account is an Intacct bank account")
  },
  async ({ tenant, name, number, description, type, subtype, active, isIntacctGroup, isIntacctBankAccount }) => {
      try {
          const response = await api.post(`/tenant/${tenant}/gl-accounts`, {
              name,
              number,
              description,
              type,
              subtype,
              active,
              isIntacctGroup,
              isIntacctBankAccount
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: GlAccounts_GetList
  server.tool("GlAccounts_GetList",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Comma-delimited list of account IDs, maximum 50 items"),
      names: z.string().nullable().optional().describe("Comma-delimited list of account names, maximum 50 items"),
      numbers: z.string().nullable().optional().describe("Comma-delimited list of account numbers, maximum 50 items"),
      types: z.string().nullable().optional().describe("Comma-delimited list of account types, maximum 50 items"),
      subtypes: z.string().nullable().optional().describe("Comma-delimited list of account subtypes, maximum 50 items"),
      description: z.string().max(255).nullable().optional().describe("A substring that must be contained in the account description"),
      source: z.string().nullable().optional().describe("Account source\nValues: [Undefined, AccountingSystem, ManuallyCreated, PublicApi]"),
      active: z.string().nullable().optional().describe("Specify if only active accounts, only inactive accounts, or both, should be retrieved.\nBy default, only active accounts will be retrieved.\nValues: [True, Any, False]"),
      isIntacctGroup: z.boolean().nullable().optional().describe("Set to true to retrieve Intacct group accounts only"),
      isIntacctBankAccount: z.boolean().nullable().optional().describe("Set to true to retrieve Intacct bank accounts only"),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      sort: z.string().nullable().optional().describe("Applies sorting by specified fields")
  },
  async ({ tenant, ids, names, numbers, types, subtypes, description, source, active, isIntacctGroup, isIntacctBankAccount, modifiedBefore, modifiedOnOrAfter, createdBefore, createdOnOrAfter, page, pageSize, includeTotal, sort }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/gl-accounts`, {
              params: {
                  ids: ids,
                  names: names,
                  numbers: numbers,
                  types: types,
                  subtypes: subtypes,
                  description: description,
                  source: source,
                  active: active,
                  isIntacctGroup: isIntacctGroup,
                  isIntacctBankAccount: isIntacctBankAccount,
                  modifiedBefore: modifiedBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter,
                  createdBefore: createdBefore,
                  createdOnOrAfter: createdOnOrAfter,
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  sort: sort
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: GlAccounts UpdateAccount
  server.tool("gl_accounts_update_account",
  {
      accountId: z.number().int().describe("Format - int64. Long integer id of the General Ledger account to be updated"),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.record(z.any()).optional().describe("Payload for updating the GL Account.  Omit to leave fields unchanged.")
  },
  async ({ accountId, tenant, payload }) => {
      try {
      const endpoint = `/tenant/${tenant}/gl-accounts/${accountId}`;
      const response = await api.patch(endpoint, payload);
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: GlAccounts_GetTypeList
  server.tool("gl_accounts_get_type_list",
  {
      tenant: z.number().int().describe("Tenant ID"),
      ids: z.string().optional().describe("Comma-delimited list of account type IDs, maximum 50 items"),
      names: z.string().optional().describe("Comma-delimited list of account type names, maximum 50 items"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      createdBefore: z.string().datetime().optional().describe("Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().optional().describe("The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      sort: z.string().optional().describe("Applies sorting by specified fields")
  },
  async ({ tenant, ids, names, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/gl-accounts/types`, {
              params: {
                  ids: ids,
                  names: names,
                  active: active,
                  createdBefore: createdBefore,
                  createdOnOrAfter: createdOnOrAfter,
                  modifiedBefore: modifiedBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter,
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  sort: sort
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Inventory Bills - Get Custom Field Types
  server.tool("inventory_bills_get_custom_field_types",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      sort: z.string().optional()
  },
  async ({ tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/inventory-bills/custom-fields`, {
              params: {
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  createdBefore: createdBefore,
                  createdOnOrAfter: createdOnOrAfter,
                  modifiedBefore: modifiedBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter,
                  sort: sort
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: inventory_bills_get_list
  server.tool("inventory_bills_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional(),
      batchId: z.number().int().nullable().optional().describe("Format - int64."),
      batchNumber: z.number().int().nullable().optional().describe("Format - int32."),
      billNumber: z.string().nullable().optional(),
      businessUnitIds: z.string().nullable().optional(),
      'customField.Fields': z.record(z.string(), z.string()).nullable().optional().describe("Dictionary of name-value pairs"),
      'customField.Operator': z.enum(["And", "Or"]).nullable().optional().describe("Operator to be used between the name-value pairs. Can be \"Or\" or \"And\", default is \"And\"."),
      dateFrom: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339)."),
      dateTo: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339)."),
      jobNumber: z.string().nullable().optional(),
      purchaseOrderNumber: z.string().nullable().optional(),
      purchaseOrderTypes: z.string().nullable().optional(),
      syncStatuses: z.array(z.enum(["New", "SyncRequired", "Syncing", "Synced", "Failed"])).nullable().optional(),
      minCost: z.number().nullable().optional().describe("Format - decimal."),
      maxCost: z.number().nullable().optional().describe("Format - decimal."),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned")
  },
  async ({ tenant, ids, batchId, batchNumber, billNumber, businessUnitIds, 'customField.Fields': customField_Fields, 'customField.Operator': customField_Operator, dateFrom, dateTo, jobNumber, purchaseOrderNumber, purchaseOrderTypes, syncStatuses, minCost, maxCost, page, pageSize, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, includeTotal }) => {
      try {
          let endpoint = `/tenant/${tenant}/inventory-bills`;
          const params = {
              ids: ids || undefined,
              batchId: batchId || undefined,
              batchNumber: batchNumber || undefined,
              billNumber: billNumber || undefined,
              businessUnitIds: businessUnitIds || undefined,
              'customField.Fields': customField_Fields ? JSON.stringify(customField_Fields) : undefined,
              'customField.Operator': customField_Operator || undefined,
              dateFrom: dateFrom || undefined,
              dateTo: dateTo || undefined,
              jobNumber: jobNumber || undefined,
              purchaseOrderNumber: purchaseOrderNumber || undefined,
              purchaseOrderTypes: purchaseOrderTypes || undefined,
              syncStatuses: syncStatuses ? syncStatuses.join(',') : undefined,
              minCost: minCost || undefined,
              maxCost: maxCost || undefined,
              page: page || undefined,
              pageSize: pageSize || undefined,
              createdBefore: createdBefore || undefined,
              createdOnOrAfter: createdOnOrAfter || undefined,
              modifiedBefore: modifiedBefore || undefined,
              modifiedOnOrAfter: modifiedOnOrAfter || undefined,
              includeTotal: includeTotal || undefined
          };
  
          const response = await api.get(endpoint, { params: params });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: InventoryBills_UpdateCustomFields
  server.tool(
  "inventory_bills_update_custom_fields",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      customFields: z.record(z.any()).describe("Custom fields to update")
  },
  async ({ tenant, customFields }) => {
      try {
      const response = await api.patch(`/tenant/${tenant}/inventory-bills/custom-fields`, customFields);
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Inventory Bills Mark As Exported
  server.tool(
      "inventory_bills_mark_as_exported",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
      },
      async ({ tenant }) => {
          try {
              const response = await api.post(`/tenant/${tenant}/inventory-bills/markasexported`);
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Invoices_CreateAdjustmentInvoice
  server.tool(
      "Invoices_CreateAdjustmentInvoice",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
      },
      async ({ tenant }) => {
          try {
              const response = await api.post(`/tenant/${tenant}/invoices`);
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Invoices_UpdateCustomFields
  server.tool("invoices_update_custom_fields",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      custom_fields: z.record(z.string(), z.any()).describe("Custom fields to update for the invoice")
  },
  async ({ tenant, custom_fields }) => {
      try {
      const response = await api.patch(`/tenant/${tenant}/invoices/custom-fields`, custom_fields);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Invoices UpdateInvoice
  server.tool("invoices_updateinvoice",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.record(z.any()).optional().describe("The update payload")
  },
  async ({ id, tenant, payload }) => {
      try {
      const response = await api.patch(`/tenant/${tenant}/invoices/${id}`, payload);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Invoices Get List
  server.tool("invoices_getlist",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Comma-delimited list of invoice IDs."),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      statuses: z.array(z.string()).nullable().optional().describe("Transaction status, which can be one of: Pending, Posted, Exported.\nBy default, all transaction statuses are included.  If you want to filter by more\nthan one status, add a new \"statuses\" query parameter for each status you want to include.\nFor example: &statuses=Pending&statuses=Posted"),
      batchId: z.number().int().nullable().optional().describe("Format - int64. Batch ID associated with invoices."),
      batchNumber: z.number().int().nullable().optional().describe("Format - int32. Batch number associated with invoices."),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      "customField.Fields": z.record(z.string(), z.string()).nullable().optional().describe("Dictionary of name-value pairs"),
      "customField.Operator": z.string().nullable().optional().describe("Operator to be used between the name-value pairs. Can be \"Or\" or \"And\", default is \"And\".\\\nValues: [And, Or]"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      jobId: z.number().int().nullable().optional().describe("Format - int64. Job ID associated with invoices. This will be null if the invoice is not linked to a job."),
      jobNumber: z.string().nullable().optional().describe("Job number associated with invoices. This will be null if the invoice is not linked to a job."),
      businessUnitId: z.number().int().nullable().optional().describe("Format - int64. Business unit ID associated with invoices."),
      customerId: z.number().int().nullable().optional().describe("Format - int64. Customer ID associated with invoices."),
      invoicedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339)."),
      invoicedOnBefore:  z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339)."),
      adjustmentToId: z.number().int().nullable().optional().describe("Format - int64. When searching for adjustment invoices, this field will search for invoices that are adjustments to the specified invoice ID."),
      number: z.string().nullable().optional().describe("Reference number associated with invoices."),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      totalGreater: z.number().nullable().optional().describe("Format - decimal. Retrieve all invoices with a total greater than or equal to the input value."),
      totalLess: z.number().nullable().optional().describe("Format - decimal. Retrieve all invoices with a total less than or equal to the input value."),
      "balanceFilter.Balance": z.number().nullable().optional().describe("Format - decimal."),
      "balanceFilter.Comparer": z.string().nullable().optional().describe("Values: [Equals, NotEquals, Greater, Less]"),
      dueDateBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Retrieve all invoices with a due date before the input value"),
      dueDateOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Retrieve all invoices with a due date on after or equal the input value"),
      orderBy: z.string().nullable().optional().describe("Field on which you want to order the returned list of invoices."),
      orderByDirection: z.string().nullable().optional().describe('Order direction of the retuned list of invoices.  Values of "desc" or "descending" will order the list in descending order, otherwise the list will be ordered in ascending order.'),
      reviewStatuses: z.array(z.string()).nullable().optional().describe("Review statuses associated with invoices."),
      assignedToIds: z.array(z.number().int()).nullable().optional().describe("AssignedTo IDs associated with invoices."),
      sort: z.string().nullable().optional().describe('Applies sorting by the specified field:\n"?sort=+FieldName" for ascending order,\n"?sort=-FieldName" for descending order.\'')
  },
  async ({ tenant, ids, modifiedBefore, modifiedOnOrAfter, statuses, batchId, batchNumber, page, pageSize, "customField.Fields": customFieldFields, "customField.Operator": customFieldOperator, includeTotal, jobId, jobNumber, businessUnitId, customerId, invoicedOnOrAfter, invoicedOnBefore, adjustmentToId, number, createdOnOrAfter, createdBefore, totalGreater, totalLess, "balanceFilter.Balance": balanceFilterBalance, "balanceFilter.Comparer": balanceFilterComparer, dueDateBefore, dueDateOnOrAfter, orderBy, orderByDirection, reviewStatuses, assignedToIds, sort }) => {
      try {
          const endpoint = `/tenant/${tenant}/invoices`;
          const response = await api.get(endpoint, {
              params: {
                  ids,
                  modifiedBefore,
                  modifiedOnOrAfter,
                  statuses,
                  batchId,
                  batchNumber,
                  page,
                  pageSize,
                  "customField.Fields": customFieldFields,
                  "customField.Operator": customFieldOperator,
                  includeTotal,
                  jobId,
                  jobNumber,
                  businessUnitId,
                  customerId,
                  invoicedOnOrAfter,
                  invoicedOnBefore,
                  adjustmentToId,
                  number,
                  createdOnOrAfter,
                  createdBefore,
                  totalGreater,
                  totalLess,
                  "balanceFilter.Balance": balanceFilterBalance,
                  "balanceFilter.Comparer": balanceFilterComparer,
                  dueDateBefore,
                  dueDateOnOrAfter,
                  orderBy,
                  orderByDirection,
                  reviewStatuses,
                  assignedToIds,
                  sort
              },
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Invoices GetCustomFieldTypes
  server.tool(
  "invoices_getcustomfieldtypes",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      sort: z.string().optional(),
  },
  async ({ tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
      try {
      let endpoint = `/tenant/${tenant}/invoices/custom-fields`;
      const params: Record<string, any> = {};
      if (page !== undefined) {
          params.page = page;
      }
      if (pageSize !== undefined) {
          params.pageSize = pageSize;
      }
      if (includeTotal !== undefined) {
          params.includeTotal = includeTotal;
      }
      if (createdBefore !== undefined) {
          params.createdBefore = createdBefore;
      }
      if (createdOnOrAfter !== undefined) {
          params.createdOnOrAfter = createdOnOrAfter;
      }
      if (modifiedBefore !== undefined) {
          params.modifiedBefore = modifiedBefore;
      }
      if (modifiedOnOrAfter !== undefined) {
          params.modifiedOnOrAfter = modifiedOnOrAfter;
      }
      if (sort !== undefined) {
          params.sort = sort;
      }
  
      const response = await api.get(endpoint, {
          params: params
      });
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Invoices_DeleteInvoiceItem
  server.tool(
      "invoices_delete_invoice_item",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          invoiceId: z.number().int().describe("Format - int64."),
          itemId: z.number().int().describe("Format - int64.")
      },
      async ({ tenant, invoiceId, itemId }) => {
          try {
              const endpoint = `/tenant/${tenant}/invoices/${invoiceId}/items/${itemId}`;
              await api.delete(endpoint);
  
              return {
                  content: [{ type: "text", text: "Invoice item deleted successfully." }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Invoices_UpdateInvoiceItems
  server.tool("invoices_update_invoice_items",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      invoiceId: z.number().int().describe("Format - int64."),
      payload: z.record(z.any()).optional().describe("The request body as a JSON object.  Each key represents a field to be updated.  The values are the new values for the respective fields.")
  },
  async ({ tenant, invoiceId, payload }) => {
      try {
      const endpoint = `/tenant/${tenant}/invoices/${invoiceId}/items`;
  
      const response = await api.patch(endpoint, payload);
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Invoices MarkAsExported
  server.tool(
      "invoices_markasexported",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
      },
      async ({ tenant }) => {
          try {
              const response = await api.post(`/tenant/${tenant}/invoices/markasexported`);
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: JournalEntries GetSummary
  server.tool("journal_entries_get_summary",
  {
      id: z.string().uuid().describe("Format - guid."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default). Maximum value is 500."),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned")
  },
  async ({ id, tenant, pageSize, page, includeTotal }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/journal-entries/${id}/summary`, {
              params: { pageSize, page, includeTotal }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: JournalEntries GetDetails
  server.tool("journal_entries_get_details",
  {
      id: z.string().uuid().describe("Format - guid."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default). Maximum value is 500."),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned")
  },
  async ({ id, tenant, pageSize, page, includeTotal }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/journal-entries/${id}/details`, {
          params: { pageSize, page, includeTotal }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Journal Entries Get List
  server.tool("journal_entries_get_list",
  {
      tenant: z.number().int().describe("Tenant ID"),
      ids: z.string().optional().describe("Comma-delimited list of journal entry IDs, maximum 50 items"),
      exportedFrom: z.string().datetime().optional().describe("Exported on or after certain date/time (in UTC)"),
      exportedTo: z.string().datetime().optional().describe("Exported on or before certain date/time (in UTC)"),
      postedFrom: z.string().datetime().optional().describe("Posted on or after certain date/time (in UTC)"),
      postedTo: z.string().datetime().optional().describe("Posted on or before certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Return items modified on or after certain date/time (in UTC)"),
      createdBefore: z.string().datetime().optional().describe("Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Return items created on or after certain date/time (in UTC)"),
      exportedBy: z.string().optional().describe("Comma-delimited list of user IDs, maximum 50 items"),
      name: z.string().max(255).optional().describe("Name contains"),
      numberFrom: z.number().int().optional().describe("Number is greater or equal than"),
      numberTo: z.number().int().optional().describe("Number is less or equal to"),
      statuses: z.string().array().max(50).optional().describe("Array of statuses"),
      syncStatuses: z.string().array().max(50).optional().describe("Array of sync statuses"),
      transactionPostedFrom: z.string().datetime().optional().describe("Contains a transaction posted on or after certain date/time (in UTC)"),
      transactionPostedTo: z.string().datetime().optional().describe("Contains a transaction posted on or before certain date/time (in UTC)"),
      businessUnitIds: z.string().optional().describe("Comma-delimited list of business unit IDs, maximum 50 items"),
      serviceAgreementIds: z.string().optional().describe("Comma-delimited list of service agreement IDs, maximum 50 items"),
      customerName: z.string().max(255).optional().describe("Contains a transaction for a customer with name containing"),
      locationName: z.string().max(255).optional().describe("Contains a transaction for a customer location with name containing"),
      vendorName: z.string().max(255).optional().describe("Contains a transaction for a vendor with name containing"),
      inventoryLocationName: z.string().max(255).optional().describe("Contains a transaction for an inventory location with name containing"),
      refNumber: z.string().max(255).optional().describe("Contains a transaction with reference number containing"),
      transactionTypes: z.string().array().max(50).optional().describe("List of transaction types. A journal entry will be returned if it contains at least one transaction of this type."),
      customField: z.record(z.string(), z.string()).optional().describe("Filter by custom fields associated with journal entries. Example: ?customField.fieldName1=value1&customField.fieldName2=value2. A field with null value, and a non-existent field are treated equally. Maximum 5 custom fields are supported in one request."),
      sort: z.string().optional().describe("Applies sorting by the specified field and direction. Options: Id, Number, Name, Status, CreatedOn, ExportedOn, ExportedBy, PostDate. Use \"+\" for ascending order, and \"-\" for descending order. Example: \"?sort=-Number\" will sort by number in descending order."),
      pageSize: z.number().int().optional().describe("How many records to return (50 by default). Maximum value is 500."),
      page: z.number().int().optional().describe("The logical number of page to return, starting from 1"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned")
  },
  async ({ tenant, ids, exportedFrom, exportedTo, postedFrom, postedTo, modifiedBefore, modifiedOnOrAfter, createdBefore, createdOnOrAfter, exportedBy, name, numberFrom, numberTo, statuses, syncStatuses, transactionPostedFrom, transactionPostedTo, businessUnitIds, serviceAgreementIds, customerName, locationName, vendorName, inventoryLocationName, refNumber, transactionTypes, customField, sort, pageSize, page, includeTotal }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/journal-entries`, {
              params: {
                  ids,
                  exportedFrom,
                  exportedTo,
                  postedFrom,
                  postedTo,
                  modifiedBefore,
                  modifiedOnOrAfter,
                  createdBefore,
                  createdOnOrAfter,
                  exportedBy,
                  name,
                  numberFrom,
                  numberTo,
                  statuses,
                  syncStatuses,
                  transactionPostedFrom,
                  transactionPostedTo,
                  businessUnitIds,
                  serviceAgreementIds,
                  customerName,
                  locationName,
                  vendorName,
                  inventoryLocationName,
                  refNumber,
                  transactionTypes,
                  ...customField as { [key: string]: any },
                  sort,
                  pageSize,
                  page,
                  includeTotal
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: JournalEntries_Update
  server.tool("journal_entries_update",
  {
      id: z.string().uuid().describe("Format - guid."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.object({
          // Define the payload schema based on your API requirements.
          // This is a placeholder; replace with the actual schema.
          name: z.string().optional(),
          status: z.enum(["Open", "Closed", "Draft"]).optional(),
          customFields: z.array(z.object({
              name: z.string(),
              value: z.string()
          })).optional()
      }).optional()
  },
  async ({ id, tenant, payload }) => {
      try {
          const endpoint = `/tenant/${tenant}/journal-entries/${id}`;
          const response = await api.patch(endpoint, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: JournalEntries SyncUpdate
  server.tool(
      "journal_entries_sync_update",
      {
          id: z.string().uuid().describe("The Journal Entry ID (UUID)"),
          tenant: z.number().int().describe("The Tenant ID (int64)"),
      },
      async ({ id, tenant }) => {
          try {
              const endpoint = `/tenant/${tenant}/journal-entries/${id}/sync`;
              const response = await api.patch(endpoint);
  
              if (response.status === 200) {
                  return {
                      content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
                  };
              } else if (response.status === 400) {
                  return {
                      content: [{ type: "text", text: `Error: Bad Request - ${String(JSON.stringify(response.data))}` }],
                  };
              } else {
                  return {
                      content: [{ type: "text", text: `Error: Unexpected status code ${response.status} - ${String(JSON.stringify(response.data))}` }],
                  };
              }
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Payments Create
  server.tool("payments_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ tenant }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/payments`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Payments_UpdateCustomFields
  server.tool(
  "Payments_UpdateCustomFields",
  {
      tenant: z.number().int().describe("Tenant ID"),
      custom_fields: z.record(z.string(), z.any()).describe("Custom fields to update")
  },
  async ({ tenant, custom_fields }) => {
      try {
          const response = await api.patch(`/tenant/${tenant}/payments/custom-fields`, custom_fields);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: payments_get_custom_field_types
  server.tool("payments_get_custom_field_types",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      sort: z.string().optional()
  },
  async ({ tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/payments/custom-fields`, {
              params: { page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: payments_get_list
  server.tool("payments_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      appliedToInvoiceIds: z.string().nullable().optional(),
      appliedToReferenceNumber: z.string().nullable().optional(),
      statuses: z.string().nullable().optional(),
      paidOnAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339)."),
      paidOnBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339)."),
      businessUnitIds: z.string().nullable().optional(),
      batchNumber: z.number().int().nullable().optional().describe("Format - int32."),
      batchId: z.number().int().nullable().optional().describe("Format - int64."),
      transactionType: z.string().nullable().optional().describe("Values: [Undefined, JournalEntry, ReceivePayment]"),
      customerId: z.number().int().nullable().optional().describe("Format - int64."),
      totalGreater: z.number().nullable().optional().describe("Format - decimal."),
      totalLess: z.number().nullable().optional().describe("Format - decimal."),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      "customField.Fields": z.record(z.string()).nullable().optional().describe("Dictionary of name-value pairs"),
      "customField.Operator": z.string().nullable().optional().describe("Operator to be used between the name-value pairs. Can be \"Or\" or \"And\", default is \"And\".\nValues: [And, Or]"),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.")
  },
  async ({ tenant, ids, appliedToInvoiceIds, appliedToReferenceNumber, statuses, paidOnAfter, paidOnBefore, businessUnitIds, batchNumber, batchId, transactionType, customerId, totalGreater, totalLess, page, pageSize, includeTotal, "customField.Fields": customFieldFields, "customField.Operator": customFieldOperator, modifiedBefore, modifiedOnOrAfter, createdBefore, createdOnOrAfter, sort }) => {
      try {
          const endpoint = `/tenant/${tenant}/payments`;
          const params = {
              ids: ids || undefined,
              appliedToInvoiceIds: appliedToInvoiceIds || undefined,
              appliedToReferenceNumber: appliedToReferenceNumber || undefined,
              statuses: statuses || undefined,
              paidOnAfter: paidOnAfter || undefined,
              paidOnBefore: paidOnBefore || undefined,
              businessUnitIds: businessUnitIds || undefined,
              batchNumber: batchNumber || undefined,
              batchId: batchId || undefined,
              transactionType: transactionType || undefined,
              customerId: customerId || undefined,
              totalGreater: totalGreater || undefined,
              totalLess: totalLess || undefined,
              page: page || undefined,
              pageSize: pageSize || undefined,
              includeTotal: includeTotal || undefined,
              "customField.Fields": customFieldFields ? JSON.stringify(customFieldFields) : undefined,
              "customField.Operator": customFieldOperator || undefined,
              modifiedBefore: modifiedBefore || undefined,
              modifiedOnOrAfter: modifiedOnOrAfter || undefined,
              createdBefore: createdBefore || undefined,
              createdOnOrAfter: createdOnOrAfter || undefined,
              sort: sort || undefined
          };
  
          const response = await api.get(endpoint, { params: params });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Payments UpdateStatus
  server.tool("Payments_UpdateStatus",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ tenant }) => {
      try {
          const response = await api.post(`/tenant/${tenant}/payments/status`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: PaymentTerms_GetPaymentTermModel
  server.tool(
  "payment_terms_get_payment_term_model",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      paymentTermId: z.number().int().describe("Format - int64."),
  },
  async ({ tenant, paymentTermId }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/payment-terms/${paymentTermId}`);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }],
          };
      }
  }
  );
  // Tool: Payments Update
  server.tool("payments_update",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.object({
          typeId: z.number().int().optional(),
          active: z.boolean().optional(),
          memo: z.string().optional(),
          paidOn: z.string().optional(),
          authCode: z.string().optional(),
          checkNumber: z.string().optional(),
          exportId: z.string().optional(),
          transactionStatus: z.any().optional(),
          status: z.any().optional(),
          splits: z.array(z.object({
              invoiceId: z.number().int().optional(),
              amount: z.number().optional()
          })).optional()
      }).optional().describe("Payment details to update")
  },
  async ({ id, tenant, payload }) => {
      try {
          const endpoint = `/tenant/${tenant}/payments/${id}`;
          const response = await api.patch(endpoint, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: PaymentTypes_Get
  server.tool("PaymentTypes_Get",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/payment-types/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: PaymentTypes_GetList
  server.tool("payment_types_GetList",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().optional().nullable().describe("Perform lookup by multiple IDs (maximum 50)"),
      active: z.string().optional().nullable().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      createdBefore: z.string().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      page: z.number().int().optional().nullable().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().nullable().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().nullable().describe("Whether total count should be returned")
  },
  async ({ tenant, ids, active, createdBefore, createdOnOrAfter, page, pageSize, includeTotal }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/payment-types`, {
          params: { ids, active, createdBefore, createdOnOrAfter, page, pageSize, includeTotal }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Payment Terms Get List
  server.tool("paymentterms_getlist",
  {
      tenant: z.number().int().describe("Tenant ID"),
      ids: z.string().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      createdBefore: z.string().datetime().optional().describe("Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional(),
      modifiedOnOrAfter: z.string().datetime().optional(),
      page: z.number().int().optional().describe("The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, Name, CreatedOn.")
  },
  async ({ tenant, ids, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort }) => {
      try {
          let endpoint = `/tenant/${tenant}/payment-terms`;
          const params: any = {};
          if (ids) params.ids = ids;
          if (createdBefore) params.createdBefore = createdBefore;
          if (createdOnOrAfter) params.createdOnOrAfter = createdOnOrAfter;
          if (modifiedBefore) params.modifiedBefore = modifiedBefore;
          if (modifiedOnOrAfter) params.modifiedOnOrAfter = modifiedOnOrAfter;
          if (page) params.page = page;
          if (pageSize) params.pageSize = pageSize;
          if (includeTotal) params.includeTotal = includeTotal;
          if (sort) params.sort = sort;
  
          const response = await api.get(endpoint, { params: params });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: TaxZones_GetList
  server.tool("tax_zones_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().optional().describe("Tax Zone Ids to pull tax zones for"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, Name, CreatedOn.")
  },
  async ({ tenant, ids, active, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
      try {
      let endpoint = `/tenant/${tenant}/tax-zones`;
      const params: any = {};
      if (ids) {
          params.ids = ids;
      }
      if (active) {
          params.active = active;
      }
      if (page) {
          params.page = page;
      }
      if (pageSize) {
          params.pageSize = pageSize;
      }
      if (includeTotal) {
          params.includeTotal = includeTotal;
      }
      if (createdBefore) {
          params.createdBefore = createdBefore;
      }
      if (createdOnOrAfter) {
          params.createdOnOrAfter = createdOnOrAfter;
      }
      if (modifiedBefore) {
          params.modifiedBefore = modifiedBefore;
      }
      if (modifiedOnOrAfter) {
          params.modifiedOnOrAfter = modifiedOnOrAfter;
      }
      if (sort) {
          params.sort = sort;
      }
  
      const response = await api.get(endpoint, { params: params });
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );


// Tool: BookingProviderTags_Create
server.tool("BookingProviderTags_Create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ tenant }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/booking-provider-tags`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: BookingProviderTags_Get
  server.tool("booking_provider_tags_get",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/booking-provider-tags/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Bookings Get
  server.tool("bookings_get",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/bookings/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: BookingProviderTags Update
  server.tool("booking_provider_tags_update",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      tagName: z.string().optional().describe("Tag Name"),
      description: z.string().optional().describe("Description")
  },
  async ({ id, tenant, tagName, description }) => {
      try {
          const payload: any = {};
          if (tagName !== undefined) {
              payload.tagName = tagName;
          }
          if (description !== undefined) {
              payload.description = description;
          }
  
          const response = await api.patch(`/tenant/${tenant}/booking-provider-tags/${id}`, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Booking Provider Tags Get List
  server.tool(
      "booking_provider_tags_get_list",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          name: z.string().optional().nullable().describe("Name of the booking provider tag"),
          ids: z.string().optional().nullable().describe("Perform lookup by multiple IDs (maximum 50)"),
          page: z.number().int().optional().nullable().describe("Format - int32. The logical number of page to return, starting from 1"),
          pageSize: z.number().int().optional().nullable().describe("Format - int32. How many records to return (50 by default)"),
          includeTotal: z.boolean().optional().nullable().describe("Whether total count should be returned"),
          createdBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
          createdOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
          modifiedBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
          modifiedOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
          sort: z.string().optional().nullable().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn."),
      },
      async ({ tenant, name, ids, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
          try {
              const endpoint = `/tenant/${tenant}/booking-provider-tags`;
              const response = await api.get(endpoint, {
                  params: {
                      name: name ?? undefined,
                      ids: ids ?? undefined,
                      page: page ?? undefined,
                      pageSize: pageSize ?? undefined,
                      includeTotal: includeTotal ?? undefined,
                      createdBefore: createdBefore ?? undefined,
                      createdOnOrAfter: createdOnOrAfter ?? undefined,
                      modifiedBefore: modifiedBefore ?? undefined,
                      modifiedOnOrAfter: modifiedOnOrAfter ?? undefined,
                      sort: sort ?? undefined,
                  },
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Bookings_GetForProvider
  server.tool("bookings_get_for_provider",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      booking_provider: z.number().int().describe("Format - int64."),
      id: z.number().int().describe("Format - int64.")
  },
  async ({ tenant, booking_provider, id }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/booking-provider/${booking_provider}/bookings/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Bookings GetContactList
  server.tool("bookings_getcontactlist",
  {
      id: z.number().int().describe("The booking ID (int64)"),
      tenant: z.number().int().describe("The tenant ID (int64)"),
      page: z.number().int().optional().describe("The logical number of page to return, starting from 1 (int32)"),
      pageSize: z.number().int().optional().describe("How many records to return (50 by default) (int32)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned")
  },
  async ({ id, tenant, page, pageSize, includeTotal }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/bookings/${id}/contacts`, {
              params: { page, pageSize, includeTotal }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Bookings GetList
  server.tool("bookings_getlist",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      externalId: z.string().nullable().optional().describe("Filters by booking's external ID"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ tenant, ids, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, externalId, sort }) => {
      try {
      const endpoint = `/tenant/${tenant}/bookings`;
      const response = await api.get(endpoint, {
          params: {
          ids: ids || undefined,
          page: page || undefined,
          pageSize: pageSize || undefined,
          includeTotal: includeTotal || undefined,
          createdBefore: createdBefore || undefined,
          createdOnOrAfter: createdOnOrAfter || undefined,
          modifiedBefore: modifiedBefore || undefined,
          modifiedOnOrAfter: modifiedOnOrAfter || undefined,
          externalId: externalId || undefined,
          sort: sort || undefined
          }
      });
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Bookings Update
  server.tool("bookings_update",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      booking_provider: z.number().int().describe("Format - int64."),
      id: z.number().int().describe("Format - int64."),
      payload: z.record(z.any()).optional().describe("JSON payload for the update")
  },
  async ({ tenant, booking_provider, id, payload }) => {
      try {
      const endpoint = `/tenant/${tenant}/booking-provider/${booking_provider}/bookings/${id}`;
  
      const response = await api.patch(endpoint, payload);
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  server.tool("bookings_create",
  {
      booking_provider: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      body: z.record(z.any()).describe("Request body")
  },
  async ({ booking_provider, tenant, body }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/booking-provider/${booking_provider}/bookings`,
          body
      );
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Bookings_CreateContact
  server.tool("bookings_create_contact",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      booking_provider: z.number().int().describe("Format - int64."),
      id: z.number().int().describe("Format - int64."),
      type: z.string().describe("Contact type"),
      value: z.string().describe("Contact value"),
      memo: z.string().optional().describe("Contact memo")
  },
  async ({ tenant, booking_provider, id, type, value, memo }) => {
      try {
          const response = await api.post(`/tenant/${tenant}/booking-provider/${booking_provider}/bookings/${id}/contacts`, {
              type: type,
              value: value,
              memo: memo
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Bookings_GetList2
  server.tool("Bookings_GetList2",
  {
      booking_provider: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      externalId: z.string().nullable().optional().describe("Filters by booking's external ID"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ booking_provider, tenant, ids, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, externalId, sort }) => {
      try {
      let endpoint = `/tenant/${tenant}/booking-provider/${booking_provider}/bookings`;
      const params = { ids, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, externalId, sort };
      const response = await api.get(endpoint, { params: params });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: bookings_get_contact_list2
  server.tool(
      "bookings_get_contact_list2",
      {
          booking_provider: z.number().int().describe("Format - int64."),
          id: z.number().int().describe("Format - int64."),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
          pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
          includeTotal: z.boolean().optional().describe("Whether total count should be returned")
      },
      async ({ booking_provider, id, tenant, page, pageSize, includeTotal }) => {
          try {
              const endpoint = `/tenant/${tenant}/booking-provider/${booking_provider}/bookings/${id}/contacts`;
              const response = await api.get(endpoint, {
                  params: {
                      page: page,
                      pageSize: pageSize,
                      includeTotal: includeTotal
                  }
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Bookings Update Booking Contact
  server.tool(
  "bookings_updatebookingcontact",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      booking_provider: z.number().int().describe("Format - int64."),
      id: z.number().int().describe("Format - int64."),
      contactId: z.number().int().describe("Format - int64."),
      type: z.string().describe("Contact type (e.g., Phone)"),
      value: z.string().describe("Contact value (e.g., phone number)"),
      memo: z.string().optional().describe("Optional memo for the contact")
  },
  async ({ tenant, booking_provider, id, contactId, type, value, memo }) => {
      try {
          const endpoint = `/tenant/${tenant}/booking-provider/${booking_provider}/bookings/${id}/contacts/${contactId}`;
          const payload = {
              type: type,
              value: value,
              memo: memo
          };
          const response = await api.patch(endpoint, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: BulkTags_RemoveTags
  server.tool(
  "bulk_tags_remove_tags",
  {
      tenant: z.number().int().describe("Tenant ID"),
  },
  async ({ tenant }) => {
      try {
      const response = await api.delete(`/tenant/${tenant}/tags`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
      };
      }
  }
  );
  // Tool: BulkTags AddTags
  server.tool(
      "bulk_tags_add_tags",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          tags: z.array(z.string()).describe("Array of tags to add")
      },
      async ({ tenant, tags }) => {
          try {
              const response = await api.put(`/tenant/${tenant}/tags`, { tags: tags });
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: ContactMethods_GetContactMethod
  server.tool("contact_methods_get_contact_method",
  {
      tenant: z.number().int().describe("Tenant ID"),
      contactId: z.string().uuid().describe("The contact UUID"),
      contactMethodId: z.string().uuid().describe("The contact method UUID")
  },
  async ({ tenant, contactId, contactMethodId }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/contacts/${contactId}/contact-methods/${contactMethodId}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: ContactMethods_CreateContactMethod
  server.tool("contact_methods_create_contact_method",
  {
      tenant: z.number().int().describe("Tenant ID"),
      contactId: z.string().uuid().describe("The contact UUID"),
      type: z.string().describe("The type of contact method"),
      value: z.string().describe("The value of contact method"),
      memo: z.string().optional().describe("The description of contact method")
  },
  async ({ tenant, contactId, type, value, memo }) => {
      try {
          const response = await api.post(`/tenant/${tenant}/contacts/${contactId}/contact-methods`, {
              type: type,
              value: value,
              memo: memo
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  server.tool("ContactMethods_GetContactMethods",
  {
      contactId: z.string().uuid().describe("Format - guid."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      referenceId: z.string().nullable().optional().describe("Filters by reference ID"),
      type: z.string().nullable().optional().describe("Filters by contact method type"),
      value: z.string().nullable().optional().describe("Filters by contact method value"),
      createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ contactId, tenant, referenceId, type, value, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort }) => {
      try {
          const endpoint = `/tenant/${tenant}/contacts/${contactId}/contact-methods`;
          const response = await api.get(endpoint, {
              params: {
                  referenceId: referenceId || undefined,
                  type: type || undefined,
                  value: value || undefined,
                  createdBefore: createdBefore || undefined,
                  createdOnOrAfter: createdOnOrAfter || undefined,
                  modifiedBefore: modifiedBefore || undefined,
                  modifiedOnOrAfter: modifiedOnOrAfter || undefined,
                  page: page || undefined,
                  pageSize: pageSize || undefined,
                  includeTotal: includeTotal || undefined,
                  sort: sort || undefined
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: ContactMethods_UpdateContactMethod
  server.tool("contact_methods_update_contact_method",
  {
      contactId: z.string().uuid().describe("Format - guid."),
      contactMethodId: z.string().uuid().describe("Format - guid."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.object({
          value: z.string().optional(),
          memo: z.string().optional(),
      }).optional()
  },
  async ({ contactId, contactMethodId, tenant, payload }) => {
      try {
          const endpoint = `/tenant/${tenant}/contacts/${contactId}/contact-methods/${contactMethodId}`;
          const response = await api.patch(endpoint, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: ContactMethods_UpsertContactMethod
  server.tool("contact_methods_upsert_contact_method",
  {
      tenant: z.number().int().describe("Tenant ID"),
      contactId: z.string().uuid().describe("The contact UUID"),
      contactMethodId: z.string().uuid().describe("The contact method UUID"),
      payload: z.object({
          id: z.string().uuid().optional().describe("Contact Method ID"),
          contactId: z.string().uuid().optional().describe("Contact ID"),
          referenceId: z.string().optional().describe("Reference ID"),
          type: z.string().optional().describe("Type of contact method"),
          value: z.string().optional().describe("Value of contact method"),
          memo: z.string().optional().describe("Memo for contact method"),
          createdOn: z.string().datetime().optional().describe("Date and time of creation"),
          createdBy: z.number().int().optional().describe("User ID of creator"),
          modifiedOn: z.string().datetime().optional().describe("Date and time of last modification"),
          modifiedBy: z.number().int().optional().describe("User ID of last modifier")
      }).optional().describe("Payload for updating contact method")
  },
  async ({ tenant, contactId, contactMethodId, payload }) => {
      try {
          const endpoint = `/tenant/${tenant}/contacts/${contactId}/contact-methods/${contactMethodId}`;
          const response = await api.put(endpoint, payload ? JSON.stringify(payload) : null);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: ContactMethods_DeleteContactMethod
  server.tool("contact_methods_DeleteContactMethod",
  {
      contactId: z.string().uuid().describe("Format - guid."),
      contactMethodId: z.string().uuid().describe("Format - guid."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ contactId, contactMethodId, tenant }) => {
      try {
      const endpoint = `/tenant/${tenant}/contacts/${contactId}/contact-methods/${contactMethodId}`;
      await api.delete(endpoint);
  
      return {
          content: [{ type: "text", text: "Contact method deleted successfully." }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Contacts_Get
  server.tool("contacts_get",
  {
      id: z.string().uuid().describe("Format - guid."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/contacts/${id}`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  server.tool("contacts_deletecontact",
  {
      id: z.string().uuid().describe("Format - guid."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.delete(`/tenant/${tenant}/contacts/${id}`);
      return {
          content: [{ type: "text", text: "Contact deleted successfully." }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Contacts Replace
  server.tool(
  "contacts_replace",
  {
      id: z.string().uuid().describe("Format - guid."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      body: z.object({}).passthrough().describe("Request Body")
  },
  async ({ id, tenant, body }) => {
      try {
      const response = await api.put(`/tenant/${tenant}/contacts/${id}`, JSON.stringify(body));
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Contacts_Update
  server.tool("contacts_update",
  {
      id: z.string().uuid().describe("Format - guid."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      referenceId: z.string().optional().describe("Reference ID for the contact"),
      name: z.string().optional().describe("Name of the contact"),
      title: z.string().optional().describe("Title of the contact"),
      isArchived: z.boolean().optional().describe("Indicates if the contact is archived"),
  },
  async ({ id, tenant, referenceId, name, title, isArchived }) => {
      try {
          const payload = {
              referenceId: referenceId,
              name: name,
              title: title,
              isArchived: isArchived,
          };
  
          const response = await api.patch(`/tenant/${tenant}/contacts/${id}`, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Contacts_Create
  server.tool("contacts_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      id: z.string().uuid().optional().describe("Contact ID"),
      referenceId: z.string().optional().describe("Reference ID"),
      name: z.string().optional().describe("Contact Name"),
      title: z.string().optional().describe("Contact Title"),
      isArchived: z.boolean().optional().describe("Is Archived"),
      createdOn: z.string().datetime().optional().describe("Created On"),
      createdBy: z.number().int().optional().describe("Created By"),
      modifiedOn: z.string().datetime().optional().describe("Modified On"),
      modifiedBy: z.number().int().optional().describe("Modified By")
  },
  async ({ tenant, id, referenceId, name, title, isArchived, createdOn, createdBy, modifiedOn, modifiedBy }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/contacts`, {
          id: id,
          referenceId: referenceId,
          name: name,
          title: title,
          isArchived: isArchived,
          createdOn: createdOn,
          createdBy: createdBy,
          modifiedOn: modifiedOn,
          modifiedBy: modifiedBy
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: contacts_get_by_relationship_id
  server.tool("contacts_get_by_relationship_id",
  {
      relationshipId: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      name: z.string().nullable().optional().describe("Filters by contact name"),
      title: z.string().nullable().optional().describe("Filters by contact title"),
      referenceId: z.string().nullable().optional().describe("Filters by external reference ID"),
      isArchived: z.string().nullable().optional().describe("Filters by contact archive status"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ relationshipId, tenant, name, title, referenceId, isArchived, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort }) => {
      try {
          const endpoint = `/tenant/${tenant}/contacts/relationships/${relationshipId}`;
          const response = await api.get(endpoint, {
              params: {
                  name: name || undefined,
                  title: title || undefined,
                  referenceId: referenceId || undefined,
                  isArchived: isArchived || undefined,
                  createdBefore: createdBefore || undefined,
                  createdOnOrAfter: createdOnOrAfter || undefined,
                  modifiedBefore: modifiedBefore || undefined,
                  modifiedOnOrAfter: modifiedOnOrAfter || undefined,
                  page: page || undefined,
                  pageSize: pageSize || undefined,
                  includeTotal: includeTotal || undefined,
                  sort: sort || undefined
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: contacts_get_list
  server.tool("contacts_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      name: z.string().nullable().optional().describe("Filters by contact name"),
      title: z.string().nullable().optional().describe("Filters by contact title"),
      referenceId: z.string().nullable().optional().describe("Filters by external reference ID"),
      isArchived: z.string().nullable().optional().describe("Filters by contact archive status"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ tenant, name, title, referenceId, isArchived, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort }) => {
      try {
          let endpoint = `/tenant/${tenant}/contacts`;
          const params: Record<string, any> = {};
  
          if (name !== undefined && name !== null) {
              params.name = name;
          }
          if (title !== undefined && title !== null) {
              params.title = title;
          }
          if (referenceId !== undefined && referenceId !== null) {
              params.referenceId = referenceId;
          }
          if (isArchived !== undefined && isArchived !== null) {
              params.isArchived = isArchived;
          }
          if (createdBefore !== undefined && createdBefore !== null) {
              params.createdBefore = createdBefore;
          }
          if (createdOnOrAfter !== undefined && createdOnOrAfter !== null) {
              params.createdOnOrAfter = createdOnOrAfter;
          }
          if (modifiedBefore !== undefined && modifiedBefore !== null) {
              params.modifiedBefore = modifiedBefore;
          }
          if (modifiedOnOrAfter !== undefined && modifiedOnOrAfter !== null) {
              params.modifiedOnOrAfter = modifiedOnOrAfter;
          }
          if (page !== undefined && page !== null) {
              params.page = page;
          }
          if (pageSize !== undefined && pageSize !== null) {
              params.pageSize = pageSize;
          }
          if (includeTotal !== undefined && includeTotal !== null) {
              params.includeTotal = includeTotal;
          }
          if (sort !== undefined && sort !== null) {
              params.sort = sort;
          }
  
          const response = await api.get(endpoint, { params: params });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Contacts Delete Contact Relationship
  server.tool("contacts_deletecontactrelationship",
  {
      contactId: z.string().uuid().describe("Format - guid. Contact Id"),
      relatedEntityId: z.number().int().describe("Format - int64. Related Entity ID"),
      typeSlug: z.string().describe("Relationship type: customer, location, booking"),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ contactId, relatedEntityId, typeSlug, tenant }) => {
      try {
      const response = await api.delete(`/tenant/${tenant}/contacts/${contactId}/relationships/${relatedEntityId}/${typeSlug}`);
      return {
          content: [{ type: "text", text: "Contact relationship deleted successfully." }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Contacts Create Contact Relationship
  server.tool("contacts_create_contact_relationship",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      contactId: z.string().uuid().describe("Format - guid. Contact Id"),
      relatedEntityId: z.number().int().describe("Format - int64. Related Entity ID"),
      typeSlug: z.string().describe("Relationship type slug: customer, location, booking")
  },
  async ({ tenant, contactId, relatedEntityId, typeSlug }) => {
      try {
      const endpoint = `/tenant/${tenant}/contacts/${contactId}/relationships/${relatedEntityId}/${typeSlug}`;
      const response = await api.post(endpoint);
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Customers Get
  server.tool("customers_get",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/customers/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Contacts_GetContactRelationshipList
  server.tool("contacts_getcontactrelationship_list",
  {
      contactId: z.string().uuid().describe("Format - guid."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      relatedEntityId: z.number().int().optional().nullable().describe("Format - int64. Filters by related entity id"),
      typeSlug: z.string().optional().nullable().describe("Relationship type slug: customer, location, booking"),
      typeName: z.string().optional().nullable().describe("Relationship type name: Customer, Location, Booking"),
      createdBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      page: z.number().int().optional().nullable().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().nullable().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().nullable().describe("Whether total count should be returned"),
      sort: z.string().optional().nullable().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: ID, ModifiedOn, CreatedOn.")
  },
  async ({ contactId, tenant, relatedEntityId, typeSlug, typeName, createdBefore, createdOnOrAfter, page, pageSize, includeTotal, sort }) => {
      try {
          let endpoint = `/tenant/${tenant}/contacts/${contactId}/relationships`;
          const params: any = {};
          if (relatedEntityId !== null && relatedEntityId !== undefined) {
              params.relatedEntityId = relatedEntityId;
          }
          if (typeSlug !== null && typeSlug !== undefined) {
              params.typeSlug = typeSlug;
          }
          if (typeName !== null && typeName !== undefined) {
              params.typeName = typeName;
          }
          if (createdBefore !== null && createdBefore !== undefined) {
              params.createdBefore = createdBefore;
          }
          if (createdOnOrAfter !== null && createdOnOrAfter !== undefined) {
              params.createdOnOrAfter = createdOnOrAfter;
          }
          if (page !== null && page !== undefined) {
              params.page = page;
          }
          if (pageSize !== null && pageSize !== undefined) {
              params.pageSize = pageSize;
          }
          if (includeTotal !== null && includeTotal !== undefined) {
              params.includeTotal = includeTotal;
          }
          if (sort !== null && sort !== undefined) {
              params.sort = sort;
          }
  
          const response = await api.get(endpoint, { params: params });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Customers Update
  server.tool(
  "customers_update",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      active: z.boolean().optional().describe("Whether the customer is active"),
      name: z.string().optional().describe("The name of the customer"),
      type: z.string().optional().describe("The type of the customer"),
      address: z.object({
          street: z.string().optional().describe("The street address"),
          unit: z.string().optional().describe("The unit number"),
          city: z.string().optional().describe("The city"),
          state: z.string().optional().describe("The state"),
          zip: z.string().optional().describe("The zip code"),
          country: z.string().optional().describe("The country"),
          latitude: z.number().optional().describe("The latitude"),
          longitude: z.number().optional().describe("The longitude"),
      }).optional().describe("The address of the customer"),
      customFields: z.array(z.object({
          typeId: z.number().int().optional().describe("The type ID of the custom field"),
          name: z.string().optional().describe("The name of the custom field"),
          value: z.string().optional().describe("The value of the custom field"),
      })).optional().describe("The custom fields of the customer"),
      balance: z.number().optional().describe("The balance of the customer"),
      tagTypeIds: z.array(z.number().int()).optional().describe("The tag type IDs of the customer"),
      doNotMail: z.boolean().optional().describe("Whether the customer should not be mailed"),
      doNotService: z.boolean().optional().describe("Whether the customer should not be serviced"),
      mergedToId: z.number().int().optional().describe("The ID of the customer this customer was merged to"),
      externalData: z.array(z.object({
          key: z.string().optional().describe("The key of the external data"),
          value: z.string().optional().describe("The value of the external data"),
      })).optional().describe("The external data of the customer"),
  },
  async ({ id, tenant, active, name, type, address, customFields, balance, tagTypeIds, doNotMail, doNotService, mergedToId, externalData }) => {
      try {
          const endpoint = `/tenant/${tenant}/customers/${id}`;
  
          const payload = {
              active: active,
              name: name,
              type: type,
              address: address,
              customFields: customFields,
              balance: balance,
              tagTypeIds: tagTypeIds,
              doNotMail: doNotMail,
              doNotService: doNotService,
              mergedToId: mergedToId,
              externalData: externalData,
          };
  
          const response = await api.patch(endpoint, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }],
          };
      }
  }
  );
  // Tool: Customers GetList
  server.tool(
      "customers_getlist",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          page: z.number().int().optional().nullable().describe("Format - int32. The logical number of page to return, starting from 1"),
          pageSize: z.number().int().optional().nullable().describe("Format - int32. How many records to return (50 by default)"),
          includeTotal: z.boolean().optional().nullable().describe("Whether total count should be returned"),
          sort: z.string().optional().nullable().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn."),
          ids: z.string().optional().nullable().describe("Returns specific customer records by customer ID."),
          createdBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Returns customer records created before the requested date (in UTC)"),
          createdOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Returns customer records created on or after the requested date (in UTC)"),
          modifiedBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Returns customer records modified before the requested date (in UTC)"),
          modifiedOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Returns customer records modified after the requested date (in UTC)"),
          excludeAccountingChangesFromModifiedDateRange: z.boolean().optional().nullable().describe("Excludes accounting changes such as balance adjustments from the modified date range."),
          name: z.string().optional().nullable().describe("Returns customer records by name."),
          street: z.string().optional().nullable().describe("Returns customer records by street."),
          unit: z.string().optional().nullable().describe("Returns customer records by unit."),
          city: z.string().optional().nullable().describe("Returns customer records by city."),
          state: z.string().optional().nullable().describe("Returns customer records by state."),
          zip: z.string().optional().nullable().describe("Returns customer records by zip."),
          country: z.string().optional().nullable().describe("Returns customer records by country."),
          latitude: z.number().optional().nullable().describe("Format - double. Returns customer records by latitude."),
          longitude: z.number().optional().nullable().describe("Format - double. Returns customer records by longitude."),
          phone: z.string().optional().nullable().describe("Returns customer records by phone number of contacts."),
          active: z.string().optional().nullable().describe("Returns customer records by active status (only active items will be returned by default).\nValues: [True, Any, False]"),
          externalDataApplicationGuid: z.string().uuid().optional().nullable().describe("Format - guid. Returns customer records with external data for a particular GUID"),
          externalDataKey: z.string().optional().nullable(),
          externalDataValues: z.string().optional().nullable(),
      },
      async ({
          tenant,
          page,
          pageSize,
          includeTotal,
          sort,
          ids,
          createdBefore,
          createdOnOrAfter,
          modifiedBefore,
          modifiedOnOrAfter,
          excludeAccountingChangesFromModifiedDateRange,
          name,
          street,
          unit,
          city,
          state,
          zip,
          country,
          latitude,
          longitude,
          phone,
          active,
          externalDataApplicationGuid,
          externalDataKey,
          externalDataValues,
      }) => {
          try {
              let endpoint = `/tenant/${tenant}/customers`;
              const params = {
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  sort: sort,
                  ids: ids,
                  createdBefore: createdBefore,
                  createdOnOrAfter: createdOnOrAfter,
                  modifiedBefore: modifiedBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter,
                  excludeAccountingChangesFromModifiedDateRange: excludeAccountingChangesFromModifiedDateRange,
                  name: name,
                  street: street,
                  unit: unit,
                  city: city,
                  state: state,
                  zip: zip,
                  country: country,
                  latitude: latitude,
                  longitude: longitude,
                  phone: phone,
                  active: active,
                  externalDataApplicationGuid: externalDataApplicationGuid,
                  externalDataKey: externalDataKey,
                  externalDataValues: externalDataValues,
              };
  
              const response = await api.get(endpoint, { params: params });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Customers GetNotes
  server.tool("customers_getnotes",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns notes created before the requested date (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns notes created on or after the requested date (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns notes modified before the requested date (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns notes modified after the requested date (in UTC)")
  },
  async ({ id, tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/customers/${id}/notes`, {
              params: {
                  page,
                  pageSize,
                  includeTotal,
                  createdBefore,
                  createdOnOrAfter,
                  modifiedBefore,
                  modifiedOnOrAfter
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Customers CreateNote
  server.tool("customers_create_note",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      text: z.string().describe("The note text"),
      isPinned: z.boolean().optional().describe("Whether the note is pinned"),
      createdById: z.number().int().optional().describe("The ID of the user who created the note")
  },
  async ({ id, tenant, text, isPinned, createdById }) => {
      try {
          const endpoint = `/tenant/${tenant}/customers/${id}/notes`;
          const payload = { text, isPinned, createdById };
          const response = await api.post(endpoint, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Customers Create
  server.tool(
  "customers_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      name: z.string().describe("Customer name"),
      type: z.string().optional().describe("Customer type"),
      address: z.object({
          street: z.string().optional(),
          unit: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          zip: z.string().optional(),
          country: z.string().optional(),
          latitude: z.number().optional(),
          longitude: z.number().optional()
      }).optional().describe("Customer address"),
      customFields: z.array(z.object({
          typeId: z.number().int().optional(),
          name: z.string().optional(),
          value: z.string().optional()
      })).optional().describe("Custom fields"),
      balance: z.number().optional().describe("Customer balance"),
      tagTypeIds: z.array(z.number().int()).optional().describe("Tag type IDs"),
      doNotMail: z.boolean().optional().describe("Do not mail flag"),
      doNotService: z.boolean().optional().describe("Do not service flag"),
      externalData: z.array(z.object({
          key: z.string().optional(),
          value: z.string().optional()
      })).optional().describe("External data"),
      locations: z.array(z.object({
          taxZoneId: z.number().int().optional(),
          id: z.number().int().optional(),
          customerId: z.number().int().optional(),
          active: z.boolean().optional(),
          name: z.string().optional(),
          address: z.object({
              street: z.string().optional(),
              unit: z.string().optional(),
              city: z.string().optional(),
              state: z.string().optional(),
              zip: z.string().optional(),
              country: z.string().optional(),
              latitude: z.number().optional(),
              longitude: z.number().optional()
          }).optional(),
          customFields: z.array(z.object({
              typeId: z.number().int().optional(),
              name: z.string().optional(),
              value: z.string().optional()
          })).optional(),
          zoneId: z.number().int().optional(),
          tagTypeIds: z.array(z.number().int()).optional(),
          externalData: z.array(z.object({
              key: z.string().optional(),
              value: z.string().optional()
          })).optional(),
          contacts: z.array(z.object({
              id: z.number().int().optional(),
              type: z.string().optional(),
              value: z.string().optional(),
              memo: z.string().optional()
          })).optional()
      })).optional().describe("Customer locations"),
      contacts: z.array(z.object({
          id: z.number().int().optional(),
          type: z.string().optional(),
          value: z.string().optional(),
          memo: z.string().optional()
      })).optional().describe("Customer contacts")
  },
  async ({ tenant, name, type, address, customFields, balance, tagTypeIds, doNotMail, doNotService, externalData, locations, contacts }) => {
      try {
          const endpoint = `/tenant/${tenant}/customers`;
          const payload = {
              name: name,
              type: type,
              address: address,
              customFields: customFields,
              balance: balance,
              tagTypeIds: tagTypeIds,
              doNotMail: doNotMail,
              doNotService: doNotService,
              externalData: externalData,
              locations: locations,
              contacts: contacts
          };
  
          const response = await api.post(endpoint, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Customers Delete Note
  server.tool(
      "customers_delete_note",
      {
          id: z.number().int().describe("Format - int64."),
          noteId: z.number().int().describe("Format - int64."),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
      },
      async ({ id, noteId, tenant }) => {
          try {
              const endpoint = `/tenant/${tenant}/customers/${id}/notes/${noteId}`;
              await api.delete(endpoint);
  
              return {
                  content: [{ type: "text", text: "Note deleted successfully." }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Customers GetContactList
  server.tool("customers_get_contact_list",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned")
  },
  async ({ id, tenant, page, pageSize, includeTotal }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/customers/${id}/contacts`, {
          params: { page, pageSize, includeTotal }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Customers_DeleteContact
  server.tool("customers_delete_contact",
  {
      id: z.number().int().describe("Format - int64."),
      contactId: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, contactId, tenant }) => {
      try {
      const response = await api.delete(`/tenant/${tenant}/customers/${id}/contacts/${contactId}`);
      return {
          content: [{ type: "text", text: "Contact deleted successfully." }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Customers CreateContact
  server.tool("customers_createcontact",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      type: z.string().optional().describe("Contact Type"),
      value: z.string().optional().describe("Contact Value"),
      memo: z.string().optional().describe("Contact Memo"),
      phoneSettings: z.object({
          phoneNumber: z.string().optional().describe("Phone Number"),
          doNotText: z.boolean().optional().describe("Do Not Text")
      }).optional().describe("Phone Settings")
  },
  async ({ id, tenant, type, value, memo, phoneSettings }) => {
      try {
          const response = await api.post(`/tenant/${tenant}/customers/${id}/contacts`, {
              type: type,
              value: value,
              memo: memo,
              phoneSettings: phoneSettings ? {
                  phoneNumber: phoneSettings.phoneNumber,
                  doNotText: phoneSettings.doNotText
              } : undefined
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Customers CreateTag
  server.tool("customers_create_tag",
  {
      id: z.number().int().describe("Format - int64."),
      tagTypeId: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tagTypeId, tenant }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/customers/${id}/tags/${tagTypeId}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  server.tool("customers_get_modified_contacts_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC). Either modifiedBefore or modifiedOnOrAfter parameter must be specified"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on/after certain date/time (in UTC). Either modifiedBefore or modifiedOnOrAfter parameter must be specified"),
      customerIds: z.string().optional().describe("Returns specific contact records by customer IDs."),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns items created before the requested date (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns items created on or after the requested date (in UTC)")
  },
  async ({ tenant, page, pageSize, includeTotal, modifiedBefore, modifiedOnOrAfter, customerIds, createdBefore, createdOnOrAfter }) => {
      try {
          let endpoint = `/tenant/${tenant}/customers/contacts`;
          const params = {
              page: page,
              pageSize: pageSize,
              includeTotal: includeTotal,
              modifiedBefore: modifiedBefore,
              modifiedOnOrAfter: modifiedOnOrAfter,
              customerIds: customerIds,
              createdBefore: createdBefore,
              createdOnOrAfter: createdOnOrAfter
          };
  
          const response = await api.get(endpoint, { params: params });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Customers Delete Tag
  server.tool(
  "customers_delete_tag",
  {
      id: z.number().int().describe("Format - int64."),
      tagTypeId: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tagTypeId, tenant }) => {
      try {
          await api.delete(`/tenant/${tenant}/customers/${id}/tags/${tagTypeId}`);
          return {
              content: [{ type: "text", text: "Tag deleted successfully." }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Customers Get Custom Field Types
  server.tool("customers_get_custom_field_types",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      sort: z.string().optional(),
  },
  async ({ tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/customers/custom-fields`, {
              params: { page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: ExportBookings_Get
  server.tool("export_bookings_get",
  {
      tenant: z.number().int().describe("Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token or date string"),
      includeRecentChanges: z.boolean().nullable().optional().describe("Include recent changes")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/export/bookings`, {
              params: { from, includeRecentChanges }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: ExportContacts_CustomersContacts
  server.tool("export_contacts_customers_contacts",
  {
      tenant: z.number().int().describe("Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token or date string"),
      includeRecentChanges: z.boolean().nullable().optional().describe("Include recent changes")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
          let endpoint = `/tenant/${tenant}/export/customers/contacts`;
          const params: { [key: string]: any } = {};
          if (from !== undefined) {
              params.from = from;
          }
          if (includeRecentChanges !== undefined) {
              params.includeRecentChanges = includeRecentChanges;
          }
  
          const response = await api.get(endpoint, { params: params });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: ExportContacts_LocationsContacts
  server.tool(
      "exportcontacts_locationscontacts",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
          includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
      },
      async ({ tenant, from, includeRecentChanges }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/export/locations/contacts`, {
                  params: { from, includeRecentChanges }
              });
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  
  // Tool: ExportCustomers_GetCustomers
  server.tool("export_customers_get_customers",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/export/customers`, {
              params: { from, includeRecentChanges }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: export_leads_leads
  server.tool("export_leads_leads",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/export/leads`, {
          params: { from, includeRecentChanges }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Leads Get
  server.tool("leads_get",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/leads/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: ExportLocations_Locations
  server.tool("export_locations_locations",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/export/locations`, {
          params: { from, includeRecentChanges }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Leads Update
  server.tool("leads_update",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      body: z.object({}).passthrough().optional().describe("The request body."),
  },
  async ({ id, tenant, body }) => {
      try {
      const response = await api.patch(`/tenant/${tenant}/leads/${id}`, body);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Leads Create
  server.tool("leads_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      body: z.object({}).passthrough().describe("Request Body")
  },
  async ({ tenant, body }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/leads`, body);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Leads CreateFollowUp
  server.tool("leads_create_follow_up",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      followUpDate: z.string().describe("Follow up date"),
      text: z.string().describe("Follow up text"),
      pinToTop: z.boolean().describe("Pin to top")
  },
  async ({ id, tenant, followUpDate, text, pinToTop }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/leads/${id}/follow-up`, {
          followUpDate,
          text,
          pinToTop
      });
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Leads_CreateNote
  server.tool(
      "leads_create_note",
      {
          id: z.number().int().describe("Format - int64."),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          text: z.string().describe("Note text"),
          isPinned: z.boolean().optional().describe("Whether the note is pinned")
      },
      async ({ id, tenant, text, isPinned }) => {
          try {
              const response = await api.post(`/tenant/${tenant}/leads/${id}/notes`, {
                  text: text,
                  isPinned: isPinned
              });
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Leads GetNotes
  server.tool("leads_getnotes",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns notes created before the requested date (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns notes created on or after the requested date (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns notes modified before the requested date (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns notes modified after the requested date (in UTC)")
  },
  async ({ id, tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter }) => {
      try {
          const endpoint = `/tenant/${tenant}/leads/${id}/notes`;
          const response = await api.get(endpoint, {
              params: {
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  createdBefore: createdBefore,
                  createdOnOrAfter: createdOnOrAfter,
                  modifiedBefore: modifiedBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  
  const LeadsGetListParamsSchema = z.object({
    tenant: z.number().int().describe("Format - int64. Tenant ID"),
    page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
    pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
    includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
    ids: z.string().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
    createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
    createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
    modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
    modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
    customerId: z.number().int().optional().describe("Format - int64. Filters by associated customer"),
    isProspect: z.boolean().optional().describe("Allows to filter leads where the customer doesn't have a job, or there is no customer.\nPossible values are:\nnull (return all leads);\ntrue (return leads without customer/jobs);\nfalse (return leads with customer and job)"),
    withoutCustomer: z.boolean().optional().describe("Allows to filter leads that don't have a customer or location record associated to it.\nPossible values are:\nnull (return all leads);\ntrue (return leads without customers or locations only);\nfalse (return leads with customers and locations only)"),
    status: z.string().optional().describe("Filters by status\nValues: [Open, Dismissed, Converted]"),
    customerCity: z.string().optional().describe("Filters by customer city"),
    customerState: z.string().optional().describe("Filters by customer state"),
    customerZip: z.string().optional().describe("Filters by customer zip"),
    customerCreatedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns customers who were created on or before a certain date/time (in UTC)"),
    customerCreatedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns customers who were created after a certain date/time (in UTC)"),
    customerModifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns customers who were modified on or before a certain date/time (in UTC)"),
    sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn."),
    genPermUrl: z.boolean().optional().describe("If true, generates a permanent URL for the lead"),
  });
  
  server.tool("Leads_GetList",
    {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      ids: z.string().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      customerId: z.number().int().optional().describe("Format - int64. Filters by associated customer"),
      isProspect: z.boolean().optional().describe("Allows to filter leads where the customer doesn't have a job, or there is no customer.\nPossible values are:\nnull (return all leads);\ntrue (return leads without customer/jobs);\nfalse (return leads with customer and job)"),
      withoutCustomer: z.boolean().optional().describe("Allows to filter leads that don't have a customer or location record associated to it.\nPossible values are:\nnull (return all leads);\ntrue (return leads without customers or locations only);\nfalse (return leads with customers and locations only)"),
      status: z.string().optional().describe("Filters by status\nValues: [Open, Dismissed, Converted]"),
      customerCity: z.string().optional().describe("Filters by customer city"),
      customerState: z.string().optional().describe("Filters by customer state"),
      customerZip: z.string().optional().describe("Filters by customer zip"),
      customerCreatedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns customers who were created on or before a certain date/time (in UTC)"),
      customerCreatedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns customers who were created after a certain date/time (in UTC)"),
      customerModifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns customers who were modified on or before a certain date/time (in UTC)"),
      sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn."),
      genPermUrl: z.boolean().optional().describe("If true, generates a permanent URL for the lead"),
    },
    async (input) => {
      const { tenant, page, pageSize, includeTotal, ids, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, customerId, isProspect, withoutCustomer, status, customerCity, customerState, customerZip, customerCreatedOnOrAfter, customerCreatedBefore, customerModifiedOnOrAfter, sort, genPermUrl } = input;
      try {
        const response = await api.get(`/tenant/${tenant}/leads`, {
          params: {
            page,
            pageSize,
            includeTotal,
            ids,
            createdBefore,
            createdOnOrAfter,
            modifiedBefore,
            modifiedOnOrAfter,
            customerId,
            isProspect,
            withoutCustomer,
            status,
            customerCity,
            customerState,
            customerZip,
            customerCreatedOnOrAfter,
            customerCreatedBefore,
            customerModifiedOnOrAfter,
            sort,
            genPermUrl
          }
        });
        return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
        };
      }
    }
  );
  // Tool: Leads Dismiss
  server.tool("leads_dismiss",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/leads/${id}/dismiss`);
      return {
          content: [{ type: "text", text: "Lead dismissed successfully." }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Leads SubmitLeadForm
  server.tool("leads_submitLeadForm",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      id: z.number().int().optional().describe("Format - int64.")
  },
  async ({ tenant, id }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/leads/form`, {}, {
          params: { id }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Locations Get
  server.tool(
      "locations_get",
      {
          id: z.number().int().describe("Format - int64."),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
      },
      async ({ id, tenant }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/locations/${id}`);
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Locations_Update
  server.tool("locations_update",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      body: z.object({
          id: z.number().int().optional(),
          customerId: z.number().int().optional(),
          active: z.boolean().optional(),
          name: z.string().optional(),
          address: z.object({
              street: z.string().optional(),
              unit: z.string().optional(),
              city: z.string().optional(),
              state: z.string().optional(),
              zip: z.string().optional(),
              country: z.string().optional(),
              latitude: z.number().optional(),
              longitude: z.number().optional()
          }).optional(),
          customFields: z.array(z.object({
              typeId: z.number().int().optional(),
              name: z.string().optional(),
              value: z.string().optional()
          })).optional(),
          createdOn: z.string().optional(),
          createdById: z.number().int().optional(),
          modifiedOn: z.string().optional(),
          mergedToId: z.number().int().optional(),
          zoneId: z.number().int().optional(),
          tagTypeIds: z.array(z.number().int()).optional(),
          externalData: z.array(z.object({
              key: z.string().optional(),
              value: z.string().optional()
          })).optional(),
          taxZoneId: z.number().int().optional()
      }).optional()
  },
  async ({ id, tenant, body }) => {
      try {
          const response = await api.patch(`/tenant/${tenant}/locations/${id}`, body);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Locations Create
  server.tool("locations_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      taxZoneId: z.number().int().optional().describe("Tax Zone ID"),
      customerId: z.number().int().optional().describe("Customer ID"),
      active: z.boolean().optional().default(true).describe("Location Active"),
      name: z.string().optional().describe("Location Name"),
      address: z.object({
          street: z.string().optional().describe("Street Address"),
          unit: z.string().optional().describe("Unit Number"),
          city: z.string().optional().describe("City"),
          state: z.string().optional().describe("State"),
          zip: z.string().optional().describe("Zip Code"),
          country: z.string().optional().describe("Country"),
          latitude: z.number().optional().describe("Latitude"),
          longitude: z.number().optional().describe("Longitude"),
      }).optional().describe("Address Details"),
      customFields: z.array(z.object({
          typeId: z.number().int().optional().describe("Custom Field Type ID"),
          name: z.string().optional().describe("Custom Field Name"),
          value: z.string().optional().describe("Custom Field Value"),
      })).optional().describe("Custom Fields"),
      zoneId: z.number().int().optional().describe("Zone ID"),
      tagTypeIds: z.array(z.number().int()).optional().describe("Tag Type IDs"),
      externalData: z.array(z.object({
          key: z.string().optional().describe("External Data Key"),
          value: z.string().optional().describe("External Data Value"),
      })).optional().describe("External Data"),
      contacts: z.array(z.object({
          id: z.number().int().optional().describe("Contact ID"),
          type: z.any().optional().describe("Contact Type - any object"), // type is an object we do not know details for, so we will have agent fill in info
          value: z.string().optional().describe("Contact Value"),
          memo: z.string().optional().describe("Contact Memo"),
      })).optional().describe("Contacts"),
  },
  async ({ tenant, taxZoneId, customerId, active, name, address, customFields, zoneId, tagTypeIds, externalData, contacts }) => {
      try {
          const payload = {
              taxZoneId,
              customerId,
              active,
              name,
              address,
              customFields,
              zoneId,
              tagTypeIds,
              externalData,
              contacts
          };
  
          const response = await api.post(`/tenant/${tenant}/locations`, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: locations_get_list
  server.tool(
  "locations_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      name: z.string().nullable().optional().describe("Filters by customer's name"),
      customerId: z.number().int().nullable().optional().describe("Format - int64. Filters by customer ID"),
      street: z.string().nullable().optional().describe("Filters by customer's street"),
      unit: z.string().nullable().optional().describe("Filters by customer's unit"),
      city: z.string().nullable().optional().describe("Filters by customer's city"),
      state: z.string().nullable().optional().describe("Filters by customer's state"),
      zip: z.string().nullable().optional().describe("Filters by customer's zip"),
      country: z.string().nullable().optional().describe("Filters by customer's country"),
      latitude: z.number().nullable().optional().describe("Format - double. Filters by customer's latitude"),
      longitude: z.number().nullable().optional().describe("Format - double. Filters by customer's longitude"),
      active: z.string().nullable().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn."),
      createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      externalDataApplicationGuid: z.string().uuid().nullable().optional().describe("Format - guid. Returns location records with external data for a particular GUID"),
      externalDataKey: z.string().nullable().optional().describe("Performs lookup by external data key, 'externalDataValues' must also be provided."),
      externalDataValues: z.string().nullable().optional().describe("Performs lookup by external data values (maximum 50), 'externalDataKey' must also be provided.")
  },
  async ({ tenant, ids, name, customerId, street, unit, city, state, zip, country, latitude, longitude, active, page, pageSize, includeTotal, sort, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, externalDataApplicationGuid, externalDataKey, externalDataValues }) => {
      try {
          const endpoint = `/tenant/${tenant}/locations`;
          const response = await api.get(endpoint, {
              params: {
                  ids: ids,
                  name: name,
                  customerId: customerId,
                  street: street,
                  unit: unit,
                  city: city,
                  state: state,
                  zip: zip,
                  country: country,
                  latitude: latitude,
                  longitude: longitude,
                  active: active,
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  sort: sort,
                  createdBefore: createdBefore,
                  createdOnOrAfter: createdOnOrAfter,
                  modifiedBefore: modifiedBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter,
                  externalDataApplicationGuid: externalDataApplicationGuid,
                  externalDataKey: externalDataKey,
                  externalDataValues: externalDataValues
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Locations GetNotes
  server.tool("locations_getnotes",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns notes created before the requested date (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns notes created on or after the requested date (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns notes modified before the requested date (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns notes modified after the requested date (in UTC)")
  },
  async ({ id, tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/locations/${id}/notes`, {
              params: { page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Locations_CreateNote
  server.tool(
      "locations_create_note",
      {
          id: z.number().int().describe("Format - int64."),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          text: z.string().describe("The text of the note."),
          isPinned: z.boolean().optional().describe("Whether the note should be pinned. Defaults to false."),
      },
      async ({ id, tenant, text, isPinned }) => {
          try {
              const response = await api.post(`/tenant/${tenant}/locations/${id}/notes`, {
                  text: text,
                  isPinned: isPinned ?? false,
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Locations DeleteNote
  server.tool("locations_delete_note",
  {
      id: z.number().int().describe("Format - int64."),
      noteId: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, noteId, tenant }) => {
      try {
          const endpoint = `/tenant/${tenant}/locations/${id}/notes/${noteId}`;
          await api.delete(endpoint);
  
          return {
              content: [{ type: "text", text: "Note deleted successfully" }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: locations_get_contact_list
  server.tool(
      "locations_get_contact_list",
      {
          id: z.number().int().describe("Format - int64."),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
          pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
          includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      },
      async ({ id, tenant, page, pageSize, includeTotal }) => {
          try {
              const endpoint = `/tenant/${tenant}/locations/${id}/contacts`;
              const response = await api.get(endpoint, {
                  params: {
                      page: page,
                      pageSize: pageSize,
                      includeTotal: includeTotal,
                  },
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Locations_CreateContact
  server.tool(
  "locations_createcontact",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      type: z.string().describe("Contact type"),
      value: z.string().describe("Contact value"),
      memo: z.string().optional().describe("Contact memo"),
      phoneNumber: z.string().optional().describe("Phone number for phone settings"),
      doNotText: z.boolean().optional().describe("Do not text flag for phone settings"),
  },
  async ({ id, tenant, type, value, memo, phoneNumber, doNotText }) => {
      try {
      const endpoint = `/tenant/${tenant}/locations/${id}/contacts`;
      const payload = {
          type: type,
          value: value,
          memo: memo,
          phoneSettings: {
              phoneNumber: phoneNumber,
              doNotText: doNotText
          }
      };
  
      const response = await api.post(endpoint, payload);
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Locations Delete Contact
  server.tool("locations_delete_contact",
  {
      id: z.number().int().describe("Format - int64."),
      contactId: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, contactId, tenant }) => {
      try {
      const response = await api.delete(`/tenant/${tenant}/locations/${id}/contacts/${contactId}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Locations_UpdateContact
  server.tool("locations_update_contact",
  {
      id: z.number().int().describe("Format - int64. Location ID"),
      contactId: z.number().int().describe("Format - int64. Contact ID"),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      value: z.string().optional().describe("Contact value"),
      memo: z.string().optional().describe("Contact memo"),
      phoneNumber: z.string().optional().describe("Phone number for the contact"),
      doNotText: z.boolean().optional().describe("Do not text flag for the contact")
  },
  async ({ id, contactId, tenant, value, memo, phoneNumber, doNotText }) => {
      try {
          const endpoint = `/tenant/${tenant}/locations/${id}/contacts/${contactId}`;
          const payload = {
              value: value,
              memo: memo,
              phoneSettings: {
                  phoneNumber: phoneNumber,
                  doNotText: doNotText
              }
          };
  
          const response = await api.patch(endpoint, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Locations GetLocationsContactsList
  server.tool("locations_getlocationscontactslist",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32."),
      pageSize: z.number().int().optional().describe("Format - int32."),
      includeTotal: z.boolean().optional(),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC). Either modifiedBefore or modifiedOnOrAfter parameter must be specified"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on/after certain date/time (in UTC). Either modifiedBefore or modifiedOnOrAfter parameter must be specified"),
      locationIds: z.string().optional().describe("Returns specific contact records by location IDs."),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns items created before the requested date (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns items created on or after the requested date (in UTC)")
  },
  async ({ tenant, page, pageSize, includeTotal, modifiedBefore, modifiedOnOrAfter, locationIds, createdBefore, createdOnOrAfter }) => {
      try {
      let endpoint = `/tenant/${tenant}/locations/contacts`;
      const params: Record<string, any> = {};
      if (page !== undefined) {
          params.page = page;
      }
      if (pageSize !== undefined) {
          params.pageSize = pageSize;
      }
      if (includeTotal !== undefined) {
          params.includeTotal = includeTotal;
      }
      if (modifiedBefore !== undefined) {
          params.modifiedBefore = modifiedBefore;
      }
      if (modifiedOnOrAfter !== undefined) {
          params.modifiedOnOrAfter = modifiedOnOrAfter;
      }
      if (locationIds !== undefined) {
          params.locationIds = locationIds;
      }
      if (createdBefore !== undefined) {
          params.createdBefore = createdBefore;
      }
      if (createdOnOrAfter !== undefined) {
          params.createdOnOrAfter = createdOnOrAfter;
      }
  
      const response = await api.get(endpoint, { params: params });
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Locations CreateTag
  server.tool("locations_create_tag",
  {
      id: z.number().int().describe("Format - int64."),
      tagTypeId: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tagTypeId, tenant }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/locations/${id}/tags/${tagTypeId}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Locations Delete Tag
  server.tool("locations_delete_tag",
  {
      id: z.number().int().describe("Format - int64."),
      tagTypeId: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tagTypeId, tenant }) => {
      try {
          const endpoint = `/tenant/${tenant}/locations/${id}/tags/${tagTypeId}`;
          await api.delete(endpoint);
  
          return {
              content: [{ type: "text", text: "Tag deleted successfully." }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: locations_get_custom_field_types
  server.tool("locations_get_custom_field_types",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      sort: z.string().optional()
  },
  async ({ tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
      try {
          const endpoint = `/tenant/${tenant}/locations/custom-fields`;
          const response = await api.get(endpoint, {
              params: {
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  createdBefore: createdBefore,
                  createdOnOrAfter: createdOnOrAfter,
                  modifiedBefore: modifiedBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter,
                  sort: sort
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );


// Tool: TechnicianRating_Update
server.tool("technician_rating_update",
  {
      tenant: z.number().int().describe("Tenant ID (int64)"),
      technicianId: z.number().int().describe("Technician ID (int64)"),
      jobId: z.number().int().describe("Job ID (int64)")
  },
  async ({ tenant, technicianId, jobId }) => {
      try {
      const endpoint = `/tenant/${tenant}/technician-rating/technician/${technicianId}/job/${jobId}`;
      await api.put(endpoint);
  
      return {
          content: [{ type: "text", text: "Technician rating updated successfully." }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );


// Tool: Gps Create
server.tool("gps_create",
  {
      tenant: z.number().int().describe("Tenant ID"),
      gps_provider: z.string().describe("The GPS Provider"),
      body: z.object({}).passthrough().describe("Request body for creating GPS data.")
  },
  async ({ tenant, gps_provider, body }) => {
      try {
          const response = await api.post(`/tenant/${tenant}/gps-provider/${gps_provider}/gps-pings`,
              body
          );
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: AppointmentAssignments_AssignTechnicians
  server.tool(
      "AppointmentAssignments_AssignTechnicians",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
      },
      async ({ tenant }) => {
          try {
              const response = await api.post(`/tenant/${tenant}/appointment-assignments/assign-technicians`);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: AppointmentAssignments_UnassignTechnicians
  server.tool(
      "appointment_assignments_unassign_technicians",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID")
      },
      async ({ tenant }) => {
          try {
              const response = await api.post(`/tenant/${tenant}/appointment-assignments/unassign-technicians`);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  server.tool("appointment_assignments_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      appointmentIds: z.string().optional().describe("Return appointment assignments for one or more appointments"),
      jobId: z.number().int().optional().describe("Format - int64. Return appointment assignments for a single job"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, CreatedOn, ModifiedOn."),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]")
  },
  async ({ tenant, ids, appointmentIds, jobId, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort, active }) => {
      try {
          let endpoint = `/tenant/${tenant}/appointment-assignments`;
          const params: Record<string, any> = {};
  
          if (ids) {
              params.ids = ids;
          }
          if (appointmentIds) {
              params.appointmentIds = appointmentIds;
          }
          if (jobId) {
              params.jobId = jobId;
          }
          if (createdBefore) {
              params.createdBefore = createdBefore;
          }
          if (createdOnOrAfter) {
              params.createdOnOrAfter = createdOnOrAfter;
          }
          if (modifiedBefore) {
              params.modifiedBefore = modifiedBefore;
          }
          if (modifiedOnOrAfter) {
              params.modifiedOnOrAfter = modifiedOnOrAfter;
          }
          if (page) {
              params.page = page;
          }
          if (pageSize) {
              params.pageSize = pageSize;
          }
          if (includeTotal) {
              params.includeTotal = includeTotal;
          }
          if (sort) {
              params.sort = sort;
          }
          if (active) {
              params.active = active;
          }
  
          const response = await api.get(endpoint, { params: params });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: ArrivalWindows_Create
  server.tool("arrival_windows_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      start: z.string().describe("Start time"),
      duration: z.string().describe("Duration"),
      businessUnitIds: z.array(z.number().int()).describe("Business Unit IDs"),
      active: z.boolean().describe("Active status")
  },
  async ({ tenant, start, duration, businessUnitIds, active }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/arrival-windows`, {
          start,
          duration,
          businessUnitIds,
          active
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: ArrivalWindows_Get
  server.tool("ArrivalWindows_Get",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/arrival-windows/${id}`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: arrival_windows_get_list
  server.tool("arrival_windows_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      active: z.enum(["True", "Any", "False"]).optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]")
  },
  async ({ tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, active }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/arrival-windows`, {
              params: {
                  page,
                  pageSize,
                  includeTotal,
                  createdBefore,
                  createdOnOrAfter,
                  active
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: ArrivalWindows Activated
  server.tool(
  "ArrivalWindows_Activated",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
  },
  async ({ id, tenant }) => {
      try {
          const response = await api.put(`/tenant/${tenant}/arrival-windows/${id}/activated`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }],
          };
      }
  }
  );
  // Tool: ArrivalWindows GetConfiguration
  server.tool(
      "arrival_windows_get_configuration",
      {
          tenant: z.number().int().describe("Tenant ID"),
      },
      async ({ tenant }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/arrival-windows/configuration`);
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: ArrivalWindows_Update
  server.tool("arrival_windows_update",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      start: z.string().optional(),
      duration: z.string().optional(),
      businessUnitIds: z.array(z.number().int()).optional(),
      active: z.boolean().optional()
  },
  async ({ id, tenant, start, duration, businessUnitIds, active }) => {
      try {
          const response = await api.put(`/tenant/${tenant}/arrival-windows/${id}`, {
              start: start,
              duration: duration,
              businessUnitIds: businessUnitIds,
              active: active
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: BusinessHour GetList
  server.tool("business_hour_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/business-hours`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Arrival Windows Updated Configuration
  server.tool("arrival_windows_updated_configuration",
  {
      tenant: z.number().int().describe("Tenant ID"),
      body: z.record(z.any()).describe("Request Body")
  },
  async ({ tenant, body }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/arrival-windows/configuration`,
          JSON.stringify(body)
      );
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: BusinessHour_Create
  server.tool(
      "BusinessHour_Create",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          weekdays: z.array(z.object({ fromHour: z.number().int(), toHour: z.number().int() })).optional(),
          saturday: z.array(z.object({ fromHour: z.number().int(), toHour: z.number().int() })).optional(),
          sunday: z.array(z.object({ fromHour: z.number().int(), toHour: z.number().int() })).optional()
      },
      async ({ tenant, weekdays, saturday, sunday }) => {
          try {
              const payload = {
                  weekdays: weekdays || [],
                  saturday: saturday || [],
                  sunday: sunday || []
              };
              const response = await api.post(`/tenant/${tenant}/business-hours`, payload);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Capacity GetList
  server.tool("capacity_getlist",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ tenant }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/capacity`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: NonJobAppointments_Get
  server.tool(
    "NonJobAppointments_Get",
    {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
    },
    async ({ id, tenant }) => {
      try {
        const response = await api.get(`/tenant/${tenant}/non-job-appointments/${id}`);
        return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
        };
      }
    }
  );
  // Tool: Export Appointment Assignments
  server.tool(
      "export_appointment_assignments",
      {
          tenant: z.number().int().describe("Tenant ID"),
          active: z.enum(["True", "Any", "False"]).optional().describe("What kind of items should be returned (only active items will be returned by default)"),
          from: z.string().optional().describe("Continuation token or custom date string"),
          includeRecentChanges: z.boolean().optional().describe("Use \"true\" to start receiving the most recent changes quicker.")
      },
      async ({ tenant, active, from, includeRecentChanges }) => {
          try {
              let endpoint = `/tenant/${tenant}/export/appointment-assignments`;
              const params: { [key: string]: any } = {};
  
              if (active) {
                  params.active = active;
              }
              if (from) {
                  params.from = from;
              }
              if (includeRecentChanges !== undefined) {
                  params.includeRecentChanges = includeRecentChanges;
              }
  
              const response = await api.get(endpoint, { params: params });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: NonJobAppointments_Delete
  server.tool(
      "non_job_appointments_delete",
      {
          id: z.number().int().describe("The non-job appointment ID (int64)."),
          tenant: z.number().int().describe("The tenant ID (int64)."),
      },
      async ({ id, tenant }) => {
          try {
              const endpoint = `/tenant/${tenant}/non-job-appointments/${id}`;
              const response = await api.delete(endpoint);
  
              if (response.status === 200) {
                  return {
                      content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
                  };
              } else if (response.status === 404) {
                  return {
                      content: [{ type: "text", text: "Error: Non-job appointment not found." }],
                  };
              } else if (response.status === 400) {
                  return {
                      content: [{ type: "text", text: `Error: Bad Request - ${String(JSON.stringify(response.data))}` }],
                  };
              }
              else {
                  return {
                      content: [{ type: "text", text: `Error: Unexpected status code ${response.status}` }],
                  };
              }
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: NonJobAppointments_Update
  server.tool(
  "NonJobAppointments_Update",
  {
      tenant: z.number().int().describe("Tenant ID"),
      id: z.number().int().describe("Non-Job Appointment ID"),
      technicianId: z.number().int().optional().describe("Technician ID"),
      start: z.string().optional().describe("Appointment start time"),
      name: z.string().optional().describe("Appointment name"),
      duration: z.string().optional().describe("Appointment duration"),
      timesheetCodeId: z.number().int().optional().describe("Timesheet code ID"),
      summary: z.string().optional().describe("Appointment summary"),
      clearDispatchBoard: z.boolean().optional().describe("Clear dispatch board flag"),
      clearTechnicianView: z.boolean().optional().describe("Clear technician view flag"),
      removeTechnicianFromCapacityPlanning: z.boolean().optional().describe("Remove technician from capacity planning flag"),
      allDay: z.boolean().optional().describe("All-day appointment flag"),
      showOnTechnicianSchedule: z.boolean().optional().describe("Show on technician schedule flag"),
      active: z.boolean().optional().describe("Active appointment flag")
  },
  async ({ tenant, id, technicianId, start, name, duration, timesheetCodeId, summary, clearDispatchBoard, clearTechnicianView, removeTechnicianFromCapacityPlanning, allDay, showOnTechnicianSchedule, active }) => {
      try {
          const payload = {
              technicianId,
              start,
              name,
              duration,
              timesheetCodeId,
              summary,
              clearDispatchBoard,
              clearTechnicianView,
              removeTechnicianFromCapacityPlanning,
              allDay,
              showOnTechnicianSchedule,
              active
          };
  
          const response = await api.put(`/tenant/${tenant}/non-job-appointments/${id}`, payload, {
              params: {}
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Non Job Appointments Get List
  server.tool("non_job_appointments_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      technicianId: z.number().int().optional().nullable().describe("Format - int64. Unique id of the technician this non-job appointment applies to"),
      startsOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). When the Start of non-job appointment should be at or after"),
      startsOnOrBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). When the Start of non-job appointment should be at or before"),
      timesheetCodeId: z.number().int().optional().nullable().describe("Format - int64. Unique Id of timesheet code must apply to"),
      activeOnly: z.boolean().optional().nullable().describe("Whether the result should contains only active non-job appointments"),
      showOnTechnicianSchedule: z.boolean().optional().nullable().describe("Whether the non-job appointment shows on the technicians schedule even if there is no timesheet"),
      createdOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      createdBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      ids: z.string().optional().nullable().describe("Perform lookup by multiple IDs (maximum 50)"),
      page: z.number().int().optional().nullable().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().nullable().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().nullable().describe("Whether total count should be returned"),
      sort: z.string().optional().nullable().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, CreatedOn, ModifiedOn.")
  },
  async ({ tenant, technicianId, startsOnOrAfter, startsOnOrBefore, timesheetCodeId, activeOnly, showOnTechnicianSchedule, createdOnOrAfter, createdBefore, modifiedOnOrAfter, modifiedBefore, ids, page, pageSize, includeTotal, sort }) => {
      try {
      const endpoint = `/tenant/${tenant}/non-job-appointments`;
      const response = await api.get(endpoint, {
          params: {
          technicianId: technicianId || undefined,
          startsOnOrAfter: startsOnOrAfter || undefined,
          startsOnOrBefore: startsOnOrBefore || undefined,
          timesheetCodeId: timesheetCodeId || undefined,
          activeOnly: activeOnly || undefined,
          showOnTechnicianSchedule: showOnTechnicianSchedule || undefined,
          createdOnOrAfter: createdOnOrAfter || undefined,
          createdBefore: createdBefore || undefined,
          modifiedOnOrAfter: modifiedOnOrAfter || undefined,
          modifiedBefore: modifiedBefore || undefined,
          ids: ids || undefined,
          page: page || undefined,
          pageSize: pageSize || undefined,
          includeTotal: includeTotal || undefined,
          sort: sort || undefined
          },
      });
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Team_GetList
  server.tool("team_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      includeInactive: z.boolean().optional().describe("Whether to include inactive teams"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, CreatedOn, ModifiedOn.")
  },
  async ({ tenant, page, pageSize, includeTotal, includeInactive, createdOnOrAfter, createdBefore, modifiedOnOrAfter, modifiedBefore, sort }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/teams`, {
              params: {
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  includeInactive: includeInactive,
                  createdOnOrAfter: createdOnOrAfter,
                  createdBefore: createdBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter,
                  modifiedBefore: modifiedBefore,
                  sort: sort
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: NonJobAppointments Create
  server.tool(
  "NonJobAppointments_Create",
  {
      tenant: z.number().int().describe("Tenant ID"),
      technicianId: z.number().int().describe("Technician ID"),
      start: z.string().describe("Start date/time"),
      name: z.string().describe("Appointment name"),
      duration: z.string().describe("Appointment duration"),
      timesheetCodeId: z.number().int().describe("Timesheet code ID"),
      summary: z.string().optional().describe("Appointment summary"),
      clearDispatchBoard: z.boolean().optional().default(true).describe("Clear dispatch board"),
      clearTechnicianView: z.boolean().optional().default(true).describe("Clear technician view"),
      removeTechnicianFromCapacityPlanning: z.boolean().optional().default(true).describe("Remove technician from capacity planning"),
      allDay: z.boolean().optional().default(true).describe("All day appointment"),
      showOnTechnicianSchedule: z.boolean().optional().default(true).describe("Show on technician schedule"),
      active: z.boolean().optional().default(true).describe("Active appointment"),
      repeat: z.boolean().optional().default(false).describe("Repeat appointment"),
      countOccurrences: z.number().int().optional().default(0).describe("Count occurrences"),
      interval: z.number().int().optional().default(0).describe("Interval"),
      frequency: z.string().optional().describe("Frequency (e.g., daily, weekly)"),
      endType: z.string().optional().describe("End type (e.g., on, after)"),
      endOn: z.string().optional().describe("End date"),
      daysOfWeek: z.string().optional().describe("Days of week (e.g., Mon,Tue)")
  },
  async ({ tenant, technicianId, start, name, duration, timesheetCodeId, summary, clearDispatchBoard, clearTechnicianView, removeTechnicianFromCapacityPlanning, allDay, showOnTechnicianSchedule, active, repeat, countOccurrences, interval, frequency, endType, endOn, daysOfWeek }) => {
      try {
          const payload = {
              technicianId: technicianId,
              start: start,
              name: name,
              duration: duration,
              timesheetCodeId: timesheetCodeId,
              summary: summary,
              clearDispatchBoard: clearDispatchBoard,
              clearTechnicianView: clearTechnicianView,
              removeTechnicianFromCapacityPlanning: removeTechnicianFromCapacityPlanning,
              allDay: allDay,
              showOnTechnicianSchedule: showOnTechnicianSchedule,
              active: active,
              repeat: repeat,
              countOccurrences: countOccurrences,
              interval: interval,
              frequency: frequency,
              endType: endType,
              endOn: endOn,
              daysOfWeek: daysOfWeek
          };
  
          const endpoint = `/tenant/${tenant}/non-job-appointments`;
          const response = await api.post(endpoint, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Team Create
  server.tool(
  "team_create",
  {
  tenant: z.number().int().describe("Tenant ID"),
  name: z.string().describe("Team Name"),
  active: z.boolean().optional().default(true).describe("Is the team active?")
  },
  async ({ tenant, name, active }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/teams`, {
  name: name,
  active: active
  });
  return {
  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
  content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
  }
  );
  // Tool: Team_Get
  server.tool(
      "Team_Get",
      {
          id: z.number().int().describe("Format - int64."),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
      },
      async ({ id, tenant }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/teams/${id}`);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Team Delete
  server.tool("team_delete",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
          const response = await api.delete(`/tenant/${tenant}/teams/${id}`);
          return {
              content: [{ type: "text", text: "Team deleted successfully." }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: TechnicianShifts_Create
  server.tool(
      "TechnicianShifts_Create",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          technicianId: z.number().int().describe("Technician ID"),
          start: z.string().datetime().describe("Shift start time"),
          end: z.string().datetime().describe("Shift end time"),
          shiftType: z.string().optional().describe("Shift type"),
          title: z.string().optional().describe("Shift title"),
          note: z.string().optional().describe("Shift note"),
          active: z.boolean().optional().default(true).describe("Is shift active?"),
          timesheetCodeId: z.number().int().optional().describe("Timesheet code ID")
      },
      async ({ tenant, technicianId, start, end, shiftType, title, note, active, timesheetCodeId }) => {
          try {
              const response = await api.post(`/tenant/${tenant}/technician-shifts`, {
                  technicianId: technicianId,
                  start: start,
                  end: end,
                  shiftType: shiftType,
                  title: title,
                  note: note,
                  active: active,
                  timesheetCodeId: timesheetCodeId
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: TechnicianShifts Get
  server.tool("technician_shifts_get",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/technician-shifts/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  server.tool("technician_shifts_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      startsOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). When the Start of shift should be at or after"),
      endsOnOrBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). When the End of shift should be at or before"),
      shiftType: z.string().nullable().optional().describe("Value to match ShiftType to\nValues: [Normal, OnCall, TimeOff]"),
      technicianId: z.number().int().nullable().optional().describe("Format - int64. Unique Id of technician shift must apply to"),
      titleContains: z.string().nullable().optional().describe("Text that must appear in the Title"),
      noteContains: z.string().nullable().optional().describe("Text that must appear in the Note"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      active: z.string().nullable().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, CreatedOn, ModifiedOn.")
  },
  async ({ tenant, startsOnOrAfter, endsOnOrBefore, shiftType, technicianId, titleContains, noteContains, page, pageSize, includeTotal, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/technician-shifts`, {
              params: {
                  startsOnOrAfter,
                  endsOnOrBefore,
                  shiftType,
                  technicianId,
                  titleContains,
                  noteContains,
                  page,
                  pageSize,
                  includeTotal,
                  active,
                  createdBefore,
                  createdOnOrAfter,
                  modifiedBefore,
                  modifiedOnOrAfter,
                  sort
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: TechnicianShifts_Delete
  server.tool(
      "TechnicianShifts_Delete",
      {
          id: z.number().int().describe("Format - int64. The technician shift Id to delete"),
          tenant: z.number().int().describe("Format - int64. Tenant ID")
      },
      async ({ id, tenant }) => {
          try {
              const response = await api.delete(`/tenant/${tenant}/technician-shifts/${id}`);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: TechnicianShifts_Update
  server.tool("technician_shifts_update",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      shiftType: z.any().optional().describe("Shift Type"),
      title: z.string().optional().describe("Title"),
      note: z.string().optional().describe("Note"),
      active: z.boolean().optional().describe("Active"),
      technicianId: z.number().int().optional().describe("Technician ID"),
      start: z.string().optional().describe("Start Time"),
      end: z.string().optional().describe("End Time"),
      timesheetCodeId: z.number().int().optional().describe("Timesheet Code ID")
  },
  async ({ id, tenant, shiftType, title, note, active, technicianId, start, end, timesheetCodeId }) => {
      try {
      const payload = {
          shiftType: shiftType,
          title: title,
          note: note,
          active: active,
          technicianId: technicianId,
          start: start,
          end: end,
          timesheetCodeId: timesheetCodeId
      };
  
      const response = await api.patch(`/tenant/${tenant}/technician-shifts/${id}`, payload, {
          params: {}
      });
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Technician Shifts Bulk Delete
  server.tool(
      "technician_shifts_bulk_delete",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          deletedIds: z.array(z.number().int()).describe("Array of technician shift IDs to delete").optional()
      },
      async ({ tenant, deletedIds }) => {
          try {
              const response = await api.post(`/tenant/${tenant}/technician-shifts/bulk-delete`, { deletedIds });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Zone Get
  server.tool(
      "zone_get",
      {
          id: z.number().int().describe("Format - int64."),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
      },
      async ({ id, tenant }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/zones/${id}`);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Zone GetList
  server.tool("zone_getlist",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, CreatedOn, ModifiedOn.")
  },
  async ({ tenant, page, pageSize, includeTotal, createdOnOrAfter, createdBefore, modifiedOnOrAfter, modifiedBefore, active, sort }) => {
      try {
          const endpoint = `/tenant/${tenant}/zones`;
          const response = await api.get(endpoint, {
              params: {
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  createdOnOrAfter: createdOnOrAfter,
                  createdBefore: createdBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter,
                  modifiedBefore: modifiedBefore,
                  active: active,
                  sort: sort
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );


  // Tool: Export Export Installed Equipment
server.tool("export_export_installed_equipment",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/export/installed-equipment`, {
          params: { from, includeRecentChanges }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: InstalledEquipment_Get
  server.tool(
      "InstalledEquipment_Get",
      {
          id: z.number().int().describe("Format - int64."),
          tenant: z.number().int().describe("Format - int64. Tenant ID")
      },
      async ({ id, tenant }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/installed-equipment/${id}`);
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Installed Equipment Get List
  server.tool("installed_equipment_get_list",
  {
      tenant: z.number().int().describe("Tenant ID"),
      locationIds: z.string().nullable().optional().describe("Location IDs"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      createdBefore: z.string().nullable().optional().describe("Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().nullable().optional().describe("Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().nullable().optional().describe("Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().nullable().optional().describe("The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field"),
      active: z.string().nullable().optional().describe("What kind of items should be returned")
  },
  async ({ tenant, locationIds, ids, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort, active }) => {
      try {
          let params: { [key: string]: any } = {};
          if (locationIds !== null && locationIds !== undefined) {
              params.locationIds = locationIds;
          }
          if (ids !== null && ids !== undefined) {
              params.ids = ids;
          }
          if (createdBefore !== null && createdBefore !== undefined) {
              params.createdBefore = createdBefore;
          }
          if (createdOnOrAfter !== null && createdOnOrAfter !== undefined) {
              params.createdOnOrAfter = createdOnOrAfter;
          }
          if (modifiedBefore !== null && modifiedBefore !== undefined) {
              params.modifiedBefore = modifiedBefore;
          }
          if (modifiedOnOrAfter !== null && modifiedOnOrAfter !== undefined) {
              params.modifiedOnOrAfter = modifiedOnOrAfter;
          }
          if (page !== null && page !== undefined) {
              params.page = page;
          }
          if (pageSize !== null && pageSize !== undefined) {
              params.pageSize = pageSize;
          }
          if (includeTotal !== null && includeTotal !== undefined) {
              params.includeTotal = includeTotal;
          }
          if (sort !== null && sort !== undefined) {
              params.sort = sort;
          }
          if (active !== null && active !== undefined) {
              params.active = active;
          }
  
          const response = await api.get(`/tenant/${tenant}/installed-equipment`, {
              params: params
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: InstalledEquipment_Create
  server.tool(
      "installed_equipment_create",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          equipmentId: z.number().int().describe("Equipment ID"),
          locationId: z.number().int().describe("Location ID"),
          customerId: z.number().int().describe("Customer ID"),
          invoiceItemId: z.number().int().optional().describe("Invoice Item ID"),
          name: z.string().describe("Name of the installed equipment"),
          installedOn: z.string().describe("Date of installation"),
          serialNumber: z.string().optional().describe("Serial number"),
          barcodeId: z.string().optional().describe("Barcode ID"),
          memo: z.string().optional().describe("Memo"),
          manufacturer: z.string().optional().describe("Manufacturer"),
          model: z.string().optional().describe("Model"),
          cost: z.number().optional().describe("Cost"),
          manufacturerWarrantyStart: z.string().optional().describe("Manufacturer warranty start date"),
          manufacturerWarrantyEnd: z.string().optional().describe("Manufacturer warranty end date"),
          serviceProviderWarrantyStart: z.string().optional().describe("Service provider warranty start date"),
          serviceProviderWarrantyEnd: z.string().optional().describe("Service provider warranty end date"),
          actualReplacementDate: z.string().optional().describe("Actual replacement date"),
          predictedReplacementMonths: z.number().int().optional().describe("Predicted replacement months")
      },
      async ({ tenant, equipmentId, locationId, customerId, invoiceItemId, name, installedOn, serialNumber, barcodeId, memo, manufacturer, model, cost, manufacturerWarrantyStart, manufacturerWarrantyEnd, serviceProviderWarrantyStart, serviceProviderWarrantyEnd, actualReplacementDate, predictedReplacementMonths }) => {
          try {
              const response = await api.post(`/tenant/${tenant}/installed-equipment`, {
                  equipmentId: equipmentId,
                  locationId: locationId,
                  customerId: customerId,
                  invoiceItemId: invoiceItemId,
                  name: name,
                  installedOn: installedOn,
                  serialNumber: serialNumber,
                  barcodeId: barcodeId,
                  memo: memo,
                  manufacturer: manufacturer,
                  model: model,
                  cost: cost,
                  manufacturerWarrantyStart: manufacturerWarrantyStart,
                  manufacturerWarrantyEnd: manufacturerWarrantyEnd,
                  serviceProviderWarrantyStart: serviceProviderWarrantyStart,
                  serviceProviderWarrantyEnd: serviceProviderWarrantyEnd,
                  actualReplacementDate: actualReplacementDate,
                  predictedReplacementMonths: predictedReplacementMonths
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: InstalledEquipment_PostAttachment
  server.tool(
      "installed_equipment_post_attachment",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          file: z.string().describe("The file to upload (base64 encoded)")
      },
      async ({ tenant, file }) => {
          try {
              const response = await api.post(
                  `/tenant/${tenant}/installed-equipment/attachments`,
                  { file },
                  {
                      params: {}
                  }
              );
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: InstalledEquipment Update
  server.tool("installed_equipment_update",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      active: z.boolean().optional(),
      equipmentId: z.number().int().optional(),
      locationId: z.number().int().optional(),
      customerId: z.number().int().optional(),
      invoiceItemId: z.number().int().optional(),
      name: z.string().optional(),
      installedOn: z.string().optional(),
      serialNumber: z.string().optional(),
      barcodeId: z.string().optional(),
      memo: z.string().optional(),
      manufacturer: z.string().optional(),
      model: z.string().optional(),
      cost: z.number().optional(),
      manufacturerWarrantyStart: z.string().optional(),
      manufacturerWarrantyEnd: z.string().optional(),
      serviceProviderWarrantyStart: z.string().optional(),
      serviceProviderWarrantyEnd: z.string().optional(),
      actualReplacementDate: z.string().optional(),
      predictedReplacementMonths: z.number().int().optional(),
      predictedReplacementDate: z.string().optional(),
  },
  async ({ id, tenant, active, equipmentId, locationId, customerId, invoiceItemId, name, installedOn, serialNumber, barcodeId, memo, manufacturer, model, cost, manufacturerWarrantyStart, manufacturerWarrantyEnd, serviceProviderWarrantyStart, serviceProviderWarrantyEnd, actualReplacementDate, predictedReplacementMonths, predictedReplacementDate }) => {
      try {
      const response = await api.patch(`/tenant/${tenant}/installed-equipment/${id}`, {
          active,
          equipmentId,
          locationId,
          customerId,
          invoiceItemId,
          name,
          installedOn,
          serialNumber,
          barcodeId,
          memo,
          manufacturer,
          model,
          cost,
          manufacturerWarrantyStart,
          manufacturerWarrantyEnd,
          serviceProviderWarrantyStart,
          serviceProviderWarrantyEnd,
          actualReplacementDate,
          predictedReplacementMonths,
          predictedReplacementDate
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: InstalledEquipment_Get2
  server.tool(
  "installed_equipment_get2",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      path: z.string().optional().describe("The path for attachments")
  },
  async ({ tenant, path }) => {
      try {
          const endpoint = `/tenant/${tenant}/installed-equipment/attachments`;
          const response = await api.get(endpoint, {
              params: { path }
          });
  
          if (response.status === 200) {
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } else if (response.status === 302) {
              return {
                  content: [{ type: "text", text: "Redirection occurred (302 status)." }]
              };
          }
           else if (response.status === 400) {
              return {
                  content: [{ type: "text", text: "Bad Request (400 status)." }]
              };
          }
          else if (response.status === 404) {
              return {
                  content: [{ type: "text", text: "The requested entity was not found (404 status)." }]
              };
          } else {
              return {
                  content: [{ type: "text", text: `Unexpected status code: ${response.status}` }]
              };
          }
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );


  server.tool("form_getforms",
    {
        tenant: z.number().int().describe("Format - int64. Tenant ID"),
        hasConditionalLogic: z.boolean().optional().nullable().describe("Has conditional logic"),
        hasTriggers: z.boolean().optional().nullable().describe("Has triggers"),
        name: z.string().optional().nullable().describe("Name"),
        status: z.string().optional().nullable().describe("Values: [Any, Published, Unpublished]"),
        ids: z.string().optional().nullable().describe("IDs"),
        active: z.string().optional().nullable().describe("Values: [True, Any, False]"),
        createdBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339)."),
        createdOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339)."),
        modifiedBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339)."),
        modifiedOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339)."),
        page: z.number().int().optional().nullable().describe("Format - int32."),
        pageSize: z.number().int().optional().nullable().describe("Format - int32."),
        includeTotal: z.boolean().optional().nullable().describe("Include total"),
        sort: z.string().optional().nullable().describe("Sort")
    },
    async ({ tenant, hasConditionalLogic, hasTriggers, name, status, ids, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort }) => {
        try {
            const endpoint = `/tenant/${tenant}/forms`;
            const response = await api.get(endpoint, {
                params: {
                    hasConditionalLogic: hasConditionalLogic,
                    hasTriggers: hasTriggers,
                    name: name,
                    status: status,
                    ids: ids,
                    active: active,
                    createdBefore: createdBefore,
                    createdOnOrAfter: createdOnOrAfter,
                    modifiedBefore: modifiedBefore,
                    modifiedOnOrAfter: modifiedOnOrAfter,
                    page: page,
                    pageSize: pageSize,
                    includeTotal: includeTotal,
                    sort: sort
                }
            });
    
            return {
                content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Error: ${error.message}` }]
            };
        }
    }
    );
    // Tool: Jobs CreateAttachment
    server.tool("jobs_create_attachment",
    {
        id: z.number().int().describe("Format - int64. Job Id"),
        tenant: z.number().int().describe("Format - int64. Tenant ID"),
        file: z.string().describe("The file to upload (base64 encoded)")
    },
    async ({ id, tenant, file }) => {
        try {
        const response = await api.post(`/tenant/${tenant}/jobs/${id}/attachments`, { file });
        return {
            content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
        };
        } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }]
        };
        }
    }
    );
    // Tool: Form Submission Get Form Submissions
    server.tool(
        "form_submission_get_form_submissions",
        {
            tenant: z.number().int().describe("Format - int64. Tenant ID"),
            formIds: z.string().nullable().optional().describe("Form Ids (comma separated Ids)"),
            active: z.string().nullable().optional().describe("Values: [True, Any, False]"),
            createdById: z.number().int().nullable().optional().describe("Format - int64. Creator user Id"),
            status: z.string().nullable().optional().describe("Values: [Started, Completed, Any]"),
            submittedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Submission modified date on or after"),
            submittedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Submission modified date before"),
            ownerType: z.string().nullable().optional().describe("Values: [Job, Call, Customer, Location, Equipment, Technician, JobAppointment, Membership, Truck]"),
            owners: z.string().nullable().optional().describe("List of owner object (one of Job,Customer,Location,Equipment,Call,Technician) {'type': 'xxx', 'id': 0000}\\\n\\\nExample: owners[0].type=Location&owners[0].id=2689281&\\\nowners[1].type=Customer&owners[1].id=2703496"),
            page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
            pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
            includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
            sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\\\n\"?sort=+FieldName\" for ascending order,\\\n\"?sort=-FieldName\" for descending order.\\\n\\\nAvailable fields are: Id, SubmittedOn, CreatedBy.")
        },
        async ({ tenant, formIds, active, createdById, status, submittedOnOrAfter, submittedBefore, ownerType, owners, page, pageSize, includeTotal, sort }) => {
            try {
                let endpoint = `/tenant/${tenant}/submissions`;
                const params: Record<string, any> = {};
    
                if (formIds) {
                    params.formIds = formIds;
                }
                if (active) {
                    params.active = active;
                }
                if (createdById) {
                    params.createdById = createdById;
                }
                if (status) {
                    params.status = status;
                }
                if (submittedOnOrAfter) {
                    params.submittedOnOrAfter = submittedOnOrAfter;
                }
                if (submittedBefore) {
                    params.submittedBefore = submittedBefore;
                }
                if (ownerType) {
                    params.ownerType = ownerType;
                }
                if (owners) {
                    params.owners = owners;
                }
                if (page) {
                    params.page = page;
                }
                if (pageSize) {
                    params.pageSize = pageSize;
                }
                if (includeTotal) {
                    params.includeTotal = includeTotal;
                }
                if (sort) {
                    params.sort = sort;
                }
    
                const response = await api.get(endpoint, { params: params });
    
                return {
                    content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }],
                };
            }
        }
    );
    // Tool: jobs_get
    server.tool("jobs_get_attachment",
    {
        id: z.number().int().describe("Format - int64. The id of the job attachment to retrieve, as returned by other job API endpoints."),
        tenant: z.number().int().describe("Format - int64. Tenant ID")
    },
    async ({ id, tenant }) => {
        try {
            const response = await api.get(`/tenant/${tenant}/jobs/attachment/${id}`);
            return {
                content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Error: ${error.message}` }]
            };
        }
    }
    );
    // Tool: jobs_get_job_attachments
    server.tool(
        "jobs_get_job_attachments",
        {
            tenant: z.number().int().describe("Format - int64. Tenant ID"),
            jobId: z.number().int().describe("Format - int64. Job Id"),
            createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
            createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
            sort: z.string().optional(),
            page: z.number().int().optional().describe("Format - int32."),
            pageSize: z.number().int().optional().describe("Format - int32."),
            includeTotal: z.boolean().optional()
        },
        async ({ tenant, jobId, createdBefore, createdOnOrAfter, sort, page, pageSize, includeTotal }) => {
            try {
                const endpoint = `/tenant/${tenant}/jobs/${jobId}/attachments`;
                const response = await api.get(endpoint, {
                    params: {
                        createdBefore,
                        createdOnOrAfter,
                        sort,
                        page,
                        pageSize,
                        includeTotal
                    }
                });
    
                return {
                    content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }]
                };
            }
        }
    );

// Tool: Adjustments Update
server.tool("adjustments_update",
  {
      id: z.number().int().describe("Format - int64. Adjustment Id"),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.patch(`/tenant/${tenant}/adjustments/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  server.tool(
      "Adjustments_UpdateCustomFields",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          customFields: z.record(z.any()).describe("Custom fields to update")
      },
      async ({ tenant, customFields }) => {
          try {
              const response = await api.patch(`/tenant/${tenant}/adjustments/custom-fields`, {
                  params: JSON.stringify(customFields)
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Adjustments GetList
  server.tool(
      "adjustments_get_list",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
          active: z.string().nullable().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
          externalDataApplicationGuid: z.string().uuid().nullable().optional().describe("Format - guid. If this guid is provided, external data corresponding to\nthis application guid will be returned."),
          externalDataKey: z.string().nullable().optional().describe("Performs lookup by external data key, 'externalDataValues' must also be provided."),
          externalDataValues: z.string().nullable().optional().describe("Performs lookup by external data values (maximum 50), 'externalDataKey' must also be provided."),
          number: z.string().nullable().optional().describe("Number filter"),
          referenceNumber: z.string().nullable().optional().describe("Reference number filter"),
          batchId: z.number().int().nullable().optional().describe("Format - int64. BatchId filter"),
          invoiceIds: z.string().nullable().optional().describe("Filter by a collection of invoice Ids"),
          inventoryLocationIds: z.string().nullable().optional().describe("Filter by a collection of inventory location Ids"),
          adjustmentTypes: z.string().nullable().optional().describe("Filter by a collection of adjustment types"),
          businessUnitIds: z.string().nullable().optional().describe("Filter by a collection of business unit Ids"),
          syncStatuses: z.string().nullable().optional().describe("Filter by a collection of sync statues"),
          "customFields.Fields": z.string().nullable().optional().describe("Collection of custom field pairs (name, value) to filter by"),
          "customFields.Operator": z.string().nullable().optional().describe("Can be \"Or\" or \"And\"\nValues: [And, Or]"),
          dateOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return adjustments with date on or after certain date/time"),
          dateBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return adjustments with date before certain date/time"),
          createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
          createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
          modifiedOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
          modifiedBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
          page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
          pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
          includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
          sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn."),
      },
      async ({ tenant, ids, active, externalDataApplicationGuid, externalDataKey, externalDataValues, number, referenceNumber, batchId, invoiceIds, inventoryLocationIds, adjustmentTypes, businessUnitIds, syncStatuses, "customFields.Fields": customFields_Fields, "customFields.Operator": customFields_Operator, dateOnOrAfter, dateBefore, createdOnOrAfter, createdBefore, modifiedOnOrAfter, modifiedBefore, page, pageSize, includeTotal, sort }) => {
          try {
              const endpoint = `/tenant/${tenant}/adjustments`;
              const params: { [key: string]: any } = {};
              if (ids) {
                  params["ids"] = ids;
              }
              if (active) {
                  params["active"] = active;
              }
              if (externalDataApplicationGuid) {
                  params["externalDataApplicationGuid"] = externalDataApplicationGuid;
              }
              if (externalDataKey) {
                  params["externalDataKey"] = externalDataKey;
              }
              if (externalDataValues) {
                  params["externalDataValues"] = externalDataValues;
              }
              if (number) {
                  params["number"] = number;
              }
              if (referenceNumber) {
                  params["referenceNumber"] = referenceNumber;
              }
              if (batchId) {
                  params["batchId"] = batchId;
              }
              if (invoiceIds) {
                  params["invoiceIds"] = invoiceIds;
              }
              if (inventoryLocationIds) {
                  params["inventoryLocationIds"] = inventoryLocationIds;
              }
              if (adjustmentTypes) {
                  params["adjustmentTypes"] = adjustmentTypes;
              }
              if (businessUnitIds) {
                  params["businessUnitIds"] = businessUnitIds;
              }
              if (syncStatuses) {
                  params["syncStatuses"] = syncStatuses;
              }
              if (customFields_Fields) {
                  params["customFields.Fields"] = customFields_Fields;
              }
              if (customFields_Operator) {
                  params["customFields.Operator"] = customFields_Operator;
              }
              if (dateOnOrAfter) {
                  params["dateOnOrAfter"] = dateOnOrAfter;
              }
              if (dateBefore) {
                  params["dateBefore"] = dateBefore;
              }
              if (createdOnOrAfter) {
                  params["createdOnOrAfter"] = createdOnOrAfter;
              }
              if (createdBefore) {
                  params["createdBefore"] = createdBefore;
              }
              if (modifiedOnOrAfter) {
                  params["modifiedOnOrAfter"] = modifiedOnOrAfter;
              }
              if (modifiedBefore) {
                  params["modifiedBefore"] = modifiedBefore;
              }
              if (page) {
                  params["page"] = page;
              }
              if (pageSize) {
                  params["pageSize"] = pageSize;
              }
              if (includeTotal) {
                  params["includeTotal"] = includeTotal;
              }
              if (sort) {
                  params["sort"] = sort;
              }
              const response = await api.get(endpoint, { params });
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Export_Adjustments
  server.tool("export_adjustments",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/export/adjustments`, {
          params: { from, includeRecentChanges }
      });
  
      if (response.status === 200) {
          return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } else {
          return {
          content: [{ type: "text", text: `Request failed with status code ${response.status}` }]
          };
      }
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Export_PurchaseOrders
  server.tool("export_purchase_orders",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
          const endpoint = `/tenant/${tenant}/export/purchase-orders`;
          const response = await api.get(endpoint, {
              params: {
                  from,
                  includeRecentChanges
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Export Returns
  server.tool(
      "export_returns",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
          includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
      },
      async ({ tenant, from, includeRecentChanges }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/export/returns`, {
                  params: { from, includeRecentChanges }
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Export_Transfers
  server.tool("export_transfers",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/export/transfers`, {
              params: { from, includeRecentChanges }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: PurchaseOrders_Create
  server.tool("purchase_orders_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      body: z.object({}).optional().describe("Request Body")
  },
  async ({ tenant, body }) => {
      try {
          const response = await api.post(`/tenant/${tenant}/purchase-orders`, body);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: PurchaseOrders Get By Id
  server.tool("purchase_orders_get_by_id",
  {
      id: z.number().int().describe("Format - int64. The purchase order ID."),
      tenant: z.number().int().describe("Format - int64. Tenant ID.")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/purchase-orders/${id}`);
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Purchase Orders Get List
  server.tool("purchase_orders_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      status: z.string().nullable().optional().describe("Filters by PO status\n\nAvailable values are: Pending, Sent, PartiallyReceived, Received, Exported, Canceled"),
      number: z.string().nullable().optional().describe("Filters by PO number "),
      jobId: z.number().int().nullable().optional().describe("Format - int64. Filters by JobId associated with PO"),
      jobIds: z.string().nullable().optional().describe("Filters by JobIds associated with PO"),
      technicianId: z.number().int().nullable().optional().describe("Format - int64. Filter by TechnicianId associated with PO"),
      projectId: z.number().int().nullable().optional().describe("Format - int64. Filter by ProjectId associated with PO"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      dateOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return POs with date on or after certain date/time"),
      dateBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return POs with date before certain date/time"),
      sentOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return POs sent on or after certain date/time"),
      sentBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return POs sent before certain date/time"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ tenant, ids, status, number, jobId, jobIds, technicianId, projectId, createdOnOrAfter, createdBefore, modifiedOnOrAfter, modifiedBefore, dateOnOrAfter, dateBefore, sentOnOrAfter, sentBefore, page, pageSize, includeTotal, sort }) => {
      try {
      let endpoint = `/tenant/${tenant}/purchase-orders`;
      const params = {
          ids: ids || undefined,
          status: status || undefined,
          number: number || undefined,
          jobId: jobId || undefined,
          jobIds: jobIds || undefined,
          technicianId: technicianId || undefined,
          projectId: projectId || undefined,
          createdOnOrAfter: createdOnOrAfter || undefined,
          createdBefore: createdBefore || undefined,
          modifiedOnOrAfter: modifiedOnOrAfter || undefined,
          modifiedBefore: modifiedBefore || undefined,
          dateOnOrAfter: dateOnOrAfter || undefined,
          dateBefore: dateBefore || undefined,
          sentOnOrAfter: sentOnOrAfter || undefined,
          sentBefore: sentBefore || undefined,
          page: page || undefined,
          pageSize: pageSize || undefined,
          includeTotal: includeTotal || undefined,
          sort: sort || undefined
      };
  
      const response = await api.get(endpoint, { params: params });
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: PurchaseOrders GetRequests
  server.tool("purchase_orders_getrequests",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional(),
      requestStatus: z.string().nullable().optional().describe("Filters by PO request status\nAvailable values are: PendingApproval, Rejected\\\nValues: [PendingApproval, Approved, Rejected]"),
      requestNumber: z.string().nullable().optional().describe("Filters by PO request number "),
      jobId: z.number().int().nullable().optional().describe("Format - int64. Filters by JobId associated with PO request"),
      jobIds: z.string().nullable().optional().describe("Filters by JobIds associated with PO request"),
      technicianId: z.number().int().nullable().optional().describe("Format - int64. Filter by TechnicianId associated with PO request"),
      projectId: z.number().int().nullable().optional().describe("Format - int64. Filter by ProjectId associated with PO request"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      dateOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return PO requests with date on or after certain date/time"),
      dateBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return PO requests with date before certain date/time"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn."),
  },
  async ({ tenant, ids, requestStatus, requestNumber, jobId, jobIds, technicianId, projectId, createdOnOrAfter, createdBefore, modifiedOnOrAfter, modifiedBefore, dateOnOrAfter, dateBefore, page, pageSize, includeTotal, sort }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/purchase-orders/requests`, {
              params: {
                  ids: ids,
                  requestStatus: requestStatus,
                  requestNumber: requestNumber,
                  jobId: jobId,
                  jobIds: jobIds,
                  technicianId: technicianId,
                  projectId: projectId,
                  createdOnOrAfter: createdOnOrAfter,
                  createdBefore: createdBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter,
                  modifiedBefore: modifiedBefore,
                  dateOnOrAfter: dateOnOrAfter,
                  dateBefore: dateBefore,
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  sort: sort
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: PurchaseOrders Update
  server.tool("purchase_orders_update",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.patch(`/tenant/${tenant}/purchase-orders/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: PurchaseOrders Cancel
  server.tool("purchase_orders_cancel",
  {
      id: z.number().int().describe("Format - int64. Return Id"),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.patch(`/tenant/${tenant}/purchase-orders/${id}/cancellation`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: PurchaseOrders ApproveRequest
  server.tool(
      "purchase_orders_approve_request",
      {
          id: z.number().int().describe("The purchase order request ID (int64)."),
          tenant: z.number().int().describe("The tenant ID (int64).")
      },
      async ({ id, tenant }) => {
          try {
              const endpoint = `/tenant/${tenant}/purchase-orders/requests/${id}/approve`;
              const response = await api.patch(endpoint);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: PurchaseOrders_RejectRequest
  server.tool(
      "PurchaseOrders_RejectRequest",
      {
          id: z.number().int().describe("Format - int64. Existing PoRequest Id"),
          tenant: z.number().int().describe("Format - int64. Tenant ID")
      },
      async ({ id, tenant }) => {
          try {
              const endpoint = `/tenant/${tenant}/purchase-orders/requests/${id}/reject`;
              const response = await api.patch(endpoint);
  
              if (response.status === 200) {
                  return {
                      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
                  };
              } else if (response.status === 400) {
                  return {
                      content: [{ type: "text", text: `Error: Bad Request - ${String(JSON.stringify(response.data))}` }]
                  };
              } else if (response.status === 404) {
                  return {
                      content: [{ type: "text", text: `Error: Not Found - ${String(JSON.stringify(response.data))}` }]
                  };
              } else {
                  return {
                      content: [{ type: "text", text: `Error: Unexpected status code ${response.status} - ${String(JSON.stringify(response.data))}` }]
                  };
              }
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: PurchaseOrdersMarkup_Create
  server.tool(
      "PurchaseOrdersMarkup_Create",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          from: z.number().optional().describe("Starting value for the markup range"),
          to: z.number().optional().describe("Ending value for the markup range"),
          percent: z.number().optional().describe("Markup percentage to apply")
      },
      async ({ tenant, from, to, percent }) => {
          try {
              const response = await api.post(`/tenant/${tenant}/purchase-order-markups`, { from, to, percent });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: PurchaseOrdersMarkup GetById
  server.tool("purchase_orders_markup_get_by_id",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/purchase-order-markups/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: PurchaseOrdersMarkup Get
  server.tool("purchase_orders_markup_get",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Purchase order markup IDs"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().nullable().optional().describe("Format - int32."),
      pageSize: z.number().int().nullable().optional().describe("Format - int32."),
      includeTotal: z.boolean().nullable().optional(),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, From, To, Percent")
  },
  async ({ tenant, ids, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort }) => {
      try {
      let endpoint = `/tenant/${tenant}/purchase-order-markups`;
      const params: any = {};
      if (ids) {
          params.ids = ids;
      }
      if (createdBefore) {
          params.createdBefore = createdBefore;
      }
      if (createdOnOrAfter) {
          params.createdOnOrAfter = createdOnOrAfter;
      }
      if (modifiedBefore) {
          params.modifiedBefore = modifiedBefore;
      }
      if (modifiedOnOrAfter) {
          params.modifiedOnOrAfter = modifiedOnOrAfter;
      }
      if (page) {
          params.page = page;
      }
      if (pageSize) {
          params.pageSize = pageSize;
      }
      if (includeTotal) {
          params.includeTotal = includeTotal;
      }
      if (sort) {
          params.sort = sort;
      }
  
      const response = await api.get(endpoint, { params: params });
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: PurchaseOrdersMarkup_Update
  server.tool("PurchaseOrdersMarkup_Update",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      createdOn: z.string().optional(),
      modifiedOn: z.string().optional(),
      from: z.number().optional(),
      to: z.number().optional(),
      percent: z.number().optional()
  },
  async ({ id, tenant, createdOn, modifiedOn, from, to, percent }) => {
      try {
      const response = await api.patch(`/tenant/${tenant}/purchase-order-markups/${id}`, { createdOn, modifiedOn, from, to, percent });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: PurchaseOrdersMarkup Delete
  server.tool("purchase_orders_markup_delete",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.delete(`/tenant/${tenant}/purchase-order-markups/${id}`);
      return {
          content: [{ type: "text", text: "Purchase order markup deleted successfully." }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: PurchaseOrderTypes_Create
  server.tool("PurchaseOrderTypes_Create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ tenant }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/purchase-order-types`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: PurchaseOrderTypes Update
  server.tool("purchase_order_types_update",
  {
      id: z.number().int().describe("Format - int64. Purchase Order Type ID"),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.record(z.any()).describe("The payload to update the Purchase Order Type")
  },
  async ({ id, tenant, payload }) => {
      try {
      const response = await api.patch(`/tenant/${tenant}/purchase-order-types/${id}`, payload);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: PurchaseOrderTypes_GetList
  server.tool("PurchaseOrderTypes_GetList",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      createdBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().optional().nullable().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().nullable().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().nullable().describe("Whether total count should be returned"),
      sort: z.string().optional().nullable().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ tenant, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort }) => {
      try {
          let endpoint = `/tenant/${tenant}/purchase-order-types`;
          const params: Record<string, any> = {};
  
          if (active !== undefined) {
              params.active = active;
          }
          if (createdBefore !== undefined) {
              params.createdBefore = createdBefore;
          }
          if (createdOnOrAfter !== undefined) {
              params.createdOnOrAfter = createdOnOrAfter;
          }
          if (modifiedBefore !== undefined) {
              params.modifiedBefore = modifiedBefore;
          }
          if (modifiedOnOrAfter !== undefined) {
              params.modifiedOnOrAfter = modifiedOnOrAfter;
          }
          if (page !== undefined) {
              params.page = page;
          }
          if (pageSize !== undefined) {
              params.pageSize = pageSize;
          }
          if (includeTotal !== undefined) {
              params.includeTotal = includeTotal;
          }
          if (sort !== undefined) {
              params.sort = sort;
          }
  
          const response = await api.get(endpoint, { params: params });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Receipts_CreateReceipt
  server.tool(
      "receipts_create_receipt",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
      },
      async ({ tenant }) => {
          try {
              const response = await api.post(`/tenant/${tenant}/receipts`);
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Receipts CancelReceipts
  server.tool("receipts_cancelreceipts",
  {
      tenant: z.number().int().describe("Tenant ID"),
      id: z.number().int().describe("Receipt ID"),
  },
  async ({ tenant, id }) => {
      try {
      const response = await api.patch(`/tenant/${tenant}/receipts/${id}/cancellation`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: receipts_getlist
  server.tool("receipts_getlist",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      active: z.string().nullable().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      number: z.string().nullable().optional().describe("Number filter"),
      vendorInvoiceNumber: z.string().nullable().optional().describe("Vendor invoice number filter"),
      billId: z.number().int().nullable().optional().describe("Format - int64. BillId filter"),
      batchId: z.number().int().nullable().optional().describe("Format - int64. BatchId filter"),
      vendorIds: z.string().nullable().optional().describe("Filter by a collection of vendors"),
      businessUnitIds: z.string().nullable().optional().describe("Filter by a collection of business units"),
      inventoryLocationIds: z.string().nullable().optional().describe("Filter by a collection of inventory locations"),
      purchaseOrderIds: z.string().nullable().optional().describe("Filter by a collection of purchase orders"),
      syncStatuses: z.string().nullable().optional().describe("Filter by a collection of sync statuses"),
      'customFields.Fields': z.record(z.string(), z.string()).nullable().optional().describe("Collection of custom field pairs (name, value) to filter by"),
      'customFields.Operator': z.string().nullable().optional().describe("Can be \"Or\" or \"And\"\nValues: [And, Or]"),
      receivedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return receipts with received date on or after certain date/time"),
      receivedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return receipts with received date before certain date/time"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ tenant, ids, active, number, vendorInvoiceNumber, billId, batchId, vendorIds, businessUnitIds, inventoryLocationIds, purchaseOrderIds, syncStatuses, 'customFields.Fields': customFieldsFields, 'customFields.Operator': customFieldsOperator, receivedOnOrAfter, receivedBefore, createdOnOrAfter, createdBefore, modifiedOnOrAfter, modifiedBefore, page, pageSize, includeTotal, sort }) => {
      try {
          const params = {
              ids,
              active,
              number,
              vendorInvoiceNumber,
              billId,
              batchId,
              vendorIds,
              businessUnitIds,
              inventoryLocationIds,
              purchaseOrderIds,
              syncStatuses,
              'customFields.Fields': customFieldsFields ? JSON.stringify(customFieldsFields) : undefined,
              'customFields.Operator': customFieldsOperator,
              receivedOnOrAfter,
              receivedBefore,
              createdOnOrAfter,
              createdBefore,
              modifiedOnOrAfter,
              modifiedBefore,
              page,
              pageSize,
              includeTotal,
              sort
          };
          const response = await api.get(`/tenant/${tenant}/receipts`, { params });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Receipts UpdateCustomFields
  server.tool(
  "receipts_update_custom_fields",
  {
      tenant: z.number().int().describe("Tenant ID"),
      customFields: z.record(z.string(), z.any()).optional().describe("Custom fields to update. A map of key-value pairs.")
  },
  async ({ tenant, customFields }) => {
      try {
      const endpoint = `/tenant/${tenant}/receipts/custom-fields`;
  
      const response = await api.patch(endpoint, customFields ? JSON.stringify(customFields) : undefined);
  
      return {
          content: [{ type: "text", text: "Custom fields updated successfully." }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Returns Create Return
  server.tool(
      "returns_create_return",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
      },
      async ({ tenant }) => {
          try {
              const response = await api.post(`/tenant/${tenant}/returns`);
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Returns_UpdateCustomFields
  server.tool("returns_update_custom_fields",
  {
      tenant: z.number().int().describe("Tenant ID"),
      customFields: z.record(z.any()).describe("Custom fields to update"),
  },
  async ({ tenant, customFields }) => {
      try {
          const response = await api.patch(`/tenant/${tenant}/returns/custom-fields`, {
              ...customFields
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Returns Update
  server.tool("returns_update",
  {
      id: z.number().int().describe("Format - int64. Return Id"),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.record(z.any()).optional().describe("JSON payload for update")
  },
  async ({ id, tenant, payload }) => {
      try {
          const endpoint = `/tenant/${tenant}/returns/${id}`;
          const response = await api.patch(endpoint, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Returns Cancel
  server.tool("returns_cancel",
  {
      id: z.number().int().describe("Format - int64. Return Id"),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.patch(`/tenant/${tenant}/returns/${id}/cancellation`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Returns GetList
  server.tool(
    "returns_getlist",
    {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      active: z.string().nullable().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      number: z.string().nullable().optional().describe("Number filter"),
      referenceNumber: z.string().nullable().optional().describe("Reference number filter"),
      jobId: z.number().int().nullable().optional().describe("Format - int64. Job filter"),
      purchaseOrderId: z.number().int().nullable().optional().describe("Format - int64. Purchase order filter"),
      batchId: z.number().int().nullable().optional().describe("Format - int64. Batch filter"),
      vendorIds: z.string().nullable().optional().describe("Filter by a collection of vendors"),
      businessUnitIds: z.string().nullable().optional().describe("Filter by a collection of business units"),
      inventoryLocationIds: z.string().nullable().optional().describe("Filter by a collection of inventory locations"),
      syncStatuses: z.string().nullable().optional().describe("Filter by a collection of sync statuses"),
      "customFields.Fields": z.record(z.string(), z.string()).nullable().optional().describe("Collection of custom field pairs (name, value) to filter by"),
      "customFields.Operator": z.string().nullable().optional().describe("Can be \"Or\" or \"And\"\nValues: [And, Or]"),
      returnDateOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Filters by returns with return date on or after certain date/time"),
      returnDateBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Filters by returns with return date before certain date/time"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn."),
      externalDataApplicationGuid: z.string().uuid().nullable().optional().describe("Format - guid. If this guid is provided, external data corresponding to\nthis application guid will be returned."),
      externalDataKey: z.string().nullable().optional().describe("Performs lookup by external data key, 'externalDataValues' must also be provided."),
      externalDataValues: z.string().nullable().optional().describe("Performs lookup by external data values (maximum 50), 'externalDataKey' must also be provided."),
    },
    async ({
      tenant,
      ids,
      active,
      number,
      referenceNumber,
      jobId,
      purchaseOrderId,
      batchId,
      vendorIds,
      businessUnitIds,
      inventoryLocationIds,
      syncStatuses,
      "customFields.Fields": customFieldsFields,
      "customFields.Operator": customFieldsOperator,
      returnDateOnOrAfter,
      returnDateBefore,
      createdOnOrAfter,
      createdBefore,
      modifiedOnOrAfter,
      modifiedBefore,
      page,
      pageSize,
      includeTotal,
      sort,
      externalDataApplicationGuid,
      externalDataKey,
      externalDataValues,
    }) => {
      try {
        const endpoint = `/tenant/${tenant}/returns`;
        const response = await api.get(endpoint, {
          params: {
            ids: ids || undefined,
            active: active || undefined,
            number: number || undefined,
            referenceNumber: referenceNumber || undefined,
            jobId: jobId || undefined,
            purchaseOrderId: purchaseOrderId || undefined,
            batchId: batchId || undefined,
            vendorIds: vendorIds || undefined,
            businessUnitIds: businessUnitIds || undefined,
            inventoryLocationIds: inventoryLocationIds || undefined,
            syncStatuses: syncStatuses || undefined,
            "customFields.Fields": customFieldsFields ? JSON.stringify(customFieldsFields) : undefined,
            "customFields.Operator": customFieldsOperator || undefined,
            returnDateOnOrAfter: returnDateOnOrAfter || undefined,
            returnDateBefore: returnDateBefore || undefined,
            createdOnOrAfter: createdOnOrAfter || undefined,
            createdBefore: createdBefore || undefined,
            modifiedOnOrAfter: modifiedOnOrAfter || undefined,
            modifiedBefore: modifiedBefore || undefined,
            page: page || undefined,
            pageSize: pageSize || undefined,
            includeTotal: includeTotal || undefined,
            sort: sort || undefined,
            externalDataApplicationGuid: externalDataApplicationGuid || undefined,
            externalDataKey: externalDataKey || undefined,
            externalDataValues: externalDataValues || undefined,
          },
        });
  
        return {
          content: [
            {
              type: "text",
              text: String(JSON.stringify(response.data)),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    }
  );
  // Tool: ReturnTypes Create
  server.tool("return_types_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ tenant }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/return-types`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: ReturnTypes Update
  server.tool("return_types_update",
  {
      id: z.number().int().describe("Format - int64. Return Type Id"),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.record(z.any()).optional().describe("Payload for the update request")
  },
  async ({ id, tenant, payload }) => {
      try {
          const endpoint = `/tenant/${tenant}/return-types/${id}`;
          const response = await api.patch(endpoint, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Return Types Get List
  server.tool(
      "return_types_get_list",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          activeOnly: z.boolean().describe("Filter by active only"),
          name: z.string().nullable().optional().describe("Filter by name"),
          createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
          createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
          modifiedBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
          modifiedOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
          page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
          pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
          includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
          sort: z.string().nullable().optional().describe("Applies sorting by specified fields")
      },
      async ({ tenant, activeOnly, name, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort }) => {
          try {
              let endpoint = `/tenant/${tenant}/return-types`;
              const params: { [key: string]: any } = {
                  activeOnly: activeOnly,
                  name: name,
                  createdBefore: createdBefore,
                  createdOnOrAfter: createdOnOrAfter,
                  modifiedBefore: modifiedBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter,
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  sort: sort
              };
  
              const filteredParams: { [key: string]: any } = Object.fromEntries(
                  Object.entries(params).filter(([key, value]) => value !== null && value !== undefined)
              );
  
              const response = await api.get(endpoint, { params: filteredParams });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Transfers UpdateCustomFields
  server.tool(
  "transfers_update_custom_fields",
  {
      tenant: z.number().int().describe("Tenant ID"),
      custom_fields: z.record(z.any()).describe("Custom fields to update")
  },
  async ({ tenant, custom_fields }) => {
      try {
          const response = await api.patch(`/tenant/${tenant}/transfers/custom-fields`, custom_fields);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Transfers Update
  server.tool(
  "transfers_update",
  {
      id: z.number().int().describe("Format - int64. Transfer Id"),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.record(z.any()).optional().describe("Payload to update transfer")
  },
  async ({ id, tenant, payload }) => {
      try {
          const endpoint = `/tenant/${tenant}/transfers/${id}`;
          const response = await api.patch(endpoint, payload ? JSON.stringify(payload) : null);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  
  const transfers_getlist = server.tool(
      "transfers_getlist",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
          statuses: z.string().nullable().optional().describe("Filter by a collection of statuses"),
          number: z.string().nullable().optional().describe("Number filter"),
          referenceNumber: z.string().nullable().optional().describe("Reference number filter"),
          batchId: z.number().int().nullable().optional().describe("Format - int64. Batch filter"),
          transferTypeIds: z.string().nullable().optional().describe("Filter by a collection of transfer types"),
          fromLocationIds: z.string().nullable().optional().describe("Filter by a collection of From field locations"),
          toLocationIds: z.string().nullable().optional().describe("Filter by a collection of To field locations"),
          syncStatuses: z.string().nullable().optional().describe("Filter by a collection of sync statuses"),
          "customFields.Fields": z.record(z.string()).nullable().optional().describe("Collection of custom field pairs (name, value) to filter by"),
          "customFields.Operator": z.string().nullable().optional().describe("Can be \"Or\" or \"And\"\\nValues: [And, Or]"),
          dateOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return transfers with date on or after certain date/time"),
          dateBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return transfers with date before certain date/time"),
          createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
          createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
          modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
          modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
          page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
          pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
          includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
          sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\\n\"?sort=+FieldName\" for ascending order,\\n\"?sort=-FieldName\" for descending order.\\n\\nAvailable fields are: Id, ModifiedOn, CreatedOn."),
          externalDataApplicationGuid: z.string().uuid().nullable().optional().describe("Format - guid. If this guid is provided, external data corresponding to\nthis application guid will be returned."),
          externalDataKey: z.string().nullable().optional().describe("Performs lookup by external data key, 'externalDataValues' must also be provided."),
          externalDataValues: z.string().nullable().optional().describe("Performs lookup by external data values (maximum 50), 'externalDataKey' must also be provided."),
      },
      async ({ tenant, ids, statuses, number, referenceNumber, batchId, transferTypeIds, fromLocationIds, toLocationIds, syncStatuses, "customFields.Fields": customFieldsFields, "customFields.Operator": customFieldsOperator, dateOnOrAfter, dateBefore, createdOnOrAfter, createdBefore, modifiedOnOrAfter, modifiedBefore, page, pageSize, includeTotal, sort, externalDataApplicationGuid, externalDataKey, externalDataValues }) => {
          try {
              const endpoint = `/tenant/${tenant}/transfers`;
              const params = {
                  ids: ids || undefined,
                  statuses: statuses || undefined,
                  number: number || undefined,
                  referenceNumber: referenceNumber || undefined,
                  batchId: batchId || undefined,
                  transferTypeIds: transferTypeIds || undefined,
                  fromLocationIds: fromLocationIds || undefined,
                  toLocationIds: toLocationIds || undefined,
                  syncStatuses: syncStatuses || undefined,
                  "customFields.Fields": customFieldsFields ? JSON.stringify(customFieldsFields) : undefined,
                  "customFields.Operator": customFieldsOperator || undefined,
                  dateOnOrAfter: dateOnOrAfter || undefined,
                  dateBefore: dateBefore || undefined,
                  createdOnOrAfter: createdOnOrAfter || undefined,
                  createdBefore: createdBefore || undefined,
                  modifiedOnOrAfter: modifiedOnOrAfter || undefined,
                  modifiedBefore: modifiedBefore || undefined,
                  page: page || undefined,
                  pageSize: pageSize || undefined,
                  includeTotal: includeTotal || undefined,
                  sort: sort || undefined,
                  externalDataApplicationGuid: externalDataApplicationGuid || undefined,
                  externalDataKey: externalDataKey || undefined,
                  externalDataValues: externalDataValues || undefined,
              };
  
              const response = await api.get(endpoint, { params: params });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Vendors Create
  server.tool("vendors_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ tenant }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/vendors`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Trucks Update
  server.tool("trucks_update",
  {
      id: z.number().int().describe("Format - int64. Truck Id"),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.record(z.any()).optional().describe("Truck details to update")
  },
  async ({ id, tenant, payload }) => {
      try {
      const endpoint = `/tenant/${tenant}/trucks/${id}`;
      const response = await api.patch(endpoint, payload ? JSON.stringify(payload) : null);
  
      if (response.status === 200) {
          return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } else if (response.status === 400) {
          return {
          content: [{ type: "text", text: `Error: Bad Request - ${response.data}` }]
          };
      } else if (response.status === 404) {
          return {
          content: [{ type: "text", text: `Error: Not Found - ${response.data}` }]
          };
      } else {
          return {
          content: [{ type: "text", text: `Error: Unexpected status code ${response.status}` }]
          };
      }
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Trucks_GetList
  server.tool("Trucks_GetList",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().optional().nullable().describe("Perform lookup by multiple IDs (maximum 50)"),
      active: z.string().optional().nullable().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      externalDataApplicationGuid: z.string().uuid().optional().nullable().describe("Format - guid. If this guid is provided, external data corresponding to\nthis application guid will be returned."),
      externalDataKey: z.string().optional().nullable().describe("Performs lookup by external data key, 'externalDataValues' must also be provided."),
      externalDataValues: z.string().optional().nullable().describe("Performs lookup by external data values (maximum 50), 'externalDataKey' must also be provided."),
      createdBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().optional().nullable().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().nullable().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().nullable().describe("Whether total count should be returned"),
      sort: z.string().optional().nullable().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ tenant, ids, active, externalDataApplicationGuid, externalDataKey, externalDataValues, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/trucks`, {
              params: {
                  ids,
                  active,
                  externalDataApplicationGuid,
                  externalDataKey,
                  externalDataValues,
                  createdBefore,
                  createdOnOrAfter,
                  modifiedBefore,
                  modifiedOnOrAfter,
                  page,
                  pageSize,
                  includeTotal,
                  sort
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Vendors Get By Id
  server.tool(
  "vendors_get_by_id",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      externalDataApplicationGuid: z.string().uuid().optional().describe("Format - guid. If this guid is provided, external data corresponding to\nthis application guid will be returned."),
      externalDataKey: z.string().optional().describe("Performs lookup by external data key, 'externalDataValues' must also be provided."),
      externalDataValues: z.string().optional().describe("Performs lookup by external data values (maximum 50), 'externalDataKey' must also be provided.")
  },
  async ({ id, tenant, externalDataApplicationGuid, externalDataKey, externalDataValues }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/vendors/${id}`, {
          params: {
          externalDataApplicationGuid,
          externalDataKey,
          externalDataValues
          }
      });
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Vendors Update
  server.tool(
      "Vendors_Update",
      {
          id: z.number().int().describe("Format - int64. Vendor Id"),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          payload: z.record(z.any()).optional().describe("Vendor properties to update")
      },
      async ({ id, tenant, payload }) => {
          try {
              const endpoint = `/tenant/${tenant}/vendors/${id}`;
              const response = await api.patch(endpoint, payload);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Vendors_GetList
  server.tool(
      "Vendors_GetList",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          ids: z.array(z.number().int()).optional().nullable().describe("Ids to filter by"),
          active: z.string().optional().nullable().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
          externalDataApplicationGuid: z.string().uuid().optional().nullable().describe("Format - guid. If this guid is provided, external data corresponding to\nthis application guid will be returned."),
          externalDataKey: z.string().optional().nullable().describe("Performs lookup by external data key, 'externalDataValues' must also be provided."),
          externalDataValues: z.string().optional().nullable().describe("Performs lookup by external data values (maximum 50), 'externalDataKey' must also be provided."),
          createdBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
          createdOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
          modifiedBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
          modifiedOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
          page: z.number().int().optional().nullable().describe("Format - int32. The logical number of page to return, starting from 1"),
          pageSize: z.number().int().optional().nullable().describe("Format - int32. How many records to return (50 by default)"),
          includeTotal: z.boolean().optional().nullable().describe("Whether total count should be returned"),
          sort: z.string().optional().nullable().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
      },
      async ({ tenant, ids, active, externalDataApplicationGuid, externalDataKey, externalDataValues, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort }) => {
          try {
              const params: { [key: string]: any } = {};
              if (ids) params.ids = ids;
              if (active) params.active = active;
              if (externalDataApplicationGuid) params.externalDataApplicationGuid = externalDataApplicationGuid;
              if (externalDataKey) params.externalDataKey = externalDataKey;
              if (externalDataValues) params.externalDataValues = externalDataValues;
              if (createdBefore) params.createdBefore = createdBefore;
              if (createdOnOrAfter) params.createdOnOrAfter = createdOnOrAfter;
              if (modifiedBefore) params.modifiedBefore = modifiedBefore;
              if (modifiedOnOrAfter) params.modifiedOnOrAfter = modifiedOnOrAfter;
              if (page) params.page = page;
              if (pageSize) params.pageSize = pageSize;
              if (includeTotal) params.includeTotal = includeTotal;
              if (sort) params.sort = sort;
  
              const response = await api.get(`/tenant/${tenant}/vendors`, {
                  params: params
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Warehouses_Update
  server.tool("warehouses_update",
  {
      id: z.number().int().describe("Format - int64. Warehouse Id"),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.record(z.any()).optional().describe("The request body")
  },
  async ({ id, tenant, payload }) => {
      try {
      const response = await api.patch(`/tenant/${tenant}/warehouses/${id}`, payload);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Warehouses GetList
  server.tool("warehouses_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      active: z.string().nullable().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      externalDataApplicationGuid: z.string().uuid().nullable().optional().describe("Format - guid. If this guid is provided, external data corresponding to\nthis application guid will be returned."),
      externalDataKey: z.string().nullable().optional().describe("Performs lookup by external data key, 'externalDataValues' must also be provided."),
      externalDataValues: z.string().nullable().optional().describe("Performs lookup by external data values (maximum 50), 'externalDataKey' must also be provided."),
      createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ tenant, ids, active, externalDataApplicationGuid, externalDataKey, externalDataValues, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort }) => {
      try {
          const endpoint = `/tenant/${tenant}/warehouses`;
          const response = await api.get(endpoint, {
              params: {
                  ids: ids || undefined,
                  active: active || undefined,
                  externalDataApplicationGuid: externalDataApplicationGuid || undefined,
                  externalDataKey: externalDataKey || undefined,
                  externalDataValues: externalDataValues || undefined,
                  createdBefore: createdBefore || undefined,
                  createdOnOrAfter: createdOnOrAfter || undefined,
                  modifiedBefore: modifiedBefore || undefined,
                  modifiedOnOrAfter: modifiedOnOrAfter || undefined,
                  page: page || undefined,
                  pageSize: pageSize || undefined,
                  includeTotal: includeTotal || undefined,
                  sort: sort || undefined
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );

  // Tool: call_reasons_get
server.tool(
  "call_reasons_get",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ tenant, page, pageSize, includeTotal, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
      try {
          let endpoint = `/tenant/${tenant}/call-reasons`;
          const params: Record<string, any> = {};

          if (page !== undefined) {
              params.page = page;
          }
          if (pageSize !== undefined) {
              params.pageSize = pageSize;
          }
          if (includeTotal !== undefined) {
              params.includeTotal = includeTotal;
          }
          if (active !== undefined) {
              params.active = active;
          }
          if (createdBefore !== undefined) {
              params.createdBefore = createdBefore;
          }
          if (createdOnOrAfter !== undefined) {
              params.createdOnOrAfter = createdOnOrAfter;
          }
          if (modifiedBefore !== undefined) {
              params.modifiedBefore = modifiedBefore;
          }
          if (modifiedOnOrAfter !== undefined) {
              params.modifiedOnOrAfter = modifiedOnOrAfter;
          }
          if (sort !== undefined) {
              params.sort = sort;
          }

          const response = await api.get(endpoint, { params: params });

          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);

// Tool: Appointments Get
server.tool(
  "appointments_get",
  {
      id: z.number().int().describe("The appointment ID (int64)"),
      tenant: z.number().int().describe("The tenant ID (int64)")
  },
  async ({ id, tenant }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/appointments/${id}`);

          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: Appointments Delete
server.tool("appointments_delete",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
  const response = await api.delete(`/tenant/${tenant}/appointments/${id}`);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
server.tool("appointments_getlist",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
  jobId: z.number().int().nullable().optional().describe("Format - int64. Return all appointments for this job"),
  projectId: z.number().int().nullable().optional().describe("Format - int64. Return all appointments for jobs that are part of this project"),
  number: z.string().nullable().optional().describe("Return all appointments with this appointment number"),
  status: z.string().nullable().optional().describe("Return items with specified status AppointmentStatus\nValues: [Scheduled, Dispatched, Working, Hold, Done, Canceled]"),
  startsOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return appointments that start on or after the specified date/time (in UTC)"),
  startsBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return appointments that start before the specified date/time (in UTC)"),
  technicianId: z.number().int().nullable().optional().describe("Format - int64. Return appointments this technician is assigned to"),
  customerId: z.number().int().nullable().optional().describe("Format - int64. Return appointments for the specified Customer"),
  unused: z.boolean().nullable().optional().describe("Return appointments that are unused"),
  modifiedBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return appointments modified before a certain date/time (in UTC)"),
  modifiedOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return appointments modified on or after a certain date/time (in UTC)"),
  createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return appointments created on or after a certain date/time (in UTC)"),
  createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return appointments created before a certain date/time (in UTC)"),
  page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
  sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
},
async ({ tenant, ids, jobId, projectId, number, status, startsOnOrAfter, startsBefore, technicianId, customerId, unused, modifiedBefore, modifiedOnOrAfter, createdOnOrAfter, createdBefore, page, pageSize, includeTotal, sort }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/appointments`, {
          params: {
              ids: ids || undefined,
              jobId: jobId || undefined,
              projectId: projectId || undefined,
              number: number || undefined,
              status: status || undefined,
              startsOnOrAfter: startsOnOrAfter || undefined,
              startsBefore: startsBefore || undefined,
              technicianId: technicianId || undefined,
              customerId: customerId || undefined,
              unused: unused || undefined,
              modifiedBefore: modifiedBefore || undefined,
              modifiedOnOrAfter: modifiedOnOrAfter || undefined,
              createdOnOrAfter: createdOnOrAfter || undefined,
              createdBefore: createdBefore || undefined,
              page: page || undefined,
              pageSize: pageSize || undefined,
              includeTotal: includeTotal || undefined,
              sort: sort || undefined
          }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Appointments Add
server.tool("appointments_add",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  jobId: z.number().int().describe("Job ID"),
  appointmentNumber: z.string().describe("Appointment Number"),
  start: z.string().describe("Start time"),
  end: z.string().describe("End time"),
  arrivalWindowStart: z.string().optional().describe("Arrival Window Start time"),
  arrivalWindowEnd: z.string().optional().describe("Arrival Window End time"),
  status: z.string().optional().describe("Status"),
  specialInstructions: z.string().optional().describe("Special Instructions"),
  customerId: z.number().int().describe("Customer ID"),
  createdById: z.number().int().describe("Created By ID"),
  isConfirmed: z.boolean().optional().describe("Is Confirmed")
},
async ({ tenant, jobId, appointmentNumber, start, end, arrivalWindowStart, arrivalWindowEnd, status, specialInstructions, customerId, createdById, isConfirmed }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/appointments`, {
      jobId: jobId,
      appointmentNumber: appointmentNumber,
      start: start,
      end: end,
      arrivalWindowStart: arrivalWindowStart,
      arrivalWindowEnd: arrivalWindowEnd,
      status: status,
      specialInstructions: specialInstructions,
      customerId: customerId,
      createdById: createdById,
      isConfirmed: isConfirmed
  });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Appointments Reschedule
server.tool("appointments_reschedule",
{
  id: z.number().int().describe("The appointment ID (int64)"),
  tenant: z.number().int().describe("The tenant ID (int64)"),
  body: z.object({}).optional().describe("Request body (optional)"),
},
async ({ id, tenant, body }) => {
  try {
  const endpoint = `/tenant/${tenant}/appointments/${id}/reschedule`;
  const response = await api.patch(endpoint, body ? JSON.stringify(body) : undefined);

  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Appointments Hold
server.tool("appointments_hold",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
  const response = await api.put(`/tenant/${tenant}/appointments/${id}/hold`);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Appointments Remove Hold
server.tool("appointments_remove_hold",
{
  id: z.number().int().describe("The appointment ID (int64)"),
  tenant: z.number().int().describe("The tenant ID (int64)")
},
async ({ id, tenant }) => {
  try {
  const response = await api.delete(`/tenant/${tenant}/appointments/${id}/hold`);
  return {
      content: [{ type: "text", text: "Hold removed from appointment successfully." }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Appointments UpdateSpecialInstructions
server.tool("appointments_update_special_instructions",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  specialInstructions: z.string().describe("Special instructions to update")
},
async ({ id, tenant, specialInstructions }) => {
  try {
  const response = await api.put(`/tenant/${tenant}/appointments/${id}/special-instructions`, { specialInstructions });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Appointments Confirm
server.tool("appointments_confirm",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
  const response = await api.put(`/tenant/${tenant}/appointments/${id}/confirmation`);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Appointments RemoveConfirmation
server.tool(
"appointments_removeconfirmation",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
},
async ({ id, tenant }) => {
  try {
  const response = await api.delete(`/tenant/${tenant}/appointments/${id}/confirmation`);
  return {
      content: [{ type: "text", text: "Appointment confirmation removed successfully." }],
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
  };
  }
}
);
// Tool: Export_Jobs
server.tool("export_jobs",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
  includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
},
async ({ tenant, from, includeRecentChanges }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/export/jobs`, {
          params: { from, includeRecentChanges }
      });

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Export_Projects
server.tool("export_projects",
{
  tenant: z.number().int().describe("Tenant ID"),
  from: z.string().nullable().optional().describe("Continuation token or custom date string"),
  includeRecentChanges: z.boolean().nullable().optional().describe("Include recent changes quickly")
},
async ({ tenant, from, includeRecentChanges }) => {
  try {
  const response = await api.get(`/tenant/${tenant}/export/projects`, {
      params: { from, includeRecentChanges }
  });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Export_Appointments
server.tool("export_appointments",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
  includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
},
async ({ tenant, from, includeRecentChanges }) => {
  try {
  const response = await api.get(`/tenant/${tenant}/export/appointments`, {
      params: { from, includeRecentChanges }
  });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Export Job Cancel Reasons
server.tool("export_job_cancel_reasons",
{
  tenant: z.number().int().describe("Tenant ID"),
  from: z.string().optional().describe("Continuation token or custom date string"),
  includeRecentChanges: z.boolean().optional().describe("Include recent changes quickly")
},
async ({ tenant, from, includeRecentChanges }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/export/job-canceled-logs`, {
          params: { from, includeRecentChanges }
      });

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
server.tool("export_jobnotes",
{
  tenant: z.number().int().describe("Tenant ID"),
  from: z.string().nullable().optional().describe("Continuation token or date string"),
  includeRecentChanges: z.boolean().nullable().optional().describe("Include recent changes flag")
},
async ({ tenant, from, includeRecentChanges }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/export/job-notes`, {
          params: {
              from,
              includeRecentChanges
          }
      });

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Export_ProjectNotes
server.tool("Export_ProjectNotes",
{
  tenant: z.number().int().describe("Tenant ID"),
  from: z.string().nullable().optional().describe("Continuation token or custom date string"),
  includeRecentChanges: z.boolean().nullable().optional().describe("Use true to receive recent changes quicker")
},
async ({ tenant, from, includeRecentChanges }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/export/project-notes`, {
          params: { from, includeRecentChanges }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Export Job History
server.tool("Export_JobHistory",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
  includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
},
async ({ tenant, from, includeRecentChanges }) => {
  try {
  const response = await api.get(`/tenant/${tenant}/export/job-history`, {
      params: { from, includeRecentChanges }
  });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: job_cancel_reasons_get_list
server.tool(
  "job_cancel_reasons_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      active: z.enum(["True", "Any", "False"]).optional().describe("What kind of items should be returned (active and inactive items will be returned by default)\nValues: [True, Any, False]"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ tenant, page, pageSize, includeTotal, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
      try {
          const endpoint = `/tenant/${tenant}/job-cancel-reasons`;
          const response = await api.get(endpoint, {
              params: {
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  active: active,
                  createdBefore: createdBefore,
                  createdOnOrAfter: createdOnOrAfter,
                  modifiedBefore: modifiedBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter,
                  sort: sort
              }
          });

          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: Jobs Get
server.tool(
  "jobs_get",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      externalDataApplicationGuid: z.string().uuid().optional().describe("Format - guid. If this guid is provided, external data corresponding to\nthis application guid will be returned.")
  },
  async ({ id, tenant, externalDataApplicationGuid }) => {
      try {
          let endpoint = `/tenant/${tenant}/jobs/${id}`;
          const params: { externalDataApplicationGuid?: string } = {};

          if (externalDataApplicationGuid) {
              params.externalDataApplicationGuid = externalDataApplicationGuid;
          }

          const response = await api.get(endpoint, { params: params });

          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: JobHoldReasons Get
server.tool("job_hold_reasons_get",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
  active: z.enum(["True", "Any", "False"]).optional().describe("What kind of items should be returned (active and inactive items will be returned by default)\nValues: [True, Any, False]"),
  createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
  createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
  modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
  modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
  sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
},
async ({ tenant, page, pageSize, includeTotal, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
  try {
  const response = await api.get(`/tenant/${tenant}/job-hold-reasons`, {
      params: { page, pageSize, includeTotal, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }
  });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Jobs Update
server.tool("jobs_update",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  body: z.record(z.any()).optional().describe("The request body"),
},
async ({ id, tenant, body }) => {
  try {
  const response = await api.patch(`/tenant/${tenant}/jobs/${id}`, body);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Jobs Create
server.tool("jobs_create",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ tenant }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/jobs`);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Jobs Cancel
server.tool("jobs_cancel",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
  const response = await api.put(`/tenant/${tenant}/jobs/${id}/cancel`);
  return {
      content: [{ type: "text", text: "Job cancellation request sent." }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Jobs Remove Cancellation
server.tool("jobs_remove_cancellation",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
      const response = await api.put(`/tenant/${tenant}/jobs/${id}/remove-cancellation`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Jobs Hold
server.tool("jobs_hold",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
  const response = await api.put(`/tenant/${tenant}/jobs/${id}/hold`);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Jobs Complete
server.tool(
  "jobs_complete",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
  },
  async ({ id, tenant }) => {
      try {
          const endpoint = `/tenant/${tenant}/jobs/${id}/complete`;
          await api.put(endpoint);

          return {
              content: [{ type: "text", text: "Job completed successfully." }],
          };
      } catch (error: any) {
          let message = "An error occurred.";
          if (error.response) {
              message = `Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
          } else if (error.request) {
              message = `Error: No response received - ${error.request}`;
          } else {
              message = `Error: ${error.message}`;
          }
          return {
              content: [{ type: "text", text: message }],
          };
      }
  }
);
// Tool: Jobs_GetList
server.tool("jobs_get_list",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
  ids: z.string().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
  number: z.string().optional().describe("Filters by job number"),
  projectId: z.number().int().optional().describe("Format - int64. Filters by project ID"),
  bookingId: z.number().int().optional().describe("Format - int64. Filters by booking ID that resulted in this job"),
  jobStatus: z.string().optional().describe("Filters by job status\nValues: [Scheduled, Dispatched, InProgress, Hold, Completed, Canceled]"),
  appointmentStatus: z.string().optional().describe("Filters by appointment status. Return a job if it has any appointment with the specified status.\nValues: [Scheduled, Dispatched, Working, Hold, Done, Canceled]"),
  priority: z.string().optional().describe('Filters by priority. Supported priorities are "Low", "Normal", "High", "Urgent"'),
  firstAppointmentStartsOnOrAfter: z.string().datetime().optional().describe('Format - date-time (as date-time in RFC3339). Return jobs whose first appointment starts on or after date/time (in UTC). Use with\n"firstAppointmentStartsBefore" to find jobs whose first appointment is within the specified date range.'),
  firstAppointmentStartsBefore: z.string().datetime().optional().describe('Format - date-time (as date-time in RFC3339). Return jobs whose first appointment starts before date/time (in UTC)'),
  appointmentStartsOnOrAfter: z.string().datetime().optional().describe('Format - date-time (as date-time in RFC3339). Return jobs if any appointment starts after date/time (in UTC)'),
  appointmentStartsBefore: z.string().datetime().optional().describe('Format - date-time (as date-time in RFC3339). Return jobs if any appointment starts after date/time (in UTC)'),
  technicianId: z.number().int().optional().describe('Format - int64. Return jobs if technician is assigned to any appointment'),
  customerId: z.number().int().optional().describe("Format - int64. Filters by job's customer ID"),
  locationId: z.number().int().optional().describe("Format - int64. Filters by job's location ID"),
  soldById: z.number().int().optional().describe('Format - int64. Filters by the technician who sold the job'),
  jobTypeId: z.number().int().optional().describe('Format - int64. Filters by job type ID'),
  campaignId: z.number().int().optional().describe("Format - int64. Filters by job's campaign ID"),
  businessUnitId: z.number().int().optional().describe("Format - int64. Filters by job's business unit ID"),
  invoiceId: z.number().int().optional().describe("Format - int64. Filters by job's invoice ID"),
  createdBefore: z.string().datetime().optional().describe('Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)'),
  createdOnOrAfter: z.string().datetime().optional().describe('Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)'),
  modifiedBefore: z.string().datetime().optional().describe('Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)'),
  modifiedOnOrAfter: z.string().datetime().optional().describe('Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)'),
  completedOnOrAfter: z.string().datetime().optional().describe('Format - date-time (as date-time in RFC3339). Return jobs that are completed after a certain date/time (in UTC)'),
  completedBefore: z.string().datetime().optional().describe('Format - date-time (as date-time in RFC3339). Return jobs that are completed before a certain date/time (in UTC)'),
  tagTypeIds: z.string().optional().describe('Return jobs that have at least one of provided Tag Type assigned'),
  sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn, Priority."),
  externalDataApplicationGuid: z.string().uuid().optional().describe("Format - guid. If this guid is provided, external data corresponding to\nthis application guid will be returned."),
  externalDataKey: z.string().optional().describe("Performs lookup by external data key, 'externalDataValues' must also be provided."),
  externalDataValues: z.string().optional().describe("Performs lookup by external data values (maximum 50), 'externalDataKey' must also be provided."),
  hasUnusedAppointments: z.boolean().optional().describe('If set to true, return jobs that have unused appointments.')
},
async ({ tenant, page, pageSize, includeTotal, ids, number, projectId, bookingId, jobStatus, appointmentStatus, priority, firstAppointmentStartsOnOrAfter, firstAppointmentStartsBefore, appointmentStartsOnOrAfter, appointmentStartsBefore, technicianId, customerId, locationId, soldById, jobTypeId, campaignId, businessUnitId, invoiceId, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, completedOnOrAfter, completedBefore, tagTypeIds, sort, externalDataApplicationGuid, externalDataKey, externalDataValues, hasUnusedAppointments }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/jobs`, {
          params: {
              page,
              pageSize,
              includeTotal,
              ids,
              number,
              projectId,
              bookingId,
              jobStatus,
              appointmentStatus,
              priority,
              firstAppointmentStartsOnOrAfter,
              firstAppointmentStartsBefore,
              appointmentStartsOnOrAfter,
              appointmentStartsBefore,
              technicianId,
              customerId,
              locationId,
              soldById,
              jobTypeId,
              campaignId,
              businessUnitId,
              invoiceId,
              createdBefore,
              createdOnOrAfter,
              modifiedBefore,
              modifiedOnOrAfter,
              completedOnOrAfter,
              completedBefore,
              tagTypeIds,
              sort,
              externalDataApplicationGuid,
              externalDataKey,
              externalDataValues,
              hasUnusedAppointments
          }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Jobs GetNotes
server.tool("jobs_getnotes",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned")
},
async ({ id, tenant, page, pageSize, includeTotal }) => {
  try {
  const response = await api.get(`/tenant/${tenant}/jobs/${id}/notes`, {
      params: { page, pageSize, includeTotal }
  });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Jobs_CreateNote
server.tool(
  "jobs_create_note",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      text: z.string().describe("Note text")
  },
  async ({ id, tenant, text }) => {
      try {
          const response = await api.post(`/tenant/${tenant}/jobs/${id}/notes`, { text });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: Jobs_GetCancelReasons
server.tool(
  "jobs_get_cancel_reasons",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().describe("Perform lookup by multiple IDs (maximum 50)").nullable(),
  },
  async ({ tenant, ids }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/jobs/cancel-reasons`, {
              params: { ids },
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }],
          };
      }
  }
);
// Tool: Jobs GetHistory
server.tool(
  "jobs_gethistory",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
  },
  async ({ id, tenant }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/jobs/${id}/history`);

          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }],
          };
      }
  }
);
// Tool: Jobs Create Message
server.tool("jobs_create_message",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  message: z.string().describe("The message to create"),
},
async ({ id, tenant, message }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/jobs/${id}/messages`, { message });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Jobs Get Job Canceled Logs
server.tool("jobs_get_job_canceled_logs",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned")
},
async ({ id, tenant, page, pageSize, includeTotal }) => {
  try {
  const response = await api.get(`/tenant/${tenant}/jobs/${id}/canceled-log`, {
      params: { page, pageSize, includeTotal }
  });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Jobs_GetBookedLog
server.tool(
  "jobs_get_booked_log",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
  },
  async ({ id, tenant }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/jobs/${id}/booked-log`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }],
          };
      }
  }
);
// Tool: jobs_get_custom_field_types
server.tool("jobs_get_custom_field_types",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
  createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
  createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
  modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
  modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
  sort: z.string().optional(),
},
async ({ tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
  try {
      const endpoint = `/tenant/${tenant}/jobs/custom-fields`;
      const response = await api.get(endpoint, {
          params: {
              page,
              pageSize,
              includeTotal,
              createdBefore,
              createdOnOrAfter,
              modifiedBefore,
              modifiedOnOrAfter,
              sort
          }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: JobTypes Get
server.tool("job_types_get",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  externalDataApplicationGuid: z.string().uuid().optional().describe("Format - guid. If this guid is provided, external data corresponding to\nthis application guid will be returned.")
},
async ({ id, tenant, externalDataApplicationGuid }) => {
  try {
  const response = await api.get(`/tenant/${tenant}/job-types/${id}`, {
      params: { externalDataApplicationGuid }
  });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: JobTypes_Create
server.tool(
"JobTypes_Create",
{
  tenant: z.number().int().describe("Tenant ID"),
  name: z.string().describe("Name of the job type"),
  businessUnitIds: z.array(z.number().int()).describe("List of business unit IDs"),
  skills: z.array(z.string()).describe("List of skills"),
  tagTypeIds: z.array(z.number().int()).describe("List of tag type IDs"),
  priority: z.string().describe("Priority of the job type"),
  duration: z.number().describe("Duration of the job type"),
  soldThreshold: z.number().describe("Sold threshold"),
  class: z.string().describe("Class of the job type"),
  summary: z.string().describe("Summary of the job type"),
  noCharge: z.boolean().describe("Whether the job type is no charge"),
  enforceRecurringServiceEventSelection: z.boolean().describe("Whether to enforce recurring service event selection"),
  invoiceSignaturesRequired: z.boolean().describe("Whether invoice signatures are required"),
  externalData: z.array(z.object({
      key: z.string(),
      value: z.string()
  })).optional().describe("External data for the job type"),
  active: z.boolean().optional().describe("Whether the job type is active")
},
async ({ tenant, name, businessUnitIds, skills, tagTypeIds, priority, duration, soldThreshold, class: classValue, summary, noCharge, enforceRecurringServiceEventSelection, invoiceSignaturesRequired, externalData, active }) => {
  try {
      const payload = {
          name: name,
          businessUnitIds: businessUnitIds,
          skills: skills,
          tagTypeIds: tagTypeIds,
          priority: priority,
          duration: duration,
          soldThreshold: soldThreshold,
          class: classValue,
          summary: summary,
          noCharge: noCharge,
          enforceRecurringServiceEventSelection: enforceRecurringServiceEventSelection,
          invoiceSignaturesRequired: invoiceSignaturesRequired,
          externalData: externalData,
          active: active
      };

      const response = await api.post(`/tenant/${tenant}/job-types`, payload);

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
server.tool("jobtypes_getlist",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  name: z.string().nullable().describe("Filters by job type name").optional(),
  minDuration: z.number().int().nullable().describe("Format - int32. Minimum length of time for this job type (in seconds)").optional(),
  maxDuration: z.number().int().nullable().describe("Format - int32. Maximum length of time for this job type (in seconds)").optional(),
  priority: z.string().nullable().describe("Level of urgency for this type of job").optional(),
  ids: z.string().nullable().describe("Perform lookup by multiple IDs (maximum 50)").optional(),
  page: z.number().int().nullable().describe("Format - int32. The logical number of page to return, starting from 1").optional(),
  pageSize: z.number().int().nullable().describe("Format - int32. How many records to return (50 by default)").optional(),
  includeTotal: z.boolean().nullable().describe("Whether total count should be returned").optional(),
  active: z.string().nullable().describe("What kind of items should be returned (only active items will be returned by default)\\\nValues: [True, Any, False]").optional(),
  orderBy: z.string().nullable().describe('Orders results by a field. Supported fields are "id", "modifiedOn", and "createdOn"').optional(),
  orderByDirection: z.string().nullable().describe('Specifies order direction of results. Supported values are "asc"/"ascending" and "desc"/"descending"').optional(),
  createdBefore: z.string().datetime().nullable().describe('Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)').optional(),
  createdOnOrAfter: z.string().datetime().nullable().describe('Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)').optional(),
  modifiedBefore: z.string().datetime().nullable().describe('Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)').optional(),
  modifiedOnOrAfter: z.string().datetime().nullable().describe('Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)').optional(),
  externalDataApplicationGuid: z.string().uuid().nullable().describe("Format - guid. If this guid is provided, external data corresponding to\nthis application guid will be returned.").optional()
},
async ({ tenant, name, minDuration, maxDuration, priority, ids, page, pageSize, includeTotal, active, orderBy, orderByDirection, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, externalDataApplicationGuid }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/job-types`, {
          params: {
              name: name,
              minDuration: minDuration,
              maxDuration: maxDuration,
              priority: priority,
              ids: ids,
              page: page,
              pageSize: pageSize,
              includeTotal: includeTotal,
              active: active,
              orderBy: orderBy,
              orderByDirection: orderByDirection,
              createdBefore: createdBefore,
              createdOnOrAfter: createdOnOrAfter,
              modifiedBefore: modifiedBefore,
              modifiedOnOrAfter: modifiedOnOrAfter,
              externalDataApplicationGuid: externalDataApplicationGuid
          }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Projects Get
server.tool("projects_get",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  externalDataApplicationGuid: z.string().uuid().optional().describe("Format - guid. If this guid is provided, external data corresponding to\nthis application guid will be returned.")
},
async ({ id, tenant, externalDataApplicationGuid }) => {
  try {
  const response = await api.get(`/tenant/${tenant}/projects/${id}`, {
      params: { externalDataApplicationGuid }
  });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: JobTypes Update
server.tool(
"jobtypes_update",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  name: z.string().optional(),
  businessUnitIds: z.array(z.number().int()).optional(),
  skills: z.array(z.string()).optional(),
  tagTypeIds: z.array(z.number().int()).optional(),
  priority: z.string().optional(),
  duration: z.number().optional(),
  soldThreshold: z.number().optional(),
  class: z.string().optional(),
  summary: z.string().optional(),
  noCharge: z.boolean().optional(),
  enforceRecurringServiceEventSelection: z.boolean().optional(),
  invoiceSignaturesRequired: z.boolean().optional(),
  externalData: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  active: z.boolean().optional()
},
async ({ id, tenant, name, businessUnitIds, skills, tagTypeIds, priority, duration, soldThreshold, class: classValue, summary, noCharge, enforceRecurringServiceEventSelection, invoiceSignaturesRequired, externalData, active }) => {
  try {
      const payload: any = {};
      if (name !== undefined) payload.name = name;
      if (businessUnitIds !== undefined) payload.businessUnitIds = businessUnitIds;
      if (skills !== undefined) payload.skills = skills;
      if (tagTypeIds !== undefined) payload.tagTypeIds = tagTypeIds;
      if (priority !== undefined) payload.priority = priority;
      if (duration !== undefined) payload.duration = duration;
      if (soldThreshold !== undefined) payload.soldThreshold = soldThreshold;
      if (classValue !== undefined) payload.class = classValue;
      if (summary !== undefined) payload.summary = summary;
      if (noCharge !== undefined) payload.noCharge = noCharge;
      if (enforceRecurringServiceEventSelection !== undefined) payload.enforceRecurringServiceEventSelection = enforceRecurringServiceEventSelection;
      if (invoiceSignaturesRequired !== undefined) payload.invoiceSignaturesRequired = invoiceSignaturesRequired;
      if (externalData !== undefined) payload.externalData = externalData;
      if (active !== undefined) payload.active = active;

      const response = await api.patch(`/tenant/${tenant}/job-types/${id}`, payload);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Projects Create
server.tool("projects_create",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ tenant }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/projects`);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Projects Update
server.tool("projects_update",
{
  id: z.number().int().describe("Format - int64. Project ID"),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  number: z.string().optional().describe("Project Number"),
  name: z.string().optional().describe("Project Name"),
  summary: z.string().optional().describe("Project Summary"),
  status: z.string().optional().describe("Project Status"),
  statusId: z.number().int().optional().describe("Project Status ID"),
  subStatus: z.string().optional().describe("Project Sub Status"),
  subStatusId: z.number().int().optional().describe("Project Sub Status ID"),
  customerId: z.number().int().optional().describe("Customer ID"),
  locationId: z.number().int().optional().describe("Location ID"),
  projectTypeId: z.number().int().optional().describe("Project Type ID"),
  projectManagerIds: z.array(z.number().int()).optional().describe("Project Manager IDs"),
  businessUnitIds: z.array(z.number().int()).optional().describe("Business Unit IDs"),
  startDate: z.string().optional().describe("Project Start Date"),
  targetCompletionDate: z.string().optional().describe("Project Target Completion Date"),
  actualCompletionDate: z.string().optional().describe("Project Actual Completion Date"),
  customFields: z.array(z.object({
      typeId: z.number().int().optional(),
      name: z.string().optional(),
      value: z.string().optional()
  })).optional().describe("Custom Fields"),
  externalData: z.array(z.object({
      key: z.string().optional(),
      value: z.string().optional()
  })).optional().describe("External Data"),
  jobIds: z.array(z.number().int()).optional().describe("Job IDs")
},
async ({ id, tenant, number, name, summary, status, statusId, subStatus, subStatusId, customerId, locationId, projectTypeId, projectManagerIds, businessUnitIds, startDate, targetCompletionDate, actualCompletionDate, customFields, externalData, jobIds }) => {
  try {
      const payload = {
          number,
          name,
          summary,
          status,
          statusId,
          subStatus,
          subStatusId,
          customerId,
          locationId,
          projectTypeId,
          projectManagerIds,
          businessUnitIds,
          startDate,
          targetCompletionDate,
          actualCompletionDate,
          customFields,
          externalData,
          jobIds
      };

      const response = await api.patch(`/tenant/${tenant}/projects/${id}`, payload);

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
server.tool("projects_get_list",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  ids: z.string().optional().nullable().describe("Perform lookup by multiple IDs (maximum 50)"),
  customerId: z.number().int().optional().nullable().describe("Format - int64. Filters by customer ID"),
  locationId: z.number().int().optional().nullable().describe("Format - int64. Filters by location ID"),
  projectTypeId: z.number().int().optional().nullable().describe("Format - int64. Return projects if it contains the specified project type"),
  invoiceId: z.number().int().optional().nullable().describe("Format - int64. Return projects if it contains the specified invoice"),
  technicianId: z.number().int().optional().nullable().describe("Format - int64. Return project if technician is assigned to any appointments on any job in the project"),
  jobId: z.number().int().optional().nullable().describe("Format - int64. Return project if it contains the specified job"),
  appointmentId: z.number().int().optional().nullable().describe("Format - int64. Return project if it contains the specified appointment in the project's jobs"),
  projectManagerIds: z.string().optional().nullable().describe("Filters by id of managers for matching project"),
  businessUnitIds: z.string().optional().nullable().describe("Returns projects which have at least one of the provided business units assigned "),
  createdBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
  createdOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
  startsBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return projects that start before date"),
  startsOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return projects that start on or after date"),
  completedBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return projects that are completed before date"),
  completedOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return projects that are completed on or after date"),
  targetCompletionDateBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return projects whose target completion date is before date"),
  targetCompletionDateOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return projects whose target completion date is on or after date"),
  modifiedBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return projects whose last modification date is before date"),
  modifiedOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return projects whose last modification date is on or after date"),
  page: z.number().int().optional().nullable().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().nullable().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().nullable().describe("Whether total count should be returned"),
  status: z.string().optional().nullable().describe("Returns projects which have one of the provided statuses.\n\"None\" could be passed as one of the values to include projects without a status in the resulting collection."),
  sort: z.string().optional().nullable().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn, Name, TargetCompletionDate."),
  externalDataApplicationGuid: z.string().uuid().optional().nullable().describe("Format - guid. If this guid is provided, external data corresponding to\nthis application guid will be returned."),
  externalDataKey: z.string().optional().nullable().describe("Performs lookup by external data key, 'externalDataValues' must also be provided."),
  externalDataValues: z.string().optional().nullable().describe("Performs lookup by external data values (maximum 50), 'externalDataKey' must also be provided.")
},
async ({ tenant, ids, customerId, locationId, projectTypeId, invoiceId, technicianId, jobId, appointmentId, projectManagerIds, businessUnitIds, createdBefore, createdOnOrAfter, startsBefore, startsOnOrAfter, completedBefore, completedOnOrAfter, targetCompletionDateBefore, targetCompletionDateOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, status, sort, externalDataApplicationGuid, externalDataKey, externalDataValues }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/projects`, {
          params: {
              ids: ids || undefined,
              customerId: customerId || undefined,
              locationId: locationId || undefined,
              projectTypeId: projectTypeId || undefined,
              invoiceId: invoiceId || undefined,
              technicianId: technicianId || undefined,
              jobId: jobId || undefined,
              appointmentId: appointmentId || undefined,
              projectManagerIds: projectManagerIds || undefined,
              businessUnitIds: businessUnitIds || undefined,
              createdBefore: createdBefore || undefined,
              createdOnOrAfter: createdOnOrAfter || undefined,
              startsBefore: startsBefore || undefined,
              startsOnOrAfter: startsOnOrAfter || undefined,
              completedBefore: completedBefore || undefined,
              completedOnOrAfter: completedOnOrAfter || undefined,
              targetCompletionDateBefore: targetCompletionDateBefore || undefined,
              targetCompletionDateOnOrAfter: targetCompletionDateOnOrAfter || undefined,
              modifiedBefore: modifiedBefore || undefined,
              modifiedOnOrAfter: modifiedOnOrAfter || undefined,
              page: page || undefined,
              pageSize: pageSize || undefined,
              includeTotal: includeTotal || undefined,
              status: status || undefined,
              sort: sort || undefined,
              externalDataApplicationGuid: externalDataApplicationGuid || undefined,
              externalDataKey: externalDataKey || undefined,
              externalDataValues: externalDataValues || undefined
          }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Projects GetNotes
server.tool("projects_get_notes",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned")
},
async ({ id, tenant, page, pageSize, includeTotal }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/projects/${id}/notes`, {
          params: { page, pageSize, includeTotal }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Projects CreateNote
server.tool("projects_create_note",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  text: z.string().describe("Note text"),
  isPinned: z.boolean().optional().describe("Whether the note is pinned")
},
async ({ id, tenant, text, isPinned }) => {
  try {
      const response = await api.post(`/tenant/${tenant}/projects/${id}/notes`, {
          text: text,
          isPinned: isPinned
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Projects AttachJob
server.tool("projects_attach_job",
{
  id: z.number().int().describe("Format - int64."),
  jobId: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, jobId, tenant }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/projects/${id}/attach-job/${jobId}`);
  return {
      content: [{ type: "text", text: "Job attached successfully." }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Projects Detach Job
server.tool(
"projects_detach_job",
{
  jobId: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ jobId, tenant }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/projects/detach-job/${jobId}`);
  return {
      content: [{ type: "text", text: "Job detached successfully." }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Projects CreateMessage
server.tool("projects_create_message",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  message: z.string().describe("The message to create")
},
async ({ id, tenant, message }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/projects/${id}/messages`, { message });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: ProjectStatuses_Get
server.tool(
  "ProjectStatuses_Get",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/project-statuses/${id}`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: projects_get_custom_field_types
server.tool(
  "projects_get_custom_field_types",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      sort: z.string().optional()
  },
  async ({ tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
      try {
          const endpoint = `/tenant/${tenant}/projects/custom-fields`;
          const response = await api.get(endpoint, {
              params: {
                  page,
                  pageSize,
                  includeTotal,
                  createdBefore,
                  createdOnOrAfter,
                  modifiedBefore,
                  modifiedOnOrAfter,
                  sort
              }
          });

          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: ProjectStatuses_GetList
server.tool("ProjectStatuses_GetList",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  name: z.string().nullable().optional().describe("Filters by project status name"),
  ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
  page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
  sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, Name, Order, ModifiedOn, CreatedOn."),
  createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
  createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
  modifiedBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
  modifiedOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)")
},
async ({ tenant, name, ids, page, pageSize, includeTotal, sort, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter }) => {
  try {
      const endpoint = `/tenant/${tenant}/project-statuses`;
      const response = await api.get(endpoint, {
          params: {
              name: name,
              ids: ids,
              page: page,
              pageSize: pageSize,
              includeTotal: includeTotal,
              sort: sort,
              createdBefore: createdBefore,
              createdOnOrAfter: createdOnOrAfter,
              modifiedBefore: modifiedBefore,
              modifiedOnOrAfter: modifiedOnOrAfter
          }
      });

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: ProjectSubStatuses_Get
server.tool("project_substatuses_get",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/project-substatuses/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: ProjectTypes Get
server.tool("project_types_get",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
  const response = await api.get(`/tenant/${tenant}/project-types/${id}`);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Project SubStatuses Get List
server.tool(
  "project_sub_statuses_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      name: z.string().nullable().optional().describe("Filters by project sub status name"),
      statusId: z.number().int().nullable().optional().describe("Format - int64. Filters by parent project status id"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, Name, Order, StatusId, ModifiedOn, CreatedOn."),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      active: z.string().nullable().optional().describe("What kind of items should be returned (active items will be returned by default)\nValues: [True, Any, False]")
  },
  async ({ tenant, name, statusId, ids, page, pageSize, includeTotal, sort, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, active }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/project-substatuses`, {
              params: {
                  name: name || undefined,
                  statusId: statusId || undefined,
                  ids: ids || undefined,
                  page: page || undefined,
                  pageSize: pageSize || undefined,
                  includeTotal: includeTotal || undefined,
                  sort: sort || undefined,
                  createdBefore: createdBefore || undefined,
                  createdOnOrAfter: createdOnOrAfter || undefined,
                  modifiedBefore: modifiedBefore || undefined,
                  modifiedOnOrAfter: modifiedOnOrAfter || undefined,
                  active: active || undefined
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: ProjectTypes_GetList
server.tool(
"project_types_get_list",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned")
},
async ({ tenant, page, pageSize, includeTotal }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/project-types`, {
          params: { page, pageSize, includeTotal }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);

// Tool: Attributed Leads Get
server.tool(
  "attributed_leads_get",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      fromUtc: z.string().datetime().describe("Format - date-time (as date-time in RFC3339). Gets or sets the start date and time in UTC for the filtering period."),
      toUtc: z.string().datetime().describe("Format - date-time (as date-time in RFC3339). Gets or sets the end date and time in UTC for the filtering period."),
      leadType: z.enum(["Call", "WebBooking", "WebLeadForm", "ManualJob"]).nullable().optional().describe("Gets or sets the type of lead for filtering purposes. Possible values are: LeadType.Call, LeadType.WebBooking, LeadType.WebLeadForm, LeadType.ManualJob. If null, data for all lead types is returned."),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
  },
  async ({ tenant, fromUtc, toUtc, leadType, page, pageSize, includeTotal }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/attributed-leads`, {
              params: {
                  fromUtc,
                  toUtc,
                  leadType,
                  page,
                  pageSize,
                  includeTotal
              }
          });

          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: CapacityAwarenessWarning_Get
server.tool(
"CapacityAwarenessWarning_Get",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ tenant }) => {
  try {
  const response = await api.get(`/tenant/${tenant}/capacity-warnings`);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: ExternalCallAttributions Create
server.tool(
"external_call_attributions_create",
{
  tenant: z.number().int().describe("Tenant ID (int64)"),
},
async ({ tenant }) => {
  try {
      const response = await api.post(`/tenant/${tenant}/external-call-attributions`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
      };
  }
}
);
// Tool: ScheduledJobAttributions_Create
server.tool(
  "scheduled_job_attributions_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
  },
  async ({ tenant }) => {
      try {
          const response = await api.post(`/tenant/${tenant}/job-attributions`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }],
          };
      }
  }
);
// Tool: Performance_Get
server.tool("performance_get",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  fromUtc: z.string().datetime().describe("Format - date-time (as date-time in RFC3339). Gets or sets the start date and time in UTC for the filtering period."),
  toUtc: z.string().datetime().describe("Format - date-time (as date-time in RFC3339). Gets or sets the end date and time in UTC for the filtering period."),
  performanceSegmentationType: z.enum(["Campaign", "AdGroup", "Keyword"]).describe("Gets or sets the type of performance segmentation for filtering purposes."),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned")
},
async ({ tenant, fromUtc, toUtc, performanceSegmentationType, page, pageSize, includeTotal }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/performance`, {
          params: {
              fromUtc,
              toUtc,
              performanceSegmentationType,
              page,
              pageSize,
              includeTotal
          }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: WebBookingAttributions Create
server.tool("web_booking_attributions_create",
{
  tenant: z.number().int().describe("Tenant ID (int64)"),
},
async ({ tenant }) => {
  try {
      const response = await api.post(`/tenant/${tenant}/web-booking-attributions`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: WebLeadFormAttributions_Create
server.tool("web_lead_form_attributions_create",
{
  tenant: z.number().int().describe("Tenant ID (int64)")
},
async ({ tenant }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/web-lead-form-attributions`);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);

// Tool: reviews
server.tool("reviews",
  {
      tenant: z.string().describe("The tenant identifier."),
      page: z.number().int().optional().describe("Format - int32."),
      pageSize: z.number().int().optional().describe("Format - int32."),
      includeTotal: z.boolean().optional(),
      search: z.string().optional(),
      reportType: z.number().int().optional().describe("Format - int32."),
      sort: z.string().optional(),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      fromDate: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      toDate: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      responseTypes: z.array(z.string()).optional(),
      locationIds: z.array(z.number().int()).optional(),
      sources: z.array(z.string()).optional(),
      reviewStatuses: z.array(z.string()).optional(),
      technicianIds: z.array(z.number().int()).optional(),
      campaignIds: z.array(z.number().int()).optional(),
      fromRating: z.number().optional().describe("Format - float."),
      toRating: z.number().optional().describe("Format - float."),
      includeReviewsWithoutLocation: z.boolean().optional(),
      includeReviewsWithoutCampaign: z.boolean().optional(),
      includeReviewsWithoutTechnician: z.boolean().optional()
  },
  async ({ tenant, page, pageSize, includeTotal, search, reportType, sort, createdOnOrAfter, createdBefore, modifiedOnOrAfter, modifiedBefore, fromDate, toDate, responseTypes, locationIds, sources, reviewStatuses, technicianIds, campaignIds, fromRating, toRating, includeReviewsWithoutLocation, includeReviewsWithoutCampaign, includeReviewsWithoutTechnician }) => {
      try {
          const endpoint = `/tenant/${tenant}/reviews`;
          const response = await api.get(endpoint, {
              params: {
                  page,
                  pageSize,
                  includeTotal,
                  search,
                  reportType,
                  sort,
                  createdOnOrAfter,
                  createdBefore,
                  modifiedOnOrAfter,
                  modifiedBefore,
                  fromDate,
                  toDate,
                  responseTypes: responseTypes ? responseTypes.join(',') : undefined,
                  locationIds: locationIds ? locationIds.join(',') : undefined,
                  sources: sources ? sources.join(',') : undefined,
                  reviewStatuses: reviewStatuses ? reviewStatuses.join(',') : undefined,
                  technicianIds: technicianIds ? technicianIds.join(',') : undefined,
                  campaignIds: campaignIds ? campaignIds.join(',') : undefined,
                  fromRating,
                  toRating,
                  includeReviewsWithoutLocation,
                  includeReviewsWithoutCampaign,
                  includeReviewsWithoutTechnician
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );

  // Tool: CampaignCategories_Create
server.tool(
  "campaign_categories_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ tenant }) => {
      try {
          const response = await api.post(`/tenant/${tenant}/categories`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: campaign_categories_get_list
server.tool("campaign_categories_get_list",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
  createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
  createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
  sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, CreatedOn, Name")
},
async ({ tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, sort }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/categories`, {
          params: {
              page: page,
              pageSize: pageSize,
              includeTotal: includeTotal,
              createdBefore: createdBefore,
              createdOnOrAfter: createdOnOrAfter,
              sort: sort
          }
      });

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: CampaignCategories Get
server.tool("campaign_categories_get",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/categories/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: CampaignCategories_Update
server.tool(
  "campaign_categories_update",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
  },
  async ({ id, tenant }) => {
      try {
          const response = await api.patch(`/tenant/${tenant}/categories/${id}`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: Campaign Costs Get List
server.tool(
"campaign_costs_get_list",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
  year: z.number().int().optional().describe("Format - int32. Year"),
  month: z.number().int().optional().describe("Format - int32. Month"),
  campaignId: z.number().int().optional().describe("Format - int64. Campaign ID"),
  sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, Date (Year + Month)"),
},
async ({ tenant, page, pageSize, includeTotal, year, month, campaignId, sort }) => {
  try {
    const response = await api.get(`/tenant/${tenant}/costs`, {
      params: {
        page,
        pageSize,
        includeTotal,
        year,
        month,
        campaignId,
        sort,
      },
    });

    return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
    };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
    };
  }
}
);
// Tool: CampaignCosts Create
server.tool("campaign_costs_create",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  year: z.number().int().describe("Year"),
  month: z.number().int().describe("Month"),
  dailyCost: z.number().describe("Daily Cost"),
  campaignId: z.number().int().describe("Campaign ID")
},
async ({ tenant, year, month, dailyCost, campaignId }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/costs`, {
      year,
      month,
      dailyCost,
      campaignId
  });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: CampaignCosts Get
server.tool("campaign_costs_get",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/costs/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: CampaignCosts_Update
server.tool("campaign_costs_update",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  payload: z.record(z.any()).optional().describe("The payload to update costs"),
},
async ({ id, tenant, payload }) => {
  try {
      const endpoint = `/tenant/${tenant}/costs/${id}`;
      const response = await api.patch(endpoint, payload);

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Campaigns Create
server.tool("campaigns_create",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  name: z.string().describe("Campaign name"),
  source: z.string().optional().describe("Campaign source"),
  otherSource: z.string().optional().describe("Other campaign source"),
  businessUnit: z.string().optional().describe("Business unit"),
  medium: z.string().optional().describe("Campaign medium"),
  otherMedium: z.string().optional().describe("Other campaign medium"),
  campaignPhoneNumbers: z.array(z.string()).optional().describe("List of campaign phone numbers")
},
async ({ tenant, name, source, otherSource, businessUnit, medium, otherMedium, campaignPhoneNumbers }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/campaigns`, {
      name: name,
      source: source,
      otherSource: otherSource,
      businessUnit: businessUnit,
      medium: medium,
      otherMedium: otherMedium,
      campaignPhoneNumbers: campaignPhoneNumbers
  });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Campaigns Get
server.tool("campaigns_get",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/campaigns/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Campaigns GetList
server.tool("campaigns_get_list",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
  modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
  modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
  active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
  ids: z.string().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
  name: z.string().optional().describe("Filters records by name (case-insensitive 'contains' operation)"),
  createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
  createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
  campaignPhoneNumber: z.string().optional().describe("Filters campaigns by phone number (as string)."),
  sort: z.string().optional().describe("Applies sorting by the specified field:\n'?sort=+FieldName' for ascending order,\n'?sort=-FieldName' for descending order.\n\nAvailable fields are: Id, Name, CreatedOn, ModifiedOn")
},
async ({ tenant, page, pageSize, includeTotal, modifiedBefore, modifiedOnOrAfter, active, ids, name, createdBefore, createdOnOrAfter, campaignPhoneNumber, sort }) => {
  try {
      const endpoint = `/tenant/${tenant}/campaigns`;
      const response = await api.get(endpoint, {
          params: {
              page: page,
              pageSize: pageSize,
              includeTotal: includeTotal,
              modifiedBefore: modifiedBefore,
              modifiedOnOrAfter: modifiedOnOrAfter,
              active: active,
              ids: ids,
              name: name,
              createdBefore: createdBefore,
              createdOnOrAfter: createdOnOrAfter,
              campaignPhoneNumber: campaignPhoneNumber,
              sort: sort
          }
      });

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Campaigns Update
server.tool("campaigns_update",
{
  id: z.number().int().describe("Format - int64. Campaign ID"),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  name: z.string().optional().describe("Campaign Name"),
  active: z.boolean().optional().describe("Is Campaign Active?"),
  source: z.string().optional().describe("Campaign Source"),
  otherSource: z.string().optional().describe("Other Campaign Source"),
  businessUnit: z.string().optional().describe("Business Unit"),
  medium: z.string().optional().describe("Campaign Medium"),
  otherMedium: z.string().optional().describe("Other Campaign Medium"),
  campaignPhoneNumbers: z.array(z.string()).optional().describe("Campaign Phone Numbers")
},
async ({ id, tenant, name, active, source, otherSource, businessUnit, medium, otherMedium, campaignPhoneNumbers }) => {
  try {
      const payload = {
          name: name,
          active: active,
          source: source,
          otherSource: otherSource,
          businessUnit: businessUnit,
          medium: medium,
          otherMedium: otherMedium,
          campaignPhoneNumbers: campaignPhoneNumbers
      };

      const response = await api.patch(`/tenant/${tenant}/campaigns/${id}`, payload);

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Campaigns GetCosts
server.tool("campaigns_getcosts",
{
  id: z.number().int().describe("Format - int64."),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
  year: z.number().int().optional().describe("Format - int32."),
  month: z.number().int().optional().describe("Format - int32."),
  sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, Date (Year + Month)")
},
async ({ id, tenant, page, pageSize, includeTotal, year, month, sort }) => {
  try {
  const response = await api.get(`/tenant/${tenant}/campaigns/${id}/costs`, {
      params: { page, pageSize, includeTotal, year, month, sort }
  });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Suppressions_GetList
server.tool(
  "suppressions_getlist",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned")
  },
  async ({ tenant, page, pageSize, includeTotal }) => {
      try {
          let endpoint = `/tenant/${tenant}/suppressions`;
          const params: { [key: string]: any } = {};

          if (page !== undefined) {
              params.page = page;
          }
          if (pageSize !== undefined) {
              params.pageSize = pageSize;
          }
          if (includeTotal !== undefined) {
              params.includeTotal = includeTotal;
          }

          const response = await api.get(endpoint, { params: params });

          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: Suppressions Get
server.tool("suppressions_get",
{
  email: z.string().email().describe("Format - email."),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ email, tenant }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/suppressions/${email}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Suppressions Remove
server.tool("suppressions_remove",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ tenant }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/suppressions/unsuppress`);
  return {
      content: [{ type: "text", text: String("The request has succeeded") }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Suppressions Add
server.tool(
"suppressions_add",
{
  tenant: z.number().int().describe("Tenant ID"),
  email: z.string().email().describe("Email address to suppress"),
  group_id: z.number().int().optional().describe("The suppression group ID"),
  reason: z.string().optional().describe("Reason for suppression")
},
async ({ tenant, email, group_id, reason }) => {
  try {
  const endpoint = `/tenant/${tenant}/suppressions/suppress`;
  const payload = {
      email: email,
      group_id: group_id,
      reason: reason
  };

  await api.post(endpoint, payload);

  return {
      content: [{ type: "text", text: "Suppression added successfully." }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);

// Tool: customer_memberships_get_list
server.tool("customer_memberships_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      customerIds: z.string().nullable().optional().describe("Filters by customer IDs"),
      status: z.string().nullable().optional().describe("Filters by membership status\nValues: [Active, Suspended, Expired, Canceled, Deleted]"),
      duration: z.number().int().nullable().optional().describe("Format - int32. Filters by membership duration (in months); use null for ongoing memberships"),
      billingFrequency: z.string().nullable().optional().describe("Filters by membership billing frequency\nValues: [OneTime, Monthly, EveryOtherMonth, Quarterly, BiAnnual, Annual]"),
      active: z.string().nullable().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned")
  },
  async ({ tenant, ids, customerIds, status, duration, billingFrequency, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal }) => {
      try {
          const endpoint = `/tenant/${tenant}/memberships`;
          const response = await api.get(endpoint, {
              params: {
                  ids: ids || undefined,
                  customerIds: customerIds || undefined,
                  status: status || undefined,
                  duration: duration || undefined,
                  billingFrequency: billingFrequency || undefined,
                  active: active || undefined,
                  createdBefore: createdBefore || undefined,
                  createdOnOrAfter: createdOnOrAfter || undefined,
                  modifiedBefore: modifiedBefore || undefined,
                  modifiedOnOrAfter: modifiedOnOrAfter || undefined,
                  page: page || undefined,
                  pageSize: pageSize || undefined,
                  includeTotal: includeTotal || undefined
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: customer_memberships_get_custom_fields
  server.tool(
      "customer_memberships_get_custom_fields",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
          pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
          includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
          createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
          createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
          modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
          modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
          sort: z.string().optional().describe("Applies sorting by specified fields"),
      },
      async ({ tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/memberships/custom-fields`, {
                  params: {
                      page,
                      pageSize,
                      includeTotal,
                      createdBefore,
                      createdOnOrAfter,
                      modifiedBefore,
                      modifiedOnOrAfter,
                      sort,
                  },
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: CustomerMemberships_Get
  server.tool("customer_memberships_get",
  {
      id: z.number().int().describe("Format - int64. Customer membership ID"),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/memberships/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: CustomerMemberships_Update
  server.tool(
      "CustomerMemberships_Update",
      {
          id: z.number().int().describe("Format - int64. Customer membership ID"),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
      },
      async ({ id, tenant }) => {
          try {
              const response = await api.patch(`/tenant/${tenant}/memberships/${id}`);
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: CustomerMemberships_Create
  server.tool("customer_memberships_create",
  {
      tenant: z.number().int().describe("Tenant ID"),
      payload: z.object({}).optional().describe("Request Payload")
  },
  async ({ tenant, payload }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/memberships/sale`, payload);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: customer_memberships_get_status_changes
  server.tool(
      "customer_memberships_get_status_changes",
      {
          id: z.number().int().describe("Format - int64. Customer membership ID"),
          tenant: z.number().int().describe("Format - int64. Tenant ID")
      },
      async ({ id, tenant }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/memberships/${id}/status-changes`);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Export_MembershipTypes
  server.tool("Export_MembershipTypes",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/export/membership-types`, {
          params: { from, includeRecentChanges }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Export Memberships
  server.tool("export_memberships",
  {
      tenant: z.number().int().describe("Tenant ID"),
      from: z.string().optional().describe("Continuation token or custom date string"),
      includeRecentChanges: z.boolean().optional().describe("Include recent changes quicker")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
      let endpoint = `/tenant/${tenant}/export/memberships`;
      const params: { [key: string]: any } = {};
  
      if (from) {
          params.from = from;
      }
      if (includeRecentChanges !== undefined) {
          params.includeRecentChanges = includeRecentChanges;
      }
  
      const response = await api.get(endpoint, { params: params });
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Export Recurring Service Types
  server.tool(
      "export_recurring_service_types",
      {
          tenant: z.number().int().describe("Tenant ID"),
          from: z.string().nullable().optional().describe("Continuation token received from previous export request."),
          includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.")
      },
      async ({ tenant, from, includeRecentChanges }) => {
          try {
              let endpoint = `/tenant/${tenant}/export/recurring-service-types`;
              const params: { [key: string]: any } = {};
  
              if (from !== undefined) {
                  params.from = from;
              }
              if (includeRecentChanges !== undefined) {
                  params.includeRecentChanges = includeRecentChanges;
              }
  
              const response = await api.get(endpoint, { params });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Export_InvoiceTemplates
  server.tool("Export_InvoiceTemplates",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      from: z.string().optional().nullable().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
      includeRecentChanges: z.boolean().optional().nullable().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/export/invoice-templates`, {
          params: { from, includeRecentChanges }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Export Location Recurring Service Events
  server.tool(
      "export_location_recurring_service_events",
      {
          tenant: z.number().int().describe("Tenant ID"),
          from: z.string().optional().describe("Continuation token or date string"),
          includeRecentChanges: z.boolean().optional().describe("Include recent changes quickly")
      },
      async ({ tenant, from, includeRecentChanges }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/export/recurring-service-events`, {
                  params: {
                      from,
                      includeRecentChanges
                  }
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Export Location Recurring Services
  server.tool(
      "export_location_recurring_services",
      {
          tenant: z.number().int().describe("Tenant ID"),
          from: z.string().nullable().optional().describe("Continuation token from previous export. Use custom date strings, e.g. \"2020-01-01\" to start from a certain time."),
          includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to receive recent changes quicker. May cause duplicate results.")
      },
      async ({ tenant, from, includeRecentChanges }) => {
          try {
              const endpoint = `/tenant/${tenant}/export/recurring-services`;
              const response = await api.get(endpoint, {
                  params: {
                      from: from || undefined,
                      includeRecentChanges: includeRecentChanges || undefined
                  }
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Export Membership Status Changes
  server.tool("Export_MembershipStatusChanges",
  {
      tenant: z.number().int().describe("Tenant ID"),
      from: z.string().optional().describe("Continuation token or custom date string"),
      includeRecentChanges: z.boolean().optional().describe("Include recent changes quickly")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/export/membership-status-changes`, {
              params: { from, includeRecentChanges }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: InvoiceTemplates Create
  server.tool("invoice_templates_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.record(z.any()).describe("The payload to send in the request body")
  },
  async ({ tenant, payload }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/invoice-templates`, payload);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: InvoiceTemplates Get
  server.tool(
  "invoice_templates_get",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      id: z.number().int().describe("Format - int64. Invoice template ID")
  },
  async ({ tenant, id }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/invoice-templates/${id}`);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: InvoiceTemplates_Update
  server.tool("invoice_templates_update",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      id: z.number().int().describe("Format - int64. Invoice template ID"),
      payload: z.record(z.any()).optional().describe("Invoice template update payload")
  },
  async ({ tenant, id, payload }) => {
      try {
      const response = await api.patch(`/tenant/${tenant}/invoice-templates/${id}`, payload);
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: LocationRecurringServiceEvents_MarkComplete
  server.tool("location_recurring_service_events_mark_complete",
  {
      id: z.number().int().describe("Recurring service event ID"),
      tenant: z.number().int().describe("Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
          const response = await api.post(`/tenant/${tenant}/recurring-service-events/${id}/mark-complete`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: LocationRecurringServiceEvents_MarkIncomplete
  server.tool("location_recurring_service_events_mark_incomplete",
  {
      id: z.number().int().describe("Format - int64. Recurring service event ID"),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
          const response = await api.post(`/tenant/${tenant}/recurring-service-events/${id}/mark-incomplete`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Location Recurring Service Events Get List
  server.tool(
    "location_recurring_service_events_get_list",
    {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      locationId: z.number().int().nullable().optional().describe("Format - int64. Location ID"),
      jobId: z.number().int().nullable().optional().describe("Format - int64. Job ID"),
      status: z.string().nullable().optional().describe("Follow up status Values: [NotAttempted, Unreachable, Contacted, Won, Dismissed]"),
      createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
    },
    async ({
      tenant,
      ids,
      locationId,
      jobId,
      status,
      createdBefore,
      createdOnOrAfter,
      page,
      pageSize,
      includeTotal,
    }) => {
      try {
        let endpoint = `/tenant/${tenant}/recurring-service-events`;
        const params: { [key: string]: any } = {};
  
        if (ids) {
          params.ids = ids;
        }
        if (locationId) {
          params.locationId = locationId;
        }
        if (jobId) {
          params.jobId = jobId;
        }
        if (status) {
          params.status = status;
        }
        if (createdBefore) {
          params.createdBefore = createdBefore;
        }
        if (createdOnOrAfter) {
          params.createdOnOrAfter = createdOnOrAfter;
        }
        if (page) {
          params.page = page;
        }
        if (pageSize) {
          params.pageSize = pageSize;
        }
        if (includeTotal) {
          params.includeTotal = includeTotal;
        }
  
        const response = await api.get(endpoint, {
          params: params,
        });
  
        return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
        };
      }
    }
  );
  // Tool: Location Recurring Services Get
  server.tool(
      "location_recurring_services_get",
      {
          id: z.number().int().describe("Recurring service ID"),
          tenant: z.number().int().describe("Tenant ID"),
      },
      async ({ id, tenant }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/recurring-services/${id}`);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: LocationRecurringServices_Update
  server.tool(
      "location_recurring_services_update",
      {
          id: z.number().int().describe("Recurring service ID"),
          tenant: z.number().int().describe("Tenant ID"),
          payload: z.record(z.any()).optional().describe("The request payload"),
      },
      async ({ id, tenant, payload }) => {
          try {
              const endpoint = `/tenant/${tenant}/recurring-services/${id}`;
              const response = await api.patch(endpoint, payload);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: location_recurring_services_get_list
  server.tool("location_recurring_services_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      membershipIds: z.string().nullable().optional().describe("Filters by customer membership IDs"),
      locationIds: z.string().nullable().optional().describe("Filters by location IDs"),
      active: z.string().nullable().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned")
  },
  async ({ tenant, ids, membershipIds, locationIds, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal }) => {
      try {
          let endpoint = `/tenant/${tenant}/recurring-services`;
          const params = new URLSearchParams();
          if (ids) params.append("ids", ids);
          if (membershipIds) params.append("membershipIds", membershipIds);
          if (locationIds) params.append("locationIds", locationIds);
          if (active) params.append("active", active);
          if (createdBefore) params.append("createdBefore", createdBefore);
          if (createdOnOrAfter) params.append("createdOnOrAfter", createdOnOrAfter);
          if (modifiedBefore) params.append("modifiedBefore", modifiedBefore);
          if (modifiedOnOrAfter) params.append("modifiedOnOrAfter", modifiedOnOrAfter);
          if (page) params.append("page", String(page));
          if (pageSize) params.append("pageSize", String(pageSize));
          if (includeTotal) params.append("includeTotal", String(includeTotal));
  
          if (params.toString()) {
              endpoint += `?${params.toString()}`;
          }
  
          const response = await api.get(endpoint);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: MembershipTypes Get
  server.tool(
      "membership_types_get",
      {
          id: z.number().int().describe("Format - int64. Membership type ID"),
          tenant: z.number().int().describe("Format - int64. Tenant ID")
      },
      async ({ id, tenant }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/membership-types/${id}`);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: MembershipTypes Get Recurring Service Items
  server.tool(
      "membership_types_get_recurring_service_items",
      {
          id: z.number().int().describe("Format - int64. Membership type ID"),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
      },
      async ({ id, tenant }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/membership-types/${id}/recurring-service-items`);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Membership Types Get Discounts List
  server.tool("membership_types_get_discounts_list",
  {
      id: z.number().int().describe("Membership type ID"),
      tenant: z.number().int().describe("Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/membership-types/${id}/discounts`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: membership_types_get_list
  server.tool(
      "membership_types_get_list",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
          active: z.string().nullable().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
          duration: z.number().int().nullable().optional().describe("Format - int32. Filters by membership duration (in months); use null for ongoing memberships"),
          billingFrequency: z.string().nullable().optional().describe("Filters by membership billing frequency\nValues: [OneTime, Monthly, EveryOtherMonth, Quarterly, BiAnnual, Annual]"),
          includeDurationBilling: z.boolean().nullable().optional().describe("Whether duration/billing should be included in the result"),
          createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
          createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
          modifiedBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
          modifiedOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
          page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
          pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
          includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      },
      async ({ tenant, ids, active, duration, billingFrequency, includeDurationBilling, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal }) => {
          try {
              const endpoint = `/tenant/${tenant}/membership-types`;
  
              const params = {
                  ids: ids || undefined,
                  active: active || undefined,
                  duration: duration || undefined,
                  billingFrequency: billingFrequency || undefined,
                  includeDurationBilling: includeDurationBilling || undefined,
                  createdBefore: createdBefore || undefined,
                  createdOnOrAfter: createdOnOrAfter || undefined,
                  modifiedBefore: modifiedBefore || undefined,
                  modifiedOnOrAfter: modifiedOnOrAfter || undefined,
                  page: page || undefined,
                  pageSize: pageSize || undefined,
                  includeTotal: includeTotal || undefined,
              };
  
              const response = await api.get(endpoint, { params: params });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: MembershipTypes Get Duration Billing List
  server.tool(
      "membership_types_get_duration_billing_list",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          id: z.number().int().describe("Format - int64. Membership type ID"),
          active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      },
      async ({ tenant, id, active }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/membership-types/${id}/duration-billing-items`, {
                  params: { active }
              });
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: RecurringServiceTypes_Get
  server.tool("recurring_service_types_get",
  {
      id: z.number().int().describe("Format - int64. Recurring service type ID"),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/recurring-service-types/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: recurring_service_types_get_list
  server.tool("recurring_service_types_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      membershipTypeId: z.number().int().optional().describe("Format - int64. Filters by membership type ID"),
      recurrenceType: z.string().optional().describe("Filters by recurrence type\nValues: [Weekly, Monthly, Seasonal, Daily, NthWeekdayOfMonth]"),
      durationType: z.string().optional().describe("Filters by duration type\nValues: [Continuous, NumberOfVisits]"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, Name, CreatedOn, ModifiedOn.")
  },
  async ({ tenant, ids, membershipTypeId, recurrenceType, durationType, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort }) => {
      try {
          const endpoint = `/tenant/${tenant}/recurring-service-types`;
          const response = await api.get(endpoint, {
              params: {
                  ids: ids,
                  membershipTypeId: membershipTypeId,
                  recurrenceType: recurrenceType,
                  durationType: durationType,
                  active: active,
                  createdBefore: createdBefore,
                  createdOnOrAfter: createdOnOrAfter,
                  modifiedBefore: modifiedBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter,
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  sort: sort
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );

  // Tool: Export Job Splits
server.tool("export_job_splits",
  {
      tenant: z.number().int().describe("Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token or custom date string"),
      includeRecentChanges: z.boolean().nullable().optional().describe("Include recent changes for quicker results")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/export/jobs/splits`, {
              params: { from, includeRecentChanges }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Export Timesheets
  server.tool(
      "Export_Timesheets",
      {
          tenant: z.number().int().describe("Tenant ID"),
          from: z.string().nullable().optional().describe("Continuation token or custom date string"),
          includeRecentChanges: z.boolean().nullable().optional().describe("Include recent changes quickly")
      },
      async ({ tenant, from, includeRecentChanges }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/export/jobs/timesheets`, {
                  params: { from, includeRecentChanges }
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Export_PayrollAdjustments
  server.tool(
      "export_payrolladjustments",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
          includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
      },
      async ({ tenant, from, includeRecentChanges }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/export/payroll-adjustments`, {
                  params: {
                      from: from || undefined, // Ensure null/undefined is passed if empty
                      includeRecentChanges: includeRecentChanges || undefined // Ensure null/undefined is passed if empty
                  }
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Export ActivityCodes
  server.tool("export_activitycodes",
  {
      tenant: z.number().int().describe("Tenant ID"),
      from: z.string().optional().describe("Continuation token or custom date string"),
      includeRecentChanges: z.boolean().optional().describe("Include recent changes quickly")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
      let endpoint = `/tenant/${tenant}/export/activity-codes`;
      const params: { [key: string]: any } = {};
      if (from) {
          params.from = from;
      }
      if (includeRecentChanges !== undefined) {
          params.includeRecentChanges = includeRecentChanges;
      }
  
      const response = await api.get(endpoint, {
          params: params
      });
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Export Timesheet Codes
  server.tool(
  "export_timesheetcodes",
  {
      tenant: z.number().int().describe("Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token or custom date string"),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use true to receive recent changes quicker"),
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
          let endpoint = `/tenant/${tenant}/export/timesheet-codes`;
          const params: { [key: string]: any } = {};
          if (from) {
              params.from = from;
          }
          if (includeRecentChanges !== undefined && includeRecentChanges !== null) {
              params.includeRecentChanges = includeRecentChanges;
          }
  
          const response = await api.get(endpoint, { params: params });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }],
          };
      }
  }
  );
  // Tool: Export_GrossPayItems
  server.tool("Export_GrossPayItems",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/export/gross-pay-items`, {
          params: { from, includeRecentChanges }
      });
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Export_PayrollSettings
  server.tool(
      "Export_PayrollSettings",
      {
          tenant: z.number().int().describe("Tenant ID"),
          from: z.string().nullable().optional().describe("Continuation token or date string"),
          includeRecentChanges: z.boolean().nullable().optional().describe("Include recent changes quicker")
      },
      async ({ tenant, from, includeRecentChanges }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/export/payroll-settings`, {
                  params: { from, includeRecentChanges }
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: GrossPayItems_Create
  server.tool(
  "GrossPayItems_Create",
  {
      tenant: z.number().int().describe("Tenant ID"),
      name: z.string().describe("The name of the gross pay item"),
      description: z.string().optional().describe("A description of the gross pay item"),
      amount: z.number().describe("The amount for the gross pay item"),
      is_active: z.boolean().optional().default(true).describe("Whether the gross pay item is active")
  },
  async ({ tenant, name, description, amount, is_active }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/gross-pay-items`, {
          name,
          description,
          amount,
          is_active
      });
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: GrossPayItems Update
  server.tool(
      "gross_pay_items_update",
      {
          id: z.number().int().describe("Format - int64. The gross pay item ID"),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          payload: z.record(z.any()).describe("The payload for the update request")
      },
      async ({ id, tenant, payload }) => {
          try {
              const response = await api.put(`/tenant/${tenant}/gross-pay-items/${id}`, payload);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: GrossPayItems Delete
  server.tool("gross_pay_items_delete",
  {
      id: z.number().int().describe("Format - int64. The gross pay item ID"),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.delete(`/tenant/${tenant}/gross-pay-items/${id}`);
      return {
          content: [{ type: "text", text: "Gross pay item deleted successfully." }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: GrossPayItems GetList
  server.tool(
      "GrossPayItems_GetList",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
          pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
          includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
          employeeType: z.string().optional().describe("The type of employee\nValues: [Technician, Employee]"),
          employeeId: z.number().int().optional().describe("Format - int64. The Employee ID"),
          payrollIds: z.string().optional().describe("The payroll ID"),
          dateOnOrAfter: z.string().optional().describe("Format - date-time (as date-time in RFC3339). Return items having date after certain date/time (in UTC)"),
          dateOnOrBefore: z.string().optional().describe("Format - date-time (as date-time in RFC3339). Return items having date before certain date/time (in UTC)"),
      },
      async ({ tenant, page, pageSize, includeTotal, employeeType, employeeId, payrollIds, dateOnOrAfter, dateOnOrBefore }) => {
          try {
              let endpoint = `/tenant/${tenant}/gross-pay-items`;
              const params: { [key: string]: any } = {};
  
              if (page !== undefined) {
                  params.page = page;
              }
              if (pageSize !== undefined) {
                  params.pageSize = pageSize;
              }
              if (includeTotal !== undefined) {
                  params.includeTotal = includeTotal;
              }
              if (employeeType !== undefined) {
                  params.employeeType = employeeType;
              }
              if (employeeId !== undefined) {
                  params.employeeId = employeeId;
              }
              if (payrollIds !== undefined) {
                  params.payrollIds = payrollIds;
              }
              if (dateOnOrAfter !== undefined) {
                  params.dateOnOrAfter = dateOnOrAfter;
              }
              if (dateOnOrBefore !== undefined) {
                  params.dateOnOrBefore = dateOnOrBefore;
              }
  
              const response = await api.get(endpoint, { params: params });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: JobSplits GetList
  server.tool(
      "job_splits_get_list",
      {
          job: z.number().int().describe("Format - int64."),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
          pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
          includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
          createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns job split created on or after a certain date/time (in UTC)"),
          createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return job splits created before a certain date/time (in UTC)"),
          modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns job split modified on or after a certain date/time (in UTC)"),
          modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Returns job split modified before a certain date/time (in UTC)"),
          active: z.string().optional().describe("Returns job split by active status\nValues: [True, Any, False]"),
          sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn."),
      },
      async ({ job, tenant, page, pageSize, includeTotal, createdOnOrAfter, createdBefore, modifiedOnOrAfter, modifiedBefore, active, sort }) => {
          try {
              const endpoint = `/tenant/${tenant}/jobs/${job}/splits`;
              const response = await api.get(endpoint, {
                  params: {
                      page,
                      pageSize,
                      includeTotal,
                      createdOnOrAfter,
                      createdBefore,
                      modifiedOnOrAfter,
                      modifiedBefore,
                      active,
                      sort,
                  },
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: job_splits_get_list_by_jobs
  server.tool(
      "job_splits_get_list_by_jobs",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          jobIds: z.string().nullable().optional(),
          page: z.number().int().describe("Format - int32. The logical number of page to return, starting from 1").nullable().optional(),
          pageSize: z.number().int().describe("Format - int32. How many records to return (50 by default)").nullable().optional(),
          includeTotal: z.boolean().describe("Whether total count should be returned").nullable().optional(),
          createdOnOrAfter: z.string().describe("Format - date-time (as date-time in RFC3339). Returns job split created on or after a certain date/time (in UTC)").nullable().optional(),
          createdBefore: z.string().describe("Format - date-time (as date-time in RFC3339). Return job splits created before a certain date/time (in UTC)").nullable().optional(),
          modifiedOnOrAfter: z.string().describe("Format - date-time (as date-time in RFC3339). Returns job split modified on or after a certain date/time (in UTC)").nullable().optional(),
          modifiedBefore: z.string().describe("Format - date-time (as date-time in RFC3339). Returns job split modified before a certain date/time (in UTC)").nullable().optional(),
          active: z.string().describe("Returns job split by active status\nValues: [True, Any, False]").nullable().optional(),
          sort: z.string().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.").nullable().optional()
      },
      async ({ tenant, jobIds, page, pageSize, includeTotal, createdOnOrAfter, createdBefore, modifiedOnOrAfter, modifiedBefore, active, sort }) => {
          try {
              const endpoint = `/tenant/${tenant}/jobs/splits`;
              const response = await api.get(endpoint, {
                  params: {
                      jobIds: jobIds,
                      page: page,
                      pageSize: pageSize,
                      includeTotal: includeTotal,
                      createdOnOrAfter: createdOnOrAfter,
                      createdBefore: createdBefore,
                      modifiedOnOrAfter: modifiedOnOrAfter,
                      modifiedBefore: modifiedBefore,
                      active: active,
                      sort: sort
                  }
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: location_labor_type_get_list_by_locations
  server.tool("location_labor_type_get_list_by_locations",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      locationIds: z.string().optional().describe("Returns location rates for the specified location IDs"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Location (sorts by locations Id), CreatedOn.")
  },
  async ({ tenant, locationIds, createdBefore, createdOnOrAfter, page, pageSize, includeTotal, active, sort }) => {
      try {
          let endpoint = `/tenant/${tenant}/locations/rates`;
          const params: { [key: string]: any } = {};
          if (locationIds) {
              params.locationIds = locationIds;
          }
          if (createdBefore) {
              params.createdBefore = createdBefore;
          }
          if (createdOnOrAfter) {
              params.createdOnOrAfter = createdOnOrAfter;
          }
          if (page) {
              params.page = page;
          }
          if (pageSize) {
              params.pageSize = pageSize;
          }
          if (includeTotal) {
              params.includeTotal = includeTotal;
          }
          if (active) {
              params.active = active;
          }
          if (sort) {
              params.sort = sort;
          }
  
          const response = await api.get(endpoint, { params: params });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: ActivityCodes_GetList
  server.tool(
      "activity_codes_get_list",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
          pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
          includeTotal: z.boolean().optional().describe("Whether total count should be returned")
      },
      async ({ tenant, page, pageSize, includeTotal }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/activity-codes`, {
                  params: { page, pageSize, includeTotal }
              });
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: ActivityCodes Get
  server.tool(
  "activity_codes_get",
  {
      id: z.number().int().describe("Format - int64. ID of the payroll activity code"),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/activity-codes/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: PayrollAdjustments_Create
  server.tool(
      "PayrollAdjustments_Create",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          requestBody: z.record(z.any()).describe("Request body for creating payroll adjustments")
      },
      async ({ tenant, requestBody }) => {
          try {
              const response = await api.post(`/tenant/${tenant}/payroll-adjustments`, requestBody);
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: PayrollAdjustments Get
  server.tool(
  "payroll_adjustments_get",
  {
      id: z.number().int().describe("The ID of payroll adjustment"),
      tenant: z.number().int().describe("Tenant ID"),
      employeeType: z.enum(["Technician", "Employee"]).optional().describe("The employee type")
  },
  async ({ id, tenant, employeeType }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/payroll-adjustments/${id}`, {
              params: { employeeType }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: PayrollAdjustments_GetList
  server.tool("PayrollAdjustments_GetList",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      employeeIds: z.string().optional().describe("The comma separated list of employee IDs"),
      postedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return payroll adjustments posted on or after certain date/time (in UTC)"),
      postedOnOrBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return payroll adjustments posted on or before certain date/time (in UTC)")
  },
  async ({ tenant, page, pageSize, includeTotal, employeeIds, postedOnOrAfter, postedOnOrBefore }) => {
      try {
          const endpoint = `/tenant/${tenant}/payroll-adjustments`;
          const response = await api.get(endpoint, {
              params: {
                  page,
                  pageSize,
                  includeTotal,
                  employeeIds,
                  postedOnOrAfter,
                  postedOnOrBefore
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Payrolls_GetList
  server.tool("Payrolls_GetList",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      employeeType: z.enum(["Technician", "Employee"]).optional().nullable().describe("The type of employee. Values: [Technician, Employee]"),
      page: z.number().int().optional().nullable().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().nullable().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().nullable().describe("Whether total count should be returned"),
      startedOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items having start date after certain date/time (in UTC)"),
      endedOnOrBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items having end date before certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      approvedOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items approved on or after certain date/time (in UTC)"),
      status: z.enum(["Pending", "Expired", "Approved", "Paid", "Locked"]).optional().nullable().describe("Return items of the specified payroll status. Values: [Pending, Expired, Approved, Paid, Locked]"),
      active: z.enum(["True", "Any", "False"]).optional().nullable().describe("What kind of items should be returned (only active items will be returned by default). Values: [True, Any, False]")
  },
  async ({ tenant, employeeType, page, pageSize, includeTotal, startedOnOrAfter, endedOnOrBefore, modifiedBefore, modifiedOnOrAfter, approvedOnOrAfter, status, active }) => {
      try {
          const endpoint = `/tenant/${tenant}/payrolls`;
          const response = await api.get(endpoint, {
              params: {
                  employeeType: employeeType ?? undefined,
                  page: page ?? undefined,
                  pageSize: pageSize ?? undefined,
                  includeTotal: includeTotal ?? undefined,
                  startedOnOrAfter: startedOnOrAfter ?? undefined,
                  endedOnOrBefore: endedOnOrBefore ?? undefined,
                  modifiedBefore: modifiedBefore ?? undefined,
                  modifiedOnOrAfter: modifiedOnOrAfter ?? undefined,
                  approvedOnOrAfter: approvedOnOrAfter ?? undefined,
                  status: status ?? undefined,
                  active: active ?? undefined
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Payrolls GetTechnicianPayrolls
  server.tool(
      "payrolls_get_technician_payrolls",
      {
          technician: z.number().int().describe("Format - int64. The technician ID"),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
          pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
          includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
          startedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items having start date after certain date/time (in UTC)"),
          endedOnOrBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items having end date before certain date/time (in UTC)"),
          modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
          modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
          approvedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items approved on or after certain date/time (in UTC)"),
          status: z.string().optional().describe("Return items of the specified payroll status\nValues: [Pending, Expired, Approved, Paid, Locked]"),
          active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]")
      },
      async ({ technician, tenant, page, pageSize, includeTotal, startedOnOrAfter, endedOnOrBefore, modifiedBefore, modifiedOnOrAfter, approvedOnOrAfter, status, active }) => {
          try {
              const endpoint = `/tenant/${tenant}/technicians/${technician}/payrolls`;
              const response = await api.get(endpoint, {
                  params: {
                      page,
                      pageSize,
                      includeTotal,
                      startedOnOrAfter,
                      endedOnOrBefore,
                      modifiedBefore,
                      modifiedOnOrAfter,
                      approvedOnOrAfter,
                      status,
                      active
                  }
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Payrolls_GetEmployeePayrolls
  server.tool("Payrolls_GetEmployeePayrolls",
  {
      employee: z.number().int().describe("Format - int64. The employee ID"),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      startedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items having start date after certain date/time (in UTC)"),
      endedOnOrBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items having end date before certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter:  z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      approvedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items approved on or after certain date/time (in UTC)"),
      status: z.string().optional().describe("Return items of the specified payroll status\nValues: [Pending, Expired, Approved, Paid, Locked]"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]")
  },
  async ({ employee, tenant, page, pageSize, includeTotal, startedOnOrAfter, endedOnOrBefore, modifiedBefore, modifiedOnOrAfter, approvedOnOrAfter, status, active }) => {
      try {
          const endpoint = `/tenant/${tenant}/employees/${employee}/payrolls`;
          const response = await api.get(endpoint, {
              params: {
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  startedOnOrAfter: startedOnOrAfter,
                  endedOnOrBefore: endedOnOrBefore,
                  modifiedBefore: modifiedBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter,
                  approvedOnOrAfter: approvedOnOrAfter,
                  status: status,
                  active: active
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: PayrollSettings_GetEmployeePayrollSettings
  server.tool(
      "PayrollSettings_GetEmployeePayrollSettings",
      {
          employee: z.number().int().describe("Format - int64. The employee ID"),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
      },
      async ({ employee, tenant }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/employees/${employee}/payroll-settings`);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: PayrollSettings_UpdateEmployeePayrollSettings
  server.tool(
  "PayrollSettings_UpdateEmployeePayrollSettings",
  {
      employee: z.number().int().describe("Format - int64. The employee ID"),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.record(z.any()).describe("Request Body")
  },
  async ({ employee, tenant, payload }) => {
      try {
      const response = await api.put(`/tenant/${tenant}/employees/${employee}/payroll-settings`,
          payload
      );
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: PayrollSettings GetPayrollSettingsList
  server.tool("PayrollSettings_GetPayrollSettingsList",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      employeeType: z.string().optional().describe("The type of employee\nValues: [Technician, Employee]"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]")
  },
  async ({ tenant, employeeType, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, active }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/payroll-settings`, {
              params: {
                  employeeType,
                  page,
                  pageSize,
                  includeTotal,
                  createdBefore,
                  createdOnOrAfter,
                  modifiedBefore,
                  modifiedOnOrAfter,
                  active
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: PayrollSettings_GetTechnicianPayrollSettings
  server.tool("PayrollSettings_GetTechnicianPayrollSettings",
  {
      technician: z.number().int().describe("Format - int64. The technician ID"),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ technician, tenant }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/technicians/${technician}/payroll-settings`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: PayrollSettings_UpdateTechnicianPayrollSettings
  server.tool(
      "PayrollSettings_UpdateTechnicianPayrollSettings",
      {
          technician: z.number().int().describe("Format - int64. The technician ID"),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          employeeId: z.number().int().optional().describe("Employee ID")
      },
      async ({ technician, tenant, employeeId }) => {
          try {
              const response = await api.put(`/tenant/${tenant}/technicians/${technician}/payroll-settings`,
                  {
                      employeeId: employeeId
                  });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: TimesheetCodes_Get
  server.tool("TimesheetCodes_Get",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      id: z.number().int().describe("Format - int64. The timesheet code ID")
  },
  async ({ tenant, id }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/timesheet-codes/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  server.tool("timesheetcodes_getlist",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ tenant, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, active, sort }) => {
      try {
          let endpoint = `/tenant/${tenant}/timesheet-codes`;
          const params: { [key: string]: any } = {};
  
          if (createdBefore) {
              params.createdBefore = createdBefore;
          }
          if (createdOnOrAfter) {
              params.createdOnOrAfter = createdOnOrAfter;
          }
          if (modifiedBefore) {
              params.modifiedBefore = modifiedBefore;
          }
          if (modifiedOnOrAfter) {
              params.modifiedOnOrAfter = modifiedOnOrAfter;
          }
          if (page) {
              params.page = page;
          }
          if (pageSize) {
              params.pageSize = pageSize;
          }
          if (includeTotal) {
              params.includeTotal = includeTotal;
          }
          if (active) {
              params.active = active;
          }
          if (sort) {
              params.sort = sort;
          }
  
          const response = await api.get(endpoint, { params: params });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Timesheets Create Job Timesheet
  server.tool("timesheets_create_job_timesheet",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      job: z.number().int().describe("Format - int64. The job ID"),
  },
  async ({ tenant, job }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/jobs/${job}/timesheets`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Timesheets_GetJobTimesheets
  server.tool("timesheets_getjobtimesheets",
  {
      job: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      technicianId: z.number().int().optional().describe("Format - int64. The technician ID"),
      startedOn: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items having dispatch, arrive, cancel or done dates after certain date/time (in UTC)"),
      endedOn: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items having dispatch, arrive, cancel or done dates before certain date/time (in UTC)"),
      sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ job, tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, technicianId, startedOn, endedOn, sort }) => {
      try {
          const endpoint = `/tenant/${tenant}/jobs/${job}/timesheets`;
          const response = await api.get(endpoint, {
              params: {
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  createdBefore: createdBefore,
                  createdOnOrAfter: createdOnOrAfter,
                  modifiedBefore: modifiedBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter,
                  technicianId: technicianId,
                  startedOn: startedOn,
                  endedOn: endedOn,
                  sort: sort
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Timesheets_GetJobTimesheetsByJobs
  server.tool("timesheets_getjobtimesheetsbyjobs",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      jobIds: z.string().nullable().optional(),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      technicianId: z.number().int().nullable().optional().describe("Format - int64. The technician ID"),
      startedOn: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items having dispatch, arrive, cancel or done dates after certain date/time (in UTC)"),
      endedOn: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items having dispatch, arrive, cancel or done dates before certain date/time (in UTC)"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ tenant, jobIds, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, technicianId, startedOn, endedOn, sort }) => {
      try {
      const endpoint = `/tenant/${tenant}/jobs/timesheets`;
      const response = await api.get(endpoint, {
          params: { jobIds, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, technicianId, startedOn, endedOn, sort }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Timesheets UpdateJobTimesheet
  server.tool(
  "timesheets_update_job_timesheet",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      job: z.number().int().describe("Format - int64. The job ID"),
      id: z.number().int().describe("Format - int64. The job timesheet ID"),
      payload: z.record(z.any()).optional().describe("The timesheet data to update")
  },
  async ({ tenant, job, id, payload }) => {
      try {
      const endpoint = `/tenant/${tenant}/jobs/${job}/timesheets/${id}`;
      const response = await api.put(endpoint, payload ? JSON.stringify(payload) : null);
  
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Timesheets GetNonJobTimesheets
  server.tool(
      "Timesheets_GetNonJobTimesheets",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
          pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
          includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
          createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
          createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
          modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
          modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
          employeeId: z.number().int().optional().describe("Format - int64. The employee ID"),
          employeeType: z.enum(["Technician", "Employee"]).optional().describe("The employee type\nValues: [Technician, Employee]"),
          active: z.enum(["True", "Any", "False"]).optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
          sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
      },
      async ({ tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, employeeId, employeeType, active, sort }) => {
          try {
              let endpoint = `/tenant/${tenant}/non-job-timesheets`;
              const params: Record<string, any> = {};
              if (page !== undefined) {
                  params.page = page;
              }
              if (pageSize !== undefined) {
                  params.pageSize = pageSize;
              }
              if (includeTotal !== undefined) {
                  params.includeTotal = includeTotal;
              }
              if (createdBefore !== undefined) {
                  params.createdBefore = createdBefore;
              }
              if (createdOnOrAfter !== undefined) {
                  params.createdOnOrAfter = createdOnOrAfter;
              }
              if (modifiedBefore !== undefined) {
                  params.modifiedBefore = modifiedBefore;
              }
              if (modifiedOnOrAfter !== undefined) {
                  params.modifiedOnOrAfter = modifiedOnOrAfter;
              }
              if (employeeId !== undefined) {
                  params.employeeId = employeeId;
              }
              if (employeeType !== undefined) {
                  params.employeeType = employeeType;
              }
              if (active !== undefined) {
                  params.active = active;
              }
              if (sort !== undefined) {
                  params.sort = sort;
              }
  
              const response = await api.get(endpoint, { params: params });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );


  // Tool: ClientSpecificPricing Update RateSheet
server.tool(
  "client_specific_pricing_update_rate_sheet",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      rateSheetId: z.number().int().describe("Format - int64."),
      payload: z.record(z.any()).describe("The payload to update the rate sheet with")
  },
  async ({ tenant, rateSheetId, payload }) => {
      try {
          const response = await api.patch(`/tenant/${tenant}/clientspecificpricing/${rateSheetId}`, payload);

          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: Client Specific Pricing - Get All Rate Sheets
server.tool(
  "client_specific_pricing_get_all_rate_sheets",
  {
      tenant: z.number().int().describe("Tenant ID"),
      ids: z.string().nullable().optional().describe("List of ids"),
      searchTerm: z.string().nullable().optional().describe("Search term"),
      active: z.string().nullable().optional().describe("Values: [True, Any, False]"),
      page: z.number().int().nullable().optional().describe("Page number"),
      pageSize: z.number().int().nullable().optional().describe("Page size"),
      includeTotal: z.boolean().nullable().optional().describe("Include total count")
  },
  async ({ tenant, ids, searchTerm, active, page, pageSize, includeTotal }) => {
      try {
          let endpoint = `/tenant/${tenant}/clientspecificpricing`;
          const params: { [key: string]: any } = {};
          if (ids) params.ids = ids;
          if (searchTerm) params.searchTerm = searchTerm;
          if (active) params.active = active;
          if (page) params.page = page;
          if (pageSize) params.pageSize = pageSize;
          if (includeTotal) params.includeTotal = includeTotal;

          const response = await api.get(endpoint, { params: params });

          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: Categories Create
server.tool("categories_create",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ tenant }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/categories`);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Categories Get
server.tool("categories_get",
{
  id: z.number().int().describe("Format - int64. The id of the service you are requesting"),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/categories/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Categories_GetList
server.tool("categories_get_list",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
  sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, Name."),
  categoryType: z.string().optional().describe("Category type\nValues: [Services, Materials]"),
  active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
  createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
  createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
  modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
  modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)")
},
async ({ tenant, page, pageSize, includeTotal, sort, categoryType, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/categories`, {
          params: { page, pageSize, includeTotal, sort, categoryType, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Categories Delete
server.tool("categories_delete",
{
  id: z.number().int().describe("Format - int64. Id of the SKU you are deleting"),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
  const response = await api.delete(`/tenant/${tenant}/categories/${id}`);
  return {
      content: [{ type: "text", text: "Category deleted successfully." }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Categories Update
server.tool("categories_update",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  id: z.number().int().describe("Format - int64. Unique id for the SKU is modified"),
  body: z.record(z.any()).optional().describe("Request body (optional)"),
},
async ({ tenant, id, body }) => {
  try {
      const endpoint = `/tenant/${tenant}/categories/${id}`;
      const response = await api.patch(endpoint, body);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: discount_and_fees_get
server.tool(
  "discount_and_fees_get",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      id: z.number().int().describe("Format - int64. The id of the discount and fee you are requesting"),
      externalDataApplicationGuid: z.string().uuid().optional().describe("Format - guid. Items that are created with a specific guid, could be fetched/updated/removed only when the same application guid is provided.")
  },
  async ({ tenant, id, externalDataApplicationGuid }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/discounts-and-fees/${id}`, {
              params: { externalDataApplicationGuid }
          });

          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
server.tool("discount_and_fees_GetList",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
  sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, Code, DisplayName, CreatedOn, ModifiedOn, Price, MemberPrice, AddOnPrice, AddOnMemberPrice, MaterialsCost, PrimaryVendor, Cost, Manufacturer, Priority."),
  ids: z.string().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
  createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
  createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
  modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
  modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
  active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
  externalDataApplicationGuid: z.string().uuid().optional().describe("Format - guid. Items that are created with a specific guid, could be fetched/updated/removed\nonly when the same application guid is provided"),
  externalDataKey: z.string().optional().describe("Allows filtering by external data key"),
  externalDataValues: z.string().optional().describe("Allows filtering by external data values")
},
async ({ tenant, page, pageSize, includeTotal, sort, ids, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, active, externalDataApplicationGuid, externalDataKey, externalDataValues }) => {
  try {
      const endpoint = `/tenant/${tenant}/discounts-and-fees`;
      const response = await api.get(endpoint, {
          params: {
              page: page,
              pageSize: pageSize,
              includeTotal: includeTotal,
              sort: sort,
              ids: ids,
              createdBefore: createdBefore,
              createdOnOrAfter: createdOnOrAfter,
              modifiedBefore: modifiedBefore,
              modifiedOnOrAfter: modifiedOnOrAfter,
              active: active,
              externalDataApplicationGuid: externalDataApplicationGuid,
              externalDataKey: externalDataKey,
              externalDataValues: externalDataValues
          }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: DiscountAndFees Create
server.tool("DiscountAndFees_Create",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  type: z.string().optional().describe("Discount and fees type"),
  code: z.string().describe("Discount and fees code"),
  displayName: z.string().describe("Discount and fees display name"),
  description: z.string().optional().describe("Discount and fees description"),
  amountType: z.string().optional().describe("Discount and fees amount type"),
  amount: z.number().describe("Discount and fees amount"),
  limit: z.number().optional().describe("Discount and fees limit"),
  taxable: z.boolean().optional().describe("Discount and fees taxable"),
  categories: z.array(z.number()).optional().describe("Discount and fees categories"),
  hours: z.number().optional().describe("Discount and fees hours"),
  assets: z.array(z.object({
      alias: z.string().optional(),
      fileName: z.string().optional(),
      isDefault: z.boolean().optional(),
      type: z.string().optional(),
      url: z.string().optional()
  })).optional().describe("Discount and fees assets"),
  account: z.string().optional().describe("Discount and fees account"),
  crossSaleGroup: z.string().optional().describe("Discount and fees cross sale group"),
  active: z.boolean().optional().describe("Discount and fees active"),
  bonus: z.number().optional().describe("Discount and fees bonus"),
  commissionBonus: z.number().optional().describe("Discount and fees commission bonus"),
  paysCommission: z.boolean().optional().describe("Discount and fees pays commission"),
  excludeFromPayroll: z.boolean().optional().describe("Discount and fees exclude from payroll"),
  externalData: z.array(z.object({
      key: z.string().optional(),
      value: z.string().optional()
  })).optional().describe("Discount and fees external data")
},
async ({ tenant, type, code, displayName, description, amountType, amount, limit, taxable, categories, hours, assets, account, crossSaleGroup, active, bonus, commissionBonus, paysCommission, excludeFromPayroll, externalData }) => {
  try {
      const response = await api.post(`/tenant/${tenant}/discounts-and-fees`, {
          type: type,
          code: code,
          displayName: displayName,
          description: description,
          amountType: amountType,
          amount: amount,
          limit: limit,
          taxable: taxable,
          categories: categories,
          hours: hours,
          assets: assets,
          account: account,
          crossSaleGroup: crossSaleGroup,
          active: active,
          bonus: bonus,
          commissionBonus: commissionBonus,
          paysCommission: paysCommission,
          excludeFromPayroll: excludeFromPayroll,
          externalData: externalData
      });

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: DiscountAndFees Update
server.tool(
"discount_and_fees_update",
{
  id: z.number().int().describe("The unique ID of the discount and fees to update"),
  tenant: z.number().int().describe("The tenant ID"),
  payload: z.record(z.any()).describe("The properties of the discount and fees to update")
},
async ({ id, tenant, payload }) => {
  try {
      const response = await api.patch(`/tenant/${tenant}/discounts-and-fees/${id}`, payload);

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: DiscountAndFees_Delete
server.tool("DiscountAndFees_Delete",
{
  tenant: z.number().int().describe("Tenant ID"),
  id: z.number().int().describe("Id of the SKU you are deleting")
},
async ({ tenant, id }) => {
  try {
      const response = await api.delete(`/tenant/${tenant}/discounts-and-fees/${id}`);

      if (response.status === 204) {
          return {
              content: [{ type: "text", text: "Discount and fees deleted successfully." }]
          };
      } else {
          return {
              content: [{ type: "text", text: `Unexpected status code: ${response.status}` }]
          };
      }
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Equipment_GetList
server.tool("equipment_get_list",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
  sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, Code, DisplayName, CreatedOn, ModifiedOn, Price, MemberPrice, AddOnPrice, AddOnMemberPrice, MaterialsCost, PrimaryVendor, Cost, Manufacturer, Priority."),
  ids: z.string().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
  createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
  createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
  modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
  modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
  active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
  externalDataApplicationGuid: z.string().uuid().optional().describe("Format - guid. Items that are created with a specific guid, could be fetched/updated/removed\nonly when the same application guid is provided"),
  externalDataKey: z.string().optional().describe("Allows filtering by external data key"),
  externalDataValues: z.string().optional().describe("Allows filtering by external data values")
},
async ({ tenant, page, pageSize, includeTotal, sort, ids, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, active, externalDataApplicationGuid, externalDataKey, externalDataValues }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/equipment`, {
          params: {
              page,
              pageSize,
              includeTotal,
              sort,
              ids,
              createdBefore,
              createdOnOrAfter,
              modifiedBefore,
              modifiedOnOrAfter,
              active,
              externalDataApplicationGuid,
              externalDataKey,
              externalDataValues
          }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Equipment Update
server.tool("equipment_update",
{
  id: z.number().int().describe("Format - int64. Unique id for the SKU is modified"),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  payload: z.record(z.any()).optional().describe("The data to update the equipment with")
},
async ({ id, tenant, payload }) => {
  try {
  const response = await api.patch(`/tenant/${tenant}/equipment/${id}`, payload);

  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Equipment_Get
server.tool("equipment_get",
{
  id: z.number().int().describe("Format - int64. The id of the equipment you are requesting"),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  externalDataApplicationGuid: z.string().uuid().optional().describe("Format - guid. Items that are created with a specific guid, could be fetched/updated/removed\nonly when the same application guid is provided.")
},
async ({ id, tenant, externalDataApplicationGuid }) => {
  try {
      let endpoint = `/tenant/${tenant}/equipment/${id}`;
      const params: { [key: string]: any } = {};

      if (externalDataApplicationGuid) {
          params["externalDataApplicationGuid"] = externalDataApplicationGuid;
      }

      const response = await api.get(endpoint, { params: params });

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Equipment Delete
server.tool("equipment_delete",
{
  id: z.number().int().describe("Format - int64. Id of the SKU you are deleting"),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
  const response = await api.delete(`/tenant/${tenant}/equipment/${id}`);

  if (response.status === 204) {
      return {
      content: [{ type: "text", text: "Equipment deleted successfully. No content to return." }]
      };
  } else {
      return {
      content: [{ type: "text", text: `Unexpected status code: ${response.status}` }]
      };
  }
  } catch (error: any) {
  if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      return {
      content: [{ type: "text", text: `Error: ${error.response.status} - ${JSON.stringify(error.response.data)}` }]
      };
  } else if (error.request) {
      // The request was made but no response was received
      return {
      content: [{ type: "text", text: `Error: No response received from the server.` }]
      };
  } else {
      // Something happened in setting up the request that triggered an Error
      return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
  }
}
);
// Tool: Export Equipment
server.tool("export_equipment",
{
  tenant: z.number().int().describe("Tenant ID"),
  from: z.string().nullable().optional().describe("Continuation token or date string"),
  includeRecentChanges: z.boolean().nullable().optional().describe("Include recent changes")
},
async ({ tenant, from, includeRecentChanges }) => {
  try {
      let endpoint = `/tenant/${tenant}/export/equipment`;
      const params: { [key: string]: any } = {};

      if (from !== undefined) {
          params.from = from;
      }
      if (includeRecentChanges !== undefined) {
          params.includeRecentChanges = includeRecentChanges;
      }

      const response = await api.get(endpoint, { params: params });

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Export Services
server.tool("export_services",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
  includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
},
async ({ tenant, from, includeRecentChanges }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/export/services`, {
          params: { from, includeRecentChanges }
      });

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Export_Materials
server.tool("export_materials",
{
  tenant: z.number().int().describe("Tenant ID"),
  from: z.string().nullable().optional().describe("Continuation token or custom date string"),
  includeRecentChanges: z.boolean().nullable().optional().describe("Include recent changes quickly")
},
async ({ tenant, from, includeRecentChanges }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/export/materials`, {
          params: { from, includeRecentChanges }
      });

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Images Get
server.tool(
  "images_get",
  {
      tenant: z.number().int().describe("Tenant ID"),
      path: z.string().optional().describe("The storage path of the pricebook image to retrieve")
  },
  async ({ tenant, path }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/images`, {
              params: { path }
          });

          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: Images_Post
server.tool("images_post",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ tenant }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/images`);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Materials Create
server.tool("materials_create",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ tenant }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/materials`);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: materials_get
server.tool("materials_get",
{
  id: z.number().int().describe("Format - int64. The id of the material you are requesting"),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  externalDataApplicationGuid: z.string().uuid().optional().describe("Format - guid. Items that are created with a specific guid, could be fetched/updated/removed\nonly when the same application guid is provided.")
},
async ({ id, tenant, externalDataApplicationGuid }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/materials/${id}`, {
          params: { externalDataApplicationGuid }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
server.tool("materials_get_list",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  isOtherDirectCost: z.boolean().optional().nullable().describe("Allows filtering by Is Other Direct Cost"),
  costTypeIds: z.string().optional().nullable().describe("Allows filtering by Cost Type Ids"),
  page: z.number().int().optional().nullable().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().nullable().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().nullable().describe("Whether total count should be returned"),
  sort: z.string().optional().nullable().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, Code, DisplayName, CreatedOn, ModifiedOn, Price, MemberPrice, AddOnPrice, AddOnMemberPrice, MaterialsCost, PrimaryVendor, Cost, Manufacturer, Priority."),
  ids: z.string().optional().nullable().describe("Perform lookup by multiple IDs (maximum 50)"),
  createdBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
  createdOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
  modifiedBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
  modifiedOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
  active: z.string().optional().nullable().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
  externalDataApplicationGuid: z.string().uuid().optional().nullable().describe("Format - guid. Items that are created with a specific guid, could be fetched/updated/removed\nonly when the same application guid is provided"),
  externalDataKey: z.string().optional().nullable().describe("Allows filtering by external data key"),
  externalDataValues: z.string().optional().nullable().describe("Allows filtering by external data values")
},
async ({ tenant, isOtherDirectCost, costTypeIds, page, pageSize, includeTotal, sort, ids, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, active, externalDataApplicationGuid, externalDataKey, externalDataValues }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/materials`, {
          params: {
              isOtherDirectCost,
              costTypeIds,
              page,
              pageSize,
              includeTotal,
              sort,
              ids,
              createdBefore,
              createdOnOrAfter,
              modifiedBefore,
              modifiedOnOrAfter,
              active,
              externalDataApplicationGuid,
              externalDataKey,
              externalDataValues
          }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Materials Delete
server.tool("materials_delete",
{
  id: z.number().int().describe("Format - int64. Id of the SKU you are deleting"),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
  const response = await api.delete(`/tenant/${tenant}/materials/${id}`);
  return {
      content: [{ type: "text", text: "Material deleted successfully." }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Materials_GetCostTypes
server.tool(
  "materials_get_cost_types",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
  },
  async ({ tenant }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/materials/costtypes`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }],
          };
      }
  }
);
// Tool: MaterialsMarkup GetList
server.tool(
"materialsmarkup_getlist",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32."),
  pageSize: z.number().int().optional().describe("Format - int32.")
},
async ({ tenant, page, pageSize }) => {
  try {
  const response = await api.get(`/tenant/${tenant}/materialsmarkup`, {
      params: { page, pageSize }
  });

  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: MaterialsMarkup_Create
server.tool(
"materialsmarkup_create",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ tenant }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/materialsmarkup`);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: MaterialsMarkup_Get
server.tool(
  "materialsmarkup_get",
  {
      id: z.number().int().describe("Format - int64. Materials markup id"),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/materialsmarkup/${id}`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: MaterialsMarkup_Update
server.tool("materialsmarkup_update",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  id: z.number().int().describe("Format - int64. Materials markup id"),
  from: z.number().optional().describe("Starting value for the markup range"),
  to: z.number().optional().describe("Ending value for the markup range"),
  percent: z.number().optional().describe("Markup percentage")
},
async ({ tenant, id, from, to, percent }) => {
  try {
  const response = await api.put(`/tenant/${tenant}/materialsmarkup/${id}`, {
      from: from,
      to: to,
      percent: percent
  });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
server.tool("materials_update",
{
  id: z.number().int().describe("Format - int64. Unique id for the SKU is modified"),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  code: z.string().optional().describe("Material code"),
  displayName: z.string().optional().describe("Material display name"),
  description: z.string().optional().describe("Material description"),
  cost: z.number().optional().describe("Material cost"),
  active: z.boolean().optional().describe("Material active status"),
  price: z.number().optional().describe("Material price"),
  memberPrice: z.number().optional().describe("Material member price"),
  addOnPrice: z.number().optional().describe("Material add-on price"),
  addOnMemberPrice: z.number().optional().describe("Material add-on member price"),
  hours: z.number().optional().describe("Material hours"),
  bonus: z.number().optional().describe("Material bonus"),
  commissionBonus: z.number().optional().describe("Material commission bonus"),
  paysCommission: z.boolean().optional().describe("Material pays commission status"),
  deductAsJobCost: z.boolean().optional().describe("Material deduct as job cost status"),
  unitOfMeasure: z.string().optional().describe("Material unit of measure"),
  isInventory: z.boolean().optional().describe("Material is inventory status"),
  account: z.string().optional().describe("Material account"),
  costOfSaleAccount: z.string().optional().describe("Material cost of sale account"),
  assetAccount: z.string().optional().describe("Material asset account"),
  taxable: z.boolean().optional().describe("Material taxable status"),
  primaryVendor: z.object({
      id: z.number().int().optional(),
      vendorName: z.string().optional(),
      vendorId: z.number().int().optional(),
      memo: z.string().optional(),
      vendorPart: z.string().optional(),
      cost: z.number().optional(),
      active: z.boolean().optional(),
      primarySubAccount: z.object({
          id: z.number().int().optional(),
          cost: z.number().optional(),
          accountName: z.string().optional()
      }).optional(),
      otherSubAccounts: z.array(z.object({
          id: z.number().int().optional(),
          cost: z.number().optional(),
          accountName: z.string().optional()
      })).optional()
  }).optional(),
  otherVendors: z.array(z.object({
      id: z.number().int().optional(),
      vendorName: z.string().optional(),
      vendorId: z.number().int().optional(),
      memo: z.string().optional(),
      vendorPart: z.string().optional(),
      cost: z.number().optional(),
      active: z.boolean().optional(),
      primarySubAccount: z.object({
          id: z.number().int().optional(),
          cost: z.number().optional(),
          accountName: z.string().optional()
      }).optional(),
      otherSubAccounts: z.array(z.object({
          id: z.number().int().optional(),
          cost: z.number().optional(),
          accountName: z.string().optional()
      })).optional()
  })).optional(),
  categories: z.array(z.number().int()).optional(),
  assets: z.array(z.object({
      alias: z.string().optional(),
      fileName: z.string().optional(),
      isDefault: z.boolean().optional(),
      type: z.any().optional(),
      url: z.string().optional()
  })).optional(),
  source: z.string().optional().describe("Material source"),
  externalId: z.string().optional().describe("Material external ID"),
  externalData: z.array(z.object({
      key: z.string().optional(),
      value: z.string().optional()
  })).optional(),
  isConfigurableMaterial: z.boolean().optional().describe("Material is configurable material status"),
  chargeableByDefault: z.boolean().optional().describe("Material chargeable by default status"),
  variationsOrConfigurableMaterials: z.array(z.number().int()).optional(),
  businessUnitId: z.number().int().optional().describe("Material business unit ID"),
  generalLedgerAccountId: z.number().int().optional().describe("Material general ledger account ID"),
  isOtherDirectCost: z.boolean().optional().describe("Material is other direct cost status"),
  costTypeId: z.number().int().optional().describe("Material cost type ID"),
  displayInAmount: z.boolean().optional().describe("Material display in amount status")
},
async ({ id, tenant, code, displayName, description, cost, active, price, memberPrice, addOnPrice, addOnMemberPrice, hours, bonus, commissionBonus, paysCommission, deductAsJobCost, unitOfMeasure, isInventory, account, costOfSaleAccount, assetAccount, taxable, primaryVendor, otherVendors, categories, assets, source, externalId, externalData, isConfigurableMaterial, chargeableByDefault, variationsOrConfigurableMaterials, businessUnitId, generalLedgerAccountId, isOtherDirectCost, costTypeId, displayInAmount }) => {
  try {
      const endpoint = `/tenant/${tenant}/materials/${id}`;

      const payload = {
          code,
          displayName,
          description,
          cost,
          active,
          price,
          memberPrice,
          addOnPrice,
          addOnMemberPrice,
          hours,
          bonus,
          commissionBonus,
          paysCommission,
          deductAsJobCost,
          unitOfMeasure,
          isInventory,
          account,
          costOfSaleAccount,
          assetAccount,
          taxable,
          primaryVendor,
          otherVendors,
          categories,
          assets,
          source,
          externalId,
          externalData,
          isConfigurableMaterial,
          chargeableByDefault,
          variationsOrConfigurableMaterials,
          businessUnitId,
          generalLedgerAccountId,
          isOtherDirectCost,
          costTypeId,
          displayInAmount
      };

      const response = await api.patch(endpoint, payload, {
          params: { }
      });

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: PricebookBulk_Create
server.tool(
  "pricebookbulk_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.object({}).describe("The payload for bulk pricebook creation.  This should match the expected schema for the API."),
  },
  async ({ tenant, payload }) => {
      try {
          const response = await api.post(`/tenant/${tenant}/pricebook`, JSON.stringify(payload));

          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }],
          };
      }
  }
);
// Tool: Pricebook Bulk Update
server.tool("pricebookbulk_update",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ tenant }) => {
  try {
  const response = await api.patch(`/tenant/${tenant}/pricebook`);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Services_Get
server.tool("services_get",
{
  id: z.number().int().describe("Format - int64. The id of the service you are requesting"),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  externalDataApplicationGuid: z.string().uuid().optional().describe("Format - guid. Items that are created with a specific guid, could be fetched/updated/removed\nonly when the same application guid is provided.")
},
async ({ id, tenant, externalDataApplicationGuid }) => {
  try {
  const response = await api.get(`/tenant/${tenant}/services/${id}`, {
      params: { externalDataApplicationGuid }
  });
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
server.tool("services_getlist",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
  sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, Code, DisplayName, CreatedOn, ModifiedOn, Price, MemberPrice, AddOnPrice, AddOnMemberPrice, MaterialsCost, PrimaryVendor, Cost, Manufacturer, Priority."),
  ids: z.string().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
  createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
  createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
  modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
  modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
  active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
  externalDataApplicationGuid: z.string().uuid().optional().describe("Format - guid. Items that are created with a specific guid, could be fetched/updated/removed\nonly when the same application guid is provided"),
  externalDataKey: z.string().optional().describe("Allows filtering by external data key"),
  externalDataValues: z.string().optional().describe("Allows filtering by external data values")
},
async ({ tenant, page, pageSize, includeTotal, sort, ids, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, active, externalDataApplicationGuid, externalDataKey, externalDataValues }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/services`, {
          params: {
              page,
              pageSize,
              includeTotal,
              sort,
              ids,
              createdBefore,
              createdOnOrAfter,
              modifiedBefore,
              modifiedOnOrAfter,
              active,
              externalDataApplicationGuid,
              externalDataKey,
              externalDataValues
          }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Services Update
server.tool("services_update",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  id: z.number().int().describe("Format - int64. Unique id for the SKU is modified"),
  payload: z.record(z.any()).describe("Request Body"),
},
async ({ tenant, id, payload }) => {
  try {
  const response = await api.patch(`/tenant/${tenant}/services/${id}`, payload);
  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: Services Delete
server.tool("services_delete",
{
  id: z.number().int().describe("Format - int64. Id of the SKU you are deleting"),
  tenant: z.number().int().describe("Format - int64. Tenant ID")
},
async ({ id, tenant }) => {
  try {
      const response = await api.delete(`/tenant/${tenant}/services/${id}`);

      if (response.status === 204) {
          return {
              content: [{ type: "text", text: "Service deleted successfully." }]
          };
      } else {
          return {
              content: [{ type: "text", text: `Unexpected status code: ${response.status}` }]
          };
      }
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
server.tool("services_create",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  code: z.string().describe("Service Code"),
  displayName: z.string().describe("Service Display Name"),
  description: z.string().optional().describe("Service Description"),
  warrantyDuration: z.number().int().optional().describe("Warranty Duration"),
  warrantyDescription: z.string().optional().describe("Warranty Description"),
  categoryIds: z.array(z.number().int()).optional().describe("Array of Category IDs"),
  price: z.number().optional().describe("Service Price"),
  memberPrice: z.number().optional().describe("Service Member Price"),
  addOnPrice: z.number().optional().describe("Add-On Price"),
  addOnMemberPrice: z.number().optional().describe("Add-On Member Price"),
  taxable: z.boolean().optional().describe("Is Taxable"),
  account: z.string().optional().describe("Account Number"),
  hours: z.number().optional().describe("Service Hours"),
  isLabor: z.boolean().optional().describe("Is Labor Service"),
  recommendationIds: z.array(z.number().int()).optional().describe("Array of Recommendation IDs"),
  upgradeIds: z.array(z.number().int()).optional().describe("Array of Upgrade IDs"),
  active: z.boolean().optional().describe("Is Active"),
  crossSaleGroup: z.string().optional().describe("Cross-Sale Group"),
  paysCommission: z.boolean().optional().describe("Pays Commission"),
  bonus: z.number().optional().describe("Bonus Amount"),
  commissionBonus: z.number().optional().describe("Commission Bonus Amount"),
  source: z.string().optional().describe("Service Source"),
  externalId: z.string().optional().describe("External Service ID"),
  externalData: z.array(z.object({ key: z.string(), value: z.string() })).optional().describe("External Data Key-Value Pairs"),
  businessUnitId: z.number().int().optional().describe("Business Unit ID"),
  cost: z.number().optional().describe("Service Cost"),
  soldByCommission: z.number().optional().describe("Commission Percentage")
},
async ({ tenant, code, displayName, description, warrantyDuration, warrantyDescription, categoryIds, price, memberPrice, addOnPrice, addOnMemberPrice, taxable, account, hours, isLabor, recommendationIds, upgradeIds, active, crossSaleGroup, paysCommission, bonus, commissionBonus, source, externalId, externalData, businessUnitId, cost, soldByCommission }) => {
  try {
      const endpoint = `/tenant/${tenant}/services`;
      const payload = {
          code,
          displayName,
          description,
          warranty: {
              duration: warrantyDuration,
              description: warrantyDescription
          },
          categories: categoryIds ? categoryIds.map(id => ({ id })) : undefined,
          price,
          memberPrice,
          addOnPrice,
          addOnMemberPrice,
          taxable,
          account,
          hours,
          isLabor,
          recommendations: recommendationIds,
          upgrades: upgradeIds,
          active,
          crossSaleGroup,
          paysCommission,
          bonus,
          commissionBonus,
          source,
          externalId,
          externalData,
          businessUnitId,
          cost,
          soldByCommission
      };

      const response = await api.post(endpoint, payload);

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);

// Tool: DynamicValueSets GetDynamicSet
server.tool("dynamic_value_sets_get_dynamic_set",
  {
      dynamicSetId: z.string().describe("ID of dynamic set taken from a report description"),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned")
  },
  async ({ dynamicSetId, tenant, page, pageSize, includeTotal }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/dynamic-value-sets/${dynamicSetId}`, {
              params: { page, pageSize, includeTotal }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: ReportCategories_GetCategories
  server.tool(
    "ReportCategories_GetCategories",
    {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
    },
    async ({ tenant, page, pageSize, includeTotal }) => {
      try {
        const response = await api.get(`/tenant/${tenant}/report-categories`, {
          params: { page, pageSize, includeTotal },
        });
  
        return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
        };
      }
    }
  );
  // Tool: Report Category Reports Get Reports
  server.tool(
  "report_category_reports_get_reports",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      report_category: z.string().describe("ID of category taken from the category list endpoint "),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
  },
  async ({ tenant, report_category, page, pageSize, includeTotal }) => {
      try {
          const endpoint = `/tenant/${tenant}/report-category/${report_category}/reports`;
          const response = await api.get(endpoint, {
              params: { page, pageSize, includeTotal },
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }],
          };
      }
  }
  );
  // Tool: ReportCategoryReports_Get
  server.tool("ReportCategoryReports_Get",
  {
      report_category: z.string().describe("ID of category taken from the category list endpoint "),
      reportId: z.number().int().describe("Format - int64. ID of report within the category "),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ report_category, reportId, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/report-category/${report_category}/reports/${reportId}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Report Category Reports Get Data
  server.tool("report_category_reports_get_data",
  {
      tenant: z.number().int().describe("Tenant ID"),
      report_category: z.string().describe("ID of category taken from the category list endpoint"),
      reportId: z.number().int().describe("ID of report within the category"),
      page: z.number().int().optional().describe("The logical number of page to return, starting from 1"),
      pageSize: z.number().int().min(1).max(25000).optional().describe("How many records to return (1000 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned")
  },
  async ({ tenant, report_category, reportId, page, pageSize, includeTotal }) => {
      try {
          const endpoint = `/tenant/${tenant}/report-category/${report_category}/reports/${reportId}/data`;
          const response = await api.post(endpoint, {}, {
              params: { page, pageSize, includeTotal }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );


  // Tool: Estimates Get
server.tool("estimates_get",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/estimates/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Estimates Update
  server.tool(
  "estimates_update",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      estimate: z.object({}).optional().describe("Estimate object to update")
  },
  async ({ id, tenant, estimate }) => {
      try {
          const endpoint = `/tenant/${tenant}/estimates/${id}`;
          const response = await api.put(endpoint, estimate);
  
          if (response.status === 200) {
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } else if (response.status === 400) {
              return {
                  content: [{ type: "text", text: `Error: Bad Request - ${String(JSON.stringify(response.data))}` }]
              };
          } else {
              return {
                  content: [{ type: "text", text: `Error: Unexpected status code ${response.status} - ${String(JSON.stringify(response.data))}` }]
              };
          }
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: estimates_getlist
  server.tool("estimates_getlist",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      jobId: z.number().int().optional().describe("Format - int64."),
      projectId: z.number().int().optional().describe("Format - int64."),
      jobNumber: z.string().optional(),
      totalGreater: z.number().optional().describe("Format - decimal."),
      totalLess: z.number().optional().describe("Format - decimal."),
      soldById: z.number().int().optional().describe("Format - int64."),
      soldByEmployeeId: z.number().int().optional().describe("Format - int64."),
      ids: z.string().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      soldAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      soldBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      status: z.string().optional(),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      orderBy: z.string().optional(),
      orderByDirection: z.string().optional(),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      locationId: z.number().int().optional().describe("Format - int64."),
  },
  async ({ tenant, jobId, projectId, jobNumber, totalGreater, totalLess, soldById, soldByEmployeeId, ids, page, pageSize, includeTotal, soldAfter, soldBefore, status, active, orderBy, orderByDirection, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, locationId }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/estimates`, {
              params: {
                  jobId,
                  projectId,
                  jobNumber,
                  totalGreater,
                  totalLess,
                  soldById,
                  soldByEmployeeId,
                  ids,
                  page,
                  pageSize,
                  includeTotal,
                  soldAfter,
                  soldBefore,
                  status,
                  active,
                  orderBy,
                  orderByDirection,
                  createdBefore,
                  createdOnOrAfter,
                  modifiedBefore,
                  modifiedOnOrAfter,
                  locationId
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Estimates Sell
  server.tool(
      "estimates_sell",
      {
          id: z.number().int().describe("Format - int64."),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
      },
      async ({ id, tenant }) => {
          try {
              const response = await api.put(`/tenant/${tenant}/estimates/${id}/sell`);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Estimates GetItems
  server.tool("estimates_get_items",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      estimateId: z.number().int().optional().describe("Format - int64."),
      ids: z.string().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned")
  },
  async ({ tenant, estimateId, ids, active, createdBefore, createdOnOrAfter, page, pageSize, includeTotal }) => {
      try {
          const endpoint = `/tenant/${tenant}/estimates/items`;
          const response = await api.get(endpoint, {
              params: {
                  estimateId: estimateId,
                  ids: ids,
                  active: active,
                  createdBefore: createdBefore,
                  createdOnOrAfter: createdOnOrAfter,
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  server.tool(
  "estimates_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      jobId: z.number().int().optional().describe("Job ID"),
      projectId: z.number().int().optional().describe("Project ID"),
      locationId: z.number().int().optional().describe("Location ID"),
      customerId: z.number().int().optional().describe("Customer ID"),
      name: z.string().optional().describe("Estimate Name"),
      jobNumber: z.string().optional().describe("Job Number"),
      statusValue: z.number().int().optional().describe("Status Value"),
      summary: z.string().optional().describe("Estimate Summary"),
      soldOn: z.string().optional().describe("Sold On Date (string)"),
      soldBy: z.number().int().optional().describe("Sold By User ID"),
      active: z.boolean().optional().describe("Active Flag"),
      items: z.array(z.object({
          skuAccount: z.string().optional().describe("SKU Account"),
          description: z.string().optional().describe("Item Description"),
          membershipTypeId: z.number().int().optional().describe("Membership Type ID"),
          qty: z.number().optional().describe("Quantity"),
          unitRate: z.number().optional().describe("Unit Rate"),
          unitCost: z.number().optional().describe("Unit Cost"),
          itemGroupName: z.string().optional().describe("Item Group Name"),
          itemGroupRootId: z.number().int().optional().describe("Item Group Root ID"),
          chargeable: z.boolean().optional().describe("Chargeable Flag")
      })).optional().describe("Estimate Items"),
      externalLinks: z.array(z.object({
          name: z.string().optional().describe("External Link Name"),
          url: z.string().optional().describe("External Link URL")
      })).optional().describe("External Links"),
      subtotal: z.number().optional().describe("Subtotal Amount"),
      tax: z.number().optional().describe("Tax Amount"),
      businessUnitId: z.number().int().optional().describe("Business Unit ID")
  },
  async ({ tenant, jobId, projectId, locationId, customerId, name, jobNumber, statusValue, summary, soldOn, soldBy, active, items, externalLinks, subtotal, tax, businessUnitId }) => {
      try {
          const endpoint = `/tenant/${tenant}/estimates`;
  
          const payload = {
              jobId: jobId,
              projectId: projectId,
              locationId: locationId,
              customerId: customerId,
              name: name,
              jobNumber: jobNumber,
              status: statusValue ? { value: statusValue } : undefined,
              summary: summary,
              soldOn: soldOn,
              soldBy: soldBy,
              active: active,
              items: items,
              externalLinks: externalLinks,
              subtotal: subtotal,
              tax: tax,
              businessUnitId: businessUnitId
          };
  
          const response = await api.post(endpoint, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Estimates Unsell
  server.tool("estimates_unsell",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.put(`/tenant/${tenant}/estimates/${id}/unsell`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Estimates Dismiss
  server.tool("estimates_dismiss",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.put(`/tenant/${tenant}/estimates/${id}/dismiss`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Estimates_DeleteItem
  server.tool("estimates_delete_item",
  {
      id: z.number().int().describe("Format - int64."),
      itemId: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, itemId, tenant }) => {
      try {
      const response = await api.delete(`/tenant/${tenant}/estimates/${id}/items/${itemId}`);
      return {
          content: [{ type: "text", text: "Item deleted successfully." }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Estimates Put Item
  server.tool("estimates_put_item",
  {
      id: z.number().int().describe("Format - int64. Item ID"),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      skuAccount: z.string().optional().describe("SKU Account"),
      description: z.string().optional().describe("Description"),
      membershipTypeId: z.number().int().optional().describe("Membership Type ID"),
      qty: z.number().optional().describe("Quantity"),
      unitRate: z.number().optional().describe("Unit Rate"),
      unitCost: z.number().optional().describe("Unit Cost"),
      itemGroupName: z.string().optional().describe("Item Group Name"),
      itemGroupRootId: z.number().int().optional().describe("Item Group Root ID"),
      chargeable: z.boolean().optional().describe("Chargeable")
  },
  async ({ id, tenant, skuAccount, description, membershipTypeId, qty, unitRate, unitCost, itemGroupName, itemGroupRootId, chargeable }) => {
      try {
          const response = await api.put(`/tenant/${tenant}/estimates/${id}/items`, {
              skuAccount: skuAccount,
              description: description,
              membershipTypeId: membershipTypeId,
              qty: qty,
              unitRate: unitRate,
              unitCost: unitCost,
              itemGroupName: itemGroupName,
              itemGroupRootId: itemGroupRootId,
              chargeable: chargeable
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Estimates Export Estimates
  server.tool("estimates_export_estimates",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
      const endpoint = `/tenant/${tenant}/estimates/export`;
      const response = await api.get(endpoint, {
          params: {
          from: from || undefined,
          includeRecentChanges: includeRecentChanges || undefined
          }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );

  // Tool: scheduler_schedulers
server.tool(
  "scheduler_schedulers",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned")
  },
  async ({ tenant, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal }) => {
      try {
          const endpoint = `/tenant/${tenant}/schedulers`;
          const response = await api.get(endpoint, {
              params: {
                  createdBefore,
                  createdOnOrAfter,
                  modifiedBefore,
                  modifiedOnOrAfter,
                  page,
                  pageSize,
                  includeTotal
              }
          });

          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);
// Tool: Scheduler Scheduler Performance
server.tool(
"scheduler_scheduler_performance",
{
  tenant: z.number().int().describe("Tenant ID"),
  id: z.string().describe("Scheduler ID"),
  sessionCreatedOnOrAfter: z.string().datetime().describe("Session created on or after (date-time in RFC3339)"),
  sessionCreatedBefore: z.string().datetime().describe("Session created before (date-time in RFC3339)")
},
async ({ tenant, id, sessionCreatedOnOrAfter, sessionCreatedBefore }) => {
  try {
  const response = await api.get(`/tenant/${tenant}/schedulers/${id}/performance`, {
      params: { sessionCreatedOnOrAfter, sessionCreatedBefore }
  });

  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);
// Tool: scheduler_schedulersessions
server.tool(
  "scheduler_schedulersessions",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      id: z.string().describe("Scheduler ID"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned")
  },
  async ({ tenant, id, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/schedulers/${id}/sessions`, {
              params: {
                  createdBefore,
                  createdOnOrAfter,
                  modifiedBefore,
                  modifiedOnOrAfter,
                  page,
                  pageSize,
                  includeTotal
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
);

// Tool: Export_ServiceAgreements
server.tool("export_service_agreements",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/export/service-agreements`, {
          params: { from, includeRecentChanges }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  
  server.tool("ServiceAgreements_GetList",
    {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      customerIds: z.string().nullable().optional().describe("Filters by customer IDs"),
      businessUnitIds: z.string().nullable().optional().describe("Filters by business unit IDs"),
      status: z.string().nullable().optional().describe("Filters by service agreement status\nValues: [Draft, Sent, Rejected, Accepted, Activated, Canceled, Expired, AutoRenew]"),
      createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      sort: z.string().nullable().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, Name, CreatedOn, ModifiedOn, StartDate, EndDate")
  },
      async ({ tenant, ids, customerIds, businessUnitIds, status, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, page, pageSize, includeTotal, sort }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/service-agreements`, {
                  params: {
                      ids: ids || undefined,
                      customerIds: customerIds || undefined,
                      businessUnitIds: businessUnitIds || undefined,
                      status: status || undefined,
                      createdBefore: createdBefore || undefined,
                      createdOnOrAfter: createdOnOrAfter || undefined,
                      modifiedBefore: modifiedBefore || undefined,
                      modifiedOnOrAfter: modifiedOnOrAfter || undefined,
                      page: page || undefined,
                      pageSize: pageSize || undefined,
                      includeTotal: includeTotal || undefined,
                      sort: sort || undefined
                  }
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: ServiceAgreements Get
  server.tool("service_agreements_get",
  {
      id: z.number().int().describe("Format - int64. Service agreement ID"),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/service-agreements/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );

  // Tool: Employees Create
server.tool("employees_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      body: z.object({}).optional().describe("Request body (optional)")
  },
  async ({ tenant, body }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/employees`, body);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Employees_Get
  server.tool(
  "employees_get",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/employees/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Employees_GetList
  server.tool("employees_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      userIds: z.string().nullable().optional().describe("Perform lookup by multiple User Ids (maximum 50)"),
      name: z.string().nullable().optional().describe("Filters records by name (case-insensitive 'contains' operation)"),
      active: z.string().nullable().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)")
  },
  
  async ({ tenant, ids, userIds, name, active, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/employees`, {
              params: {
                  ids: ids || undefined,
                  userIds: userIds || undefined,
                  name: name || undefined,
                  active: active || undefined,
                  page: page || undefined,
                  pageSize: pageSize || undefined,
                  includeTotal: includeTotal || undefined,
                  createdBefore: createdBefore || undefined,
                  createdOnOrAfter: createdOnOrAfter || undefined,
                  modifiedBefore: modifiedBefore || undefined,
                  modifiedOnOrAfter: modifiedOnOrAfter || undefined
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Employees_Update
  server.tool("Employees_Update",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.record(z.any()).optional().describe("The payload to update the employee")
  },
  async ({ id, tenant, payload }) => {
      try {
          const endpoint = `/tenant/${tenant}/employees/${id}`;
          const response = await api.patch(endpoint, payload);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Employees AccountActions
  server.tool(
      "employees_accountactions",
      {
          id: z.number().int().describe("Format - int64."),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
      },
      async ({ id, tenant }) => {
          try {
              const response = await api.post(`/tenant/${tenant}/employees/${id}/account-actions`);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Export_Employees
  server.tool("export_employees",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field. When not specified, the export process starts from the beginning. Use custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker. Note this may cause the same results appearing multiple times on consecutive requests.")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/export/employees`, {
          params: { from, includeRecentChanges }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Export Technicians
  server.tool(
  "export_technicians",
  {
      tenant: z.number().int().describe("Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token or custom date string"),
      includeRecentChanges: z.boolean().nullable().optional().describe("Include recent changes quickly")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
          const endpoint = `/tenant/${tenant}/export/technicians`;
          const response = await api.get(endpoint, {
              params: {
                  from: from || undefined, // Ensure null or undefined is passed correctly
                  includeRecentChanges: includeRecentChanges || undefined, // Ensure null or undefined is passed correctly
              }
          });
  
          //console.log(JSON.stringify(response.data));
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Technicians Create
  server.tool("technicians_create",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ tenant }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/technicians`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Technicians Get
  server.tool(
  "technicians_get",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/technicians/${id}`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: technicians_get_list
  server.tool("technicians_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      userIds: z.string().nullable().optional().describe("Perform lookup by multiple User Ids (maximum 50)"),
      name: z.string().nullable().optional().describe("Filters records by name (case-insensitive 'contains' operation)"),
      active: z.string().nullable().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)")
  },
  async ({ tenant, ids, userIds, name, active, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter }) => {
      try {
          const endpoint = `/tenant/${tenant}/technicians`;
          const response = await api.get(endpoint, {
              params: {
                  ids: ids || undefined,
                  userIds: userIds || undefined,
                  name: name || undefined,
                  active: active || undefined,
                  page: page || undefined,
                  pageSize: pageSize || undefined,
                  includeTotal: includeTotal || undefined,
                  createdBefore: createdBefore || undefined,
                  createdOnOrAfter: createdOnOrAfter || undefined,
                  modifiedBefore: modifiedBefore || undefined,
                  modifiedOnOrAfter: modifiedOnOrAfter || undefined
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Technicians Update
  server.tool(
      "technicians_update",
      {
          id: z.number().int().describe("Format - int64."),
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          payload: z.record(z.any()).optional().describe("Payload for the update"),
      },
      async ({ id, tenant, payload }) => {
          try {
              const endpoint = `/tenant/${tenant}/technicians/${id}`;
              const response = await api.patch(endpoint, payload ? JSON.stringify(payload) : undefined);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Technicians AccountActions
  server.tool("technicians_AccountActions",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.post(`/tenant/${tenant}/technicians/${id}/account-actions`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: BusinessUnits Get
  server.tool(
  "business_units_get",
  {
      id: z.number().int().describe("Format - int64."),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      externalDataApplicationGuid: z.string().uuid().optional().describe("Format - guid.")
  },
  async ({ id, tenant, externalDataApplicationGuid }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/business-units/${id}`, {
              params: { externalDataApplicationGuid }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: user_roles_get_list
  server.tool("user_roles_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().nullable().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      name: z.string().nullable().optional().describe("Filters records by name (case-insensitive 'contains' operation)"),
      active: z.string().nullable().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      page: z.number().int().nullable().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().nullable().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().nullable().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      employeeType: z.string().nullable().optional().describe("Filter roles by employee type\nValues: [None, Employee, Technician, All]")
  },
  async ({ tenant, ids, name, active, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, employeeType }) => {
      try {
          const endpoint = `/tenant/${tenant}/user-roles`;
          const response = await api.get(endpoint, {
              params: {
                  ids: ids || undefined,
                  name: name || undefined,
                  active: active || undefined,
                  page: page || undefined,
                  pageSize: pageSize || undefined,
                  includeTotal: includeTotal || undefined,
                  createdBefore: createdBefore || undefined,
                  createdOnOrAfter: createdOnOrAfter || undefined,
                  employeeType: employeeType || undefined
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: business_units_get_list
  server.tool("business_units_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      ids: z.string().optional().nullable().describe("Perform lookup by multiple IDs (maximum 50)"),
      name: z.string().optional().nullable().describe("Filters records by name (case-insensitive 'contains' operation)"),
      active: z.string().optional().nullable().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      page: z.number().int().optional().nullable().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().nullable().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().nullable().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().nullable().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      externalDataApplicationGuid: z.string().uuid().optional().nullable().describe("Format - guid. If this guid is provided, external data corresponding to\nthis application guid will be returned.")
  },
  async ({ tenant, ids, name, active, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, externalDataApplicationGuid }) => {
      try {
          const endpoint = `/tenant/${tenant}/business-units`;
          const response = await api.get(endpoint, {
              params: {
                  ids: ids || undefined,
                  name: name || undefined,
                  active: active || undefined,
                  page: page || undefined,
                  pageSize: pageSize || undefined,
                  includeTotal: includeTotal || undefined,
                  createdBefore: createdBefore || undefined,
                  createdOnOrAfter: createdOnOrAfter || undefined,
                  modifiedBefore: modifiedBefore || undefined,
                  modifiedOnOrAfter: modifiedOnOrAfter || undefined,
                  externalDataApplicationGuid: externalDataApplicationGuid || undefined
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: BusinessUnits_Update
  server.tool("business_units_update",
  {
      id: z.number().int().describe("Format - int64. BusinessUnit Id"),
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      payload: z.record(z.any()).optional().describe("Payload for the update")
  },
  async ({ id, tenant, payload }) => {
      try {
          const endpoint = `/tenant/${tenant}/business-units/${id}`;
          const response = await api.patch(endpoint, payload ? JSON.stringify(payload) : null);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Export_BusinessUnits
  server.tool("export_business_units",
  {
      tenant: z.number().int().describe("Tenant ID"),
      from: z.string().optional().describe("Continuation token or custom date string"),
      includeRecentChanges: z.boolean().optional().describe("Include recent changes")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/export/business-units`, {
              params: { from, includeRecentChanges }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Export_TagTypes
  server.tool(
      "export_tagtypes",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
          includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests."),
      },
      async ({ tenant, from, includeRecentChanges }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/export/tag-types`, {
                  params: {
                      from: from || undefined,
                      includeRecentChanges: includeRecentChanges || undefined,
                  },
              });
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: TagTypes_GetList
  server.tool(
  "TagTypes_GetList",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339)."),
      sort: z.string().optional(),
  },
  async ({ tenant, page, pageSize, includeTotal, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort }) => {
      try {
          let endpoint = `/tenant/${tenant}/tag-types`;
          const params = { page, pageSize, includeTotal, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, sort };
          const response = await api.get(endpoint, { params });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }],
          };
      }
  }
  );

  // Tool: ClientSideData Get
server.tool(
  "client_side_data_get",
  {
      tenant: z.number().int().describe("Tenant ID"),
  },
  async ({ tenant }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/data`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }],
          };
      }
  }
);
// Tool: Tasks GetTask
server.tool("tasks_get_task",
{
  id: z.number().int().describe("Format - int64. Task ID"),
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  includeSubtasks: z.boolean().optional().nullable().describe("Include Subtasks")
},
async ({ id, tenant, includeSubtasks }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/tasks/${id}`, {
          params: { includeSubtasks }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Tasks_GetTasks
server.tool("tasks_get_tasks",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
  pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
  includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
  active: z.string().optional().describe("Values: [True, Any, False]"),
  createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Created date before"),
  createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Created date on or after"),
  modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Modified date before"),
  modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Modified date on or after"),
  reportedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Reported date before"),
  reportedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Reported On or After"),
  completeBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Completed Before"),
  completeOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Completed On or After"),
  isClosed: z.boolean().optional().describe("Is Closed\nThis property is deprecated. Use Statuses instead."),
  statuses: z.string().optional().describe("Task Status"),
  ids: z.string().optional().describe("Task Ids (comma separated Ids)"),
  name: z.string().optional().describe("Name"),
  includeSubtasks: z.boolean().optional().describe("Include Subtasks"),
  businessUnitIds: z.string().optional().describe("Business Unit Ids (comma separated Ids)"),
  employeeTaskTypeIds: z.string().optional().describe("EmployeeTaskType Ids (comma separated Ids)"),
  employeeTaskSourceIds: z.string().optional().describe("EmployeeTaskSource Ids (comma separated Ids)"),
  employeeTaskResolutionIds: z.string().optional().describe("EmployeeTaskResolution Ids (comma separated Ids)"),
  reportedById: z.number().int().optional().describe("Format - int64. Reported By Id"),
  assignedToId: z.number().int().optional().describe("Format - int64. Assigned to Id"),
  involvedEmployeeIdList: z.string().optional().describe("Involved Employee Ids (comma separated Ids)"),
  customerId: z.number().int().optional().describe("Format - int64. Customer Id"),
  jobId: z.number().int().optional().describe("Format - int64. Job Id"),
  projectId: z.number().int().optional().describe("Format - int64. Project Id"),
  priorities: z.string().optional().describe("Priorities (comma separated values)"),
  taskNumber: z.number().int().optional().describe("Format - int64. Task Number"),
  jobNumber: z.string().optional().describe("Job Number"),
  sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, CreatedOn, DescriptionModifiedOn, CompletedBy, Priority")
},
async ({ tenant, page, pageSize, includeTotal, active, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, reportedBefore, reportedOnOrAfter, completeBefore, completeOnOrAfter, isClosed, statuses, ids, name, includeSubtasks, businessUnitIds, employeeTaskTypeIds, employeeTaskSourceIds, employeeTaskResolutionIds, reportedById, assignedToId, involvedEmployeeIdList, customerId, jobId, projectId, priorities, taskNumber, jobNumber, sort }) => {
  try {
      const response = await api.get(`/tenant/${tenant}/tasks`, {
          params: {
              page,
              pageSize,
              includeTotal,
              active,
              createdBefore,
              createdOnOrAfter,
              modifiedBefore,
              modifiedOnOrAfter,
              reportedBefore,
              reportedOnOrAfter,
              completeBefore,
              completeOnOrAfter,
              isClosed,
              statuses,
              ids,
              name,
              includeSubtasks,
              businessUnitIds,
              employeeTaskTypeIds,
              employeeTaskSourceIds,
              employeeTaskResolutionIds,
              reportedById,
              assignedToId,
              involvedEmployeeIdList,
              customerId,
              jobId,
              projectId,
              priorities,
              taskNumber,
              jobNumber,
              sort
          }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Tasks Create
server.tool("tasks_create",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  reportedById: z.number().int().optional().describe("ID of the person who reported the task"),
  assignedToId: z.number().int().optional().describe("ID of the person the task is assigned to"),
  isClosed: z.boolean().optional().describe("Whether the task is closed"),
  status: z.string().optional().describe("Status of the task"),
  name: z.string().describe("Name of the task"),
  businessUnitId: z.number().int().optional().describe("Business unit ID"),
  employeeTaskTypeId: z.number().int().optional().describe("Employee task type ID"),
  employeeTaskSourceId: z.number().int().optional().describe("Employee task source ID"),
  employeeTaskResolutionId: z.number().int().optional().describe("Employee task resolution ID"),
  reportedDate: z.string().optional().describe("Date the task was reported"),
  completeBy: z.string().optional().describe("Date the task should be completed by"),
  startedOn: z.string().optional().describe("Date the task was started on"),
  involvedEmployeeIdList: z.array(z.number().int()).optional().describe("List of involved employee IDs"),
  customerId: z.number().int().optional().describe("Customer ID"),
  jobId: z.number().int().optional().describe("Job ID"),
  projectId: z.number().int().optional().describe("Project ID"),
  description: z.string().optional().describe("Description of the task"),
  priority: z.string().optional().describe("Priority of the task"),
  customerName: z.string().optional().describe("Customer name"),
  jobNumber: z.string().optional().describe("Job number"),
  refundIssued: z.number().optional().describe("Refund issued amount"),
  descriptionModifiedOn: z.string().optional().describe("Date the description was last modified"),
  descriptionModifiedBy: z.string().optional().describe("User who modified the description"),
  createdOn: z.string().optional().describe("Date the task was created"),
  modifiedOn: z.string().optional().describe("Date the task was last modified")
},
async ({ tenant, reportedById, assignedToId, isClosed, status, name, businessUnitId, employeeTaskTypeId, employeeTaskSourceId, employeeTaskResolutionId, reportedDate, completeBy, startedOn, involvedEmployeeIdList, customerId, jobId, projectId, description, priority, customerName, jobNumber, refundIssued, descriptionModifiedOn, descriptionModifiedBy, createdOn, modifiedOn }) => {
  try {
      const response = await api.post(`/tenant/${tenant}/tasks`, {
          reportedById,
          assignedToId,
          isClosed,
          status,
          name,
          businessUnitId,
          employeeTaskTypeId,
          employeeTaskSourceId,
          employeeTaskResolutionId,
          reportedDate,
          completeBy,
          startedOn,
          involvedEmployeeIdList,
          customerId,
          jobId,
          projectId,
          description,
          priority,
          customerName,
          jobNumber,
          refundIssued,
          descriptionModifiedOn,
          descriptionModifiedBy,
          createdOn,
          modifiedOn
      });

      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
  } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
  }
}
);
// Tool: Tasks CreateSubtask
server.tool("tasks_create_subtask",
{
  tenant: z.number().int().describe("Format - int64. Tenant ID"),
  id: z.number().int().describe("Format - int64."),
  payload: z.object({}).optional().describe("Subtask Details"),
},
async ({ tenant, id, payload }) => {
  try {
  const response = await api.post(`/tenant/${tenant}/tasks/${id}/subtasks`, payload ? JSON.stringify(payload) : null);

  return {
      content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
      content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
}
);

// Tool: OptInOut GetAllOptOuts
server.tool(
  "opt_in_out_get_all_opt_outs",
  {
  tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ tenant }) => {
  try {
  const response = await api.get(`/v3/tenant/${tenant}/optinouts/optouts`);
  return {
  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
  content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
  }
  );
  // Tool: OptInOut Create OptOut List
  server.tool(
  "opt_in_out_create_opt_out_list",
  {
  tenant: z.number().int().describe("Tenant ID"),
  contact_numbers: z.array(z.string()).describe("List of contact numbers to opt-out")
  },
  async ({ tenant, contact_numbers }) => {
  try {
  const response = await api.post(`/v3/tenant/${tenant}/optinouts/optouts`, {
  contactNumbers: contact_numbers
  });
  
  return {
  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
  };
  } catch (error: any) {
  return {
  content: [{ type: "text", text: `Error: ${error.message}` }]
  };
  }
  }
  );
  // Tool: calls_calls
  server.tool("calls_calls",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      ids: z.string().optional().describe("Perform lookup by multiple IDs (maximum 50)"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      createdAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created after certain date/time (in UTC)"),
      modifiedAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified after certain date/time (in UTC)"),
      campaignId: z.number().int().optional().describe("Format - int64. Campaign ID"),
      agentId: z.number().int().optional().describe("Format - int64. Agent ID (number)"),
      minDuration: z.number().int().optional().describe("Format - int32. Minimum call duration (number of seconds)"),
      phoneNumberCalled: z.string().optional().describe("The phone number that was called (string)"),
      callerPhoneNumber: z.string().optional().describe("The caller's phone number (string)"),
      agentName: z.string().optional().describe("Agent name (string)"),
      agentIsExternal: z.boolean().optional().describe("Is agent external flag (boolean)"),
      agentExternalId: z.number().int().optional().describe("Format - int64. Agent external ID (number)"),
      sort: z.string().optional().describe("The Sorting field, possible values: Id, CreatedOn, ModifiedOn.\nThe Sorting is ascending by default, add the '-' character to use descending (for example -Id)")
  },
  async ({ tenant, page, pageSize, includeTotal, ids, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, active, createdAfter, modifiedAfter, campaignId, agentId, minDuration, phoneNumberCalled, callerPhoneNumber, agentName, agentIsExternal, agentExternalId, sort }) => {
      try {
          const response = await api.get(`/v3/tenant/${tenant}/calls`, {
              params: {
                  page: page,
                  pageSize: pageSize,
                  includeTotal: includeTotal,
                  ids: ids,
                  createdBefore: createdBefore,
                  createdOnOrAfter: createdOnOrAfter,
                  modifiedBefore: modifiedBefore,
                  modifiedOnOrAfter: modifiedOnOrAfter,
                  active: active,
                  createdAfter: createdAfter,
                  modifiedAfter: modifiedAfter,
                  campaignId: campaignId,
                  agentId: agentId,
                  minDuration: minDuration,
                  phoneNumberCalled: phoneNumberCalled,
                  callerPhoneNumber: callerPhoneNumber,
                  agentName: agentName,
                  agentIsExternal: agentIsExternal,
                  agentExternalId: agentExternalId,
                  sort: sort
              }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: OptInOut_GetOptOutList
  server.tool(
      "OptInOut_GetOptOutList",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          body: z.array(z.string()).describe("Array of contact numbers to check"),
      },
      async ({ tenant, body }) => {
          try {
              const response = await api.post(`/v3/tenant/${tenant}/optinouts/optouts/getlist`, body);
  
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }],
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }],
              };
          }
      }
  );
  // Tool: Calls GetDetails
  server.tool("calls_getdetails",
  {
      id: z.number().int().describe("Format - int64. Id of the call."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/v2/tenant/${tenant}/calls/${id}`);
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Calls_Update
  server.tool("calls_update",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      id: z.number().int().describe("Format - int64. Id of updating call."),
      body: z.record(z.any()).optional().describe("Request body"),
  },
  async ({ tenant, id, body }) => {
      try {
          const response = await api.put(`/v2/tenant/${tenant}/calls/${id}`, body);
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Calls GetRecording
  server.tool(
  "calls_getrecording",
  {
      id: z.number().int().describe("Format - int64. Id of the call."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const endpoint = `/v2/tenant/${tenant}/calls/${id}/recording`;
      const response = await api.get(endpoint, {
          responseType: 'arraybuffer'
      });
  
      if (response.status === 200) {
          const buffer = Buffer.from(response.data, 'binary');
          const base64 = buffer.toString('base64');
  
          return {
              content: [{ type: "text", text: `data:audio/mpeg;base64,${base64}` }]
          };
      } else {
          return {
              content: [{ type: "text", text: `Unexpected status code: ${response.status}` }]
          };
      }
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Calls GetVoiceMail
  server.tool("calls_get_voice_mail",
  {
      id: z.number().int().describe("Format - int64. Id of the call."),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
      const response = await api.get(`/v2/tenant/${tenant}/calls/${id}/voicemail`, {
          responseType: 'arraybuffer' // Important for handling binary data
      });
  
      // Convert the ArrayBuffer to a Base64 string
      const buffer = Buffer.from(response.data);
      const base64 = buffer.toString('base64');
  
      return {
          content: [{ type: "text", text: base64 }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Calls Get Calls
  server.tool("calls_get_calls",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      modifiedBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Modified before a certain date/time (as date-time in RFC3339), not inclusive"),
      modifiedOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Modified on or after a certain date/time (as date-time in RFC3339), inclusive"),
      createdOnOrAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Created on or after a certain date/time (as date-time in RFC3339), inclusive"),
      modifiedAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339). Modified after a certain date/time (as date-time in RFC3339), not inclusive"),
      minDuration: z.number().int().nullable().optional().describe("Format - int32. Minimum call duration (number)"),
      phoneNumberCalled: z.string().optional().describe("The phone number that was called (string)"),
      campaignId: z.number().int().nullable().optional().describe("Format - int64. Campaign ID"),
      agentId: z.number().int().nullable().optional().describe("Format - int64. Agent ID (number)"),
      agentName: z.string().optional().describe("Agent name (string)"),
      agentIsExternal: z.boolean().nullable().optional().describe("Is agent external flag (boolean)"),
      agentExternalId: z.number().int().nullable().optional().describe("Format - int64. Agent external ID (number)"),
      orderBy: z.string().optional().describe("Sorting (string with possible values Id (default), createdOn, or modifiedOn)"),
      orderByDirection: z.string().optional().describe("Sorting direction (string with possible values asc (default) or desc)"),
      activeOnly: z.boolean().optional(),
      createdAfter: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339)."),
      createdBefore: z.string().datetime().nullable().optional().describe("Format - date-time (as date-time in RFC3339)."),
      ids: z.array(z.number().int()).optional(),
      page: z.number().int().nullable().optional().describe("Format - int32."),
      pageSize: z.number().int().nullable().optional().describe("Format - int32.")
  },
  async ({ tenant, modifiedBefore, modifiedOnOrAfter, createdOnOrAfter, modifiedAfter, minDuration, phoneNumberCalled, campaignId, agentId, agentName, agentIsExternal, agentExternalId, orderBy, orderByDirection, activeOnly, createdAfter, createdBefore, ids, page, pageSize }) => {
      try {
      const response = await api.get(`/v2/tenant/${tenant}/calls`, {
          params: {
          modifiedBefore,
          modifiedOnOrAfter,
          createdOnOrAfter,
          modifiedAfter,
          minDuration,
          phoneNumberCalled,
          campaignId,
          agentId,
          agentName,
          agentIsExternal,
          agentExternalId,
          orderBy,
          orderByDirection,
          activeOnly,
          createdAfter,
          createdBefore,
          ids,
          page,
          pageSize
          }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: Export Calls
  server.tool("export_calls",
  {
      tenant: z.number().int().describe("Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token or custom date string"),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use true to receive recent changes quicker")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
      const response = await api.get(`/v2/tenant/${tenant}/export/calls`, {
          params: { from, includeRecentChanges }
      });
  
      if (response.status === 200) {
          return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } else {
          return {
          content: [{ type: "text", text: `Unexpected status code: ${response.status}` }]
          };
      }
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );

  // Tool: ActivitiesControllers_Get
server.tool("activities_controllers_get",
  {
      id: z.number().int().describe("Format - int64. The activity ID"),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/activities/${id}`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Activities Controllers Get List
  server.tool("activities_controllers_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      sort: z.string().optional().describe("Applies sorting by specified fields")
  },
  async ({ tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, active, sort }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/activities`, {
          params: { page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, active, sort }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );
  // Tool: ActivityCategories Get
  server.tool(
  "activity_categories_get",
  {
      tenant: z.number().int().describe("Tenant ID"),
      id: z.number().int().describe("The activity category ID")
  },
  async ({ tenant, id }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/activity-categories/${id}`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: activitycategories_getlist
  server.tool("activitycategories_getlist",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, active, sort }) => {
      try {
          const endpoint = `/tenant/${tenant}/activity-categories`;
          const response = await api.get(endpoint, {
              params: { page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, active, sort }
          });
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: activity_types_get
  server.tool("activity_types_get",
  {
      id: z.number().int().describe("Format - int64. The activity types ID"),
      tenant: z.number().int().describe("Format - int64. Tenant ID")
  },
  async ({ id, tenant }) => {
      try {
          const response = await api.get(`/tenant/${tenant}/activity-types/${id}`);
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: activity_types_get_list
  server.tool(
  "activity_types_get_list",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      page: z.number().int().optional().describe("Format - int32. The logical number of page to return, starting from 1"),
      pageSize: z.number().int().optional().describe("Format - int32. How many records to return (50 by default)"),
      includeTotal: z.boolean().optional().describe("Whether total count should be returned"),
      createdBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created before certain date/time (in UTC)"),
      createdOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items created on or after certain date/time (in UTC)"),
      modifiedBefore: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified before certain date/time (in UTC)"),
      modifiedOnOrAfter: z.string().datetime().optional().describe("Format - date-time (as date-time in RFC3339). Return items modified on or after certain date/time (in UTC)"),
      active: z.string().optional().describe("What kind of items should be returned (only active items will be returned by default)\nValues: [True, Any, False]"),
      sort: z.string().optional().describe("Applies sorting by the specified field:\n\"?sort=+FieldName\" for ascending order,\n\"?sort=-FieldName\" for descending order.\n\nAvailable fields are: Id, ModifiedOn, CreatedOn.")
  },
  async ({ tenant, page, pageSize, includeTotal, createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter, active, sort }) => {
      try {
          const endpoint = `/tenant/${tenant}/activity-types`;
          const response = await api.get(endpoint, {
              params: {
                  page,
                  pageSize,
                  includeTotal,
                  createdBefore,
                  createdOnOrAfter,
                  modifiedBefore,
                  modifiedOnOrAfter,
                  active,
                  sort
              }
          });
  
          return {
              content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
          };
      } catch (error: any) {
          return {
              content: [{ type: "text", text: `Error: ${error.message}` }]
          };
      }
  }
  );
  // Tool: Export Activity Categories
  server.tool(
      "Export_ActivityCategories",
      {
          tenant: z.number().int().describe("Format - int64. Tenant ID"),
          from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
          includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
      },
      async ({ tenant, from, includeRecentChanges }) => {
          try {
              const response = await api.get(`/tenant/${tenant}/export/activity-categories`, {
                  params: {
                      from: from || undefined,
                      includeRecentChanges: includeRecentChanges || undefined
                  }
              });
              return {
                  content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
              };
          } catch (error: any) {
              return {
                  content: [{ type: "text", text: `Error: ${error.message}` }]
              };
          }
      }
  );
  // Tool: Export_Activities
  server.tool("export_activities",
  {
      tenant: z.number().int().describe("Format - int64. Tenant ID"),
      from: z.string().nullable().optional().describe("Continuation token received from previous export request in \"continueFrom\" field.\nWhen not specified, the export process starts from the beginning.\\\nUse custom date strings, e.g. \"2020-01-01\" to start the export process from the certain point in time."),
      includeRecentChanges: z.boolean().nullable().optional().describe("Use \"true\" to start receiving the most recent changes quicker.\nNote this may cause the same results appearing multiple times on consecutive requests.")
  },
  async ({ tenant, from, includeRecentChanges }) => {
      try {
      const response = await api.get(`/tenant/${tenant}/export/activities`, {
          params: { from, includeRecentChanges }
      });
      return {
          content: [{ type: "text", text: String(JSON.stringify(response.data)) }]
      };
      } catch (error: any) {
      return {
          content: [{ type: "text", text: `Error: ${error.message}` }]
      };
      }
  }
  );

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);