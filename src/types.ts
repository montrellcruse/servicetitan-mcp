/** Standard MCP tool response */
export interface ToolResponse {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  /** Mirrors the JSON text. Non-object API responses are wrapped as { data }. */
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** ServiceTitan paginated response envelope */
export interface PaginatedResponse<T> {
  page: number;
  pageSize: number;
  totalCount?: number;
  hasMore: boolean;
  data: T[];
  continueFrom?: string;
}
