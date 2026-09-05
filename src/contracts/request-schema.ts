import { z } from "zod";
import { OFFICIAL_OPERATIONS } from "./official-operations.generated.js";
import type { JsonSchema, OfficialOperationContract } from "./types.js";

type SchemaObject = Record<string, unknown>;
const unwrap = (schema: JsonSchema): SchemaObject => {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return {};
  const value = schema as SchemaObject;
  return value.schema && typeof value.schema === "object" ? value.schema as SchemaObject : value;
};

export function zodFromOfficialSchema(schema: JsonSchema): z.ZodTypeAny {
  if (schema === true || schema === null) return z.unknown();
  if (schema === false) return z.never();
  const value = unwrap(schema);
  if (Array.isArray(value.enum)) {
    const choices = value.enum.map((item) => z.literal(item as string | number | boolean));
    if (choices.length === 0) return z.never();
    return choices.length === 1 ? choices[0] : z.union(choices as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }
  const alternatives = (value.oneOf ?? value.anyOf) as JsonSchema[] | undefined;
  if (alternatives) {
    if (alternatives.length === 0) return z.never();
    return alternatives.length === 1 ? zodFromOfficialSchema(alternatives[0]) : z.union(alternatives.map(zodFromOfficialSchema) as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }
  const types = Array.isArray(value.type) ? value.type : value.type ? [value.type] : [];
  if (types.includes("null") && types.length > 1) return zodFromOfficialSchema({ ...value, type: types.filter((type) => type !== "null") } as JsonSchema).nullable();
  switch (types[0]) {
    case "null": return z.null();
    case "boolean": return z.boolean();
    case "integer": return z.number().int();
    case "number": return z.number();
    case "string": {
      let result = z.string();
      if (value.format === "date-time") result = result.datetime({ offset: true });
      if (typeof value.minLength === "number") result = result.min(value.minLength);
      if (typeof value.maxLength === "number") result = result.max(value.maxLength);
      return result;
    }
    case "array": {
      let result = z.array(zodFromOfficialSchema((value.items ?? true) as JsonSchema));
      if (typeof value.minItems === "number") result = result.min(value.minItems);
      if (typeof value.maxItems === "number") result = result.max(value.maxItems);
      return result;
    }
    default: {
      if (!value.properties && value.additionalProperties && typeof value.additionalProperties === "object") return z.record(zodFromOfficialSchema(value.additionalProperties as JsonSchema));
      const required = new Set(Array.isArray(value.required) ? value.required as string[] : []);
      const shape: z.ZodRawShape = {};
      for (const [name, property] of Object.entries((value.properties ?? {}) as SchemaObject)) {
        const converted = zodFromOfficialSchema(property as JsonSchema);
        shape[name] = required.has(name) ? converted : converted.optional();
      }
      const object = z.object(shape);
      return value.additionalProperties === false ? object.strict() : object.passthrough();
    }
  }
}

export function getOfficialOperation(operationId: string): OfficialOperationContract {
  const matches = OFFICIAL_OPERATIONS.filter(({ id }) => id === operationId);
  if (matches.length !== 1) throw new Error(`Expected one pinned ServiceTitan operation ${operationId}; found ${matches.length}`);
  return matches[0];
}

export function officialRequestSchema(operationId: string, mediaType = "application/json"): z.ZodTypeAny {
  const operation = getOfficialOperation(operationId);
  const contract = operation.request.find((request) => request.mediaType === mediaType) ?? operation.request.find((request) => request.mediaType.includes("json"));
  if (!contract) throw new Error(`Pinned ServiceTitan operation ${operationId} has no JSON request body`);
  return zodFromOfficialSchema(contract.schema);
}

export function officialRequestShape(operationId: string): z.ZodRawShape {
  const schema = officialRequestSchema(operationId);
  if (!(schema instanceof z.ZodObject)) throw new Error(`Pinned ServiceTitan operation ${operationId} request is not an object`);
  return schema.shape;
}
