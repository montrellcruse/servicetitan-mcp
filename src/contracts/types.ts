export type JsonSchema = Record<string, unknown> | boolean | null;

export interface OfficialParameterContract {
  name: string;
  in: string;
  required: boolean;
  description: string | null;
  schema: JsonSchema;
}

export interface OfficialOperationContract {
  id: string;
  document: string;
  method: string;
  moduleBasePath: string;
  path: string;
  fullPath: string;
  scopes: string[];
  parameters: OfficialParameterContract[];
  request: Array<{ mediaType: string; schema: JsonSchema }>;
  successStatus: string | null;
  response: Array<{ mediaType: string; schema: JsonSchema }>;
}
