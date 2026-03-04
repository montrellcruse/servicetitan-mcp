import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import {
  activeFilterParam,
  buildParams,
  dateFilterParams,
  paginationParams,
  toolError,
  toolResult,
} from "../../utils.js";

const externalDataEntrySchema = z
  .object({
    key: z.string().describe("External data key"),
    value: z.string().describe("External data value"),
  })
  .describe("External data entry");

const employeeAddressSchema = z
  .object({
    street: z.string().optional().describe("Street address"),
    unit: z.string().optional().describe("Address unit/suite"),
    city: z.string().optional().describe("City"),
    state: z.string().optional().describe("State/province"),
    zip: z.string().optional().describe("Postal code"),
    country: z.string().optional().describe("Country"),
  })
  .describe("Employee address");

const emergencyContactSchema = z
  .object({
    name: z.string().optional().describe("Emergency contact name"),
    relationship: z.string().optional().describe("Emergency contact relationship"),
    phoneNumber: z.string().optional().describe("Emergency contact phone number"),
  })
  .describe("Emergency contact details");

const employeePayloadSchema = z
  .object({
    firstName: z.string().optional().describe("Employee first name"),
    middleName: z.string().optional().describe("Employee middle name"),
    lastName: z.string().optional().describe("Employee last name"),
    nickname: z.string().optional().describe("Employee nickname"),
    employeeNumber: z.string().optional().describe("Employee number/code"),
    email: z.string().optional().describe("Primary email address"),
    phoneNumber: z.string().optional().describe("Primary phone number"),
    mobilePhoneNumber: z.string().optional().describe("Mobile phone number"),
    active: z.boolean().optional().describe("Whether the employee is active"),
    userId: z.number().int().optional().describe("Associated user ID"),
    userRoleId: z.number().int().optional().describe("Associated user role ID"),
    businessUnitId: z.number().int().optional().describe("Default business unit ID"),
    technicianId: z.number().int().optional().describe("Associated technician ID"),
    hireDate: z.string().optional().describe("Hire date/time in RFC3339 format"),
    terminationDate: z
      .string()
      .optional()
      .describe("Termination date/time in RFC3339 format"),
    address: employeeAddressSchema.optional().describe("Employee mailing address"),
    emergencyContact: emergencyContactSchema.optional().describe("Emergency contact"),
    externalData: z
      .array(externalDataEntrySchema)
      .optional()
      .describe("External data entries"),
  })
  .passthrough();

const employeeIdSchema = z.object({
  id: z.number().int().describe("Employee ID"),
});

const employeeCreateSchema = z.object({
  body: employeePayloadSchema.optional().describe("Employee create payload"),
});

const employeeUpdateSchema = employeeIdSchema.extend({
  body: employeePayloadSchema.optional().describe("Employee update payload"),
});

const employeeListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...activeFilterParam(),
      ids: z.string().optional().describe("Comma-separated employee IDs (max 50)"),
      userIds: z.string().optional().describe("Comma-separated user IDs (max 50)"),
      name: z
        .string()
        .optional()
        .describe("Filter employees by name (case-insensitive contains)"),
    }),
  ),
);

const employeeExportSchema = z.object({
  from: z
    .string()
    .optional()
    .describe("Continuation token from previous response or custom start date"),
  includeRecentChanges: z
    .boolean()
    .optional()
    .describe("Prioritize recent changes in the export stream"),
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerPeopleEmployeeTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "people_employees_create",
    domain: "people",
    operation: "write",
    description: "Create an employee",
    schema: employeeCreateSchema.shape,
    handler: async (params) => {
      const input = employeeCreateSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/employees", input.body);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_employees_get",
    domain: "people",
    operation: "read",
    description: "Get an employee by ID",
    schema: employeeIdSchema.shape,
    handler: async (params) => {
      const { id } = employeeIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/employees/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_employees_list",
    domain: "people",
    operation: "read",
    description: "List employees",
    schema: employeeListSchema.shape,
    handler: async (params) => {
      const input = employeeListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/employees",
          buildParams({
            ids: input.ids,
            userIds: input.userIds,
            name: input.name,
            active: input.active,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_employees_update",
    domain: "people",
    operation: "write",
    description: "Update an employee",
    schema: employeeUpdateSchema.shape,
    handler: async (params) => {
      const { id, body } = employeeUpdateSchema.parse(params);

      try {
        const data = await client.patch(`/tenant/{tenant}/employees/${id}`, body);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_employees_accountactions",
    domain: "people",
    operation: "write",
    description: "Run account actions for an employee",
    schema: employeeIdSchema.shape,
    handler: async (params) => {
      const { id } = employeeIdSchema.parse(params);

      try {
        const data = await client.post(`/tenant/{tenant}/employees/${id}/account-actions`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "people_employees_export",
    domain: "people",
    operation: "read",
    description: "Export employees",
    schema: employeeExportSchema.shape,
    handler: async (params) => {
      const input = employeeExportSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/export/employees",
          buildParams({
            from: input.from,
            includeRecentChanges: input.includeRecentChanges,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
