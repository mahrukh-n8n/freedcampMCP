import type {
  McpToolDefinition as _McpToolDefinition,
  McpToolContext as _McpToolContext,
  McpToolResult as _McpToolResult,
  McpServerCallbacks as _McpServerCallbacks,
  McpSessionContext,
} from "../../modules/mcp/types";

/** No database — all data comes from Freedcamp REST API. */
export type TDb = void;

/** Freedcamp tool context. No db client — apiClient is the data access layer. */
export interface FreedcampToolContext {
  userId: number;
  companyId: number;
  requestId: string;
  signal?: AbortSignal;
}

export type FreedcampToolDefinition = _McpToolDefinition<void>;
export type FreedcampToolResult = _McpToolResult;
export type FreedcampSessionContext = McpSessionContext;