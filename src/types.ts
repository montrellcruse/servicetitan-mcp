/** Standard MCP tool response */
export interface ToolResponse {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
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
