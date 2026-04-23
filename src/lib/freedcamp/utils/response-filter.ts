/**
 * Response filter — ensures no raw Freedcamp API response reaches the MCP client.
 *
 * Every tool handler should pipe its API response through this filter
 * before returning to the dispatch loop. The filter:
 * - Strips internal fields (like raw URLs, internal IDs, debug flags)
 * - Normalizes envelope structure (data/meta/url)
 * - Applies field limiting if the tool supports it
 */

import type { McpToolResult } from "../../../modules/mcp/types";
import { dataResult, errorResult } from "../../../modules/mcp/utils/serialize";
import { applyFieldLimiting } from "./field-limiter";

type RawApiResponse = {
  data?: unknown;
  meta?: {
    total_count?: number;
    has_more?: boolean;
    [key: string]: unknown;
  };
  url?: string;
};

/**
 * Internal Freedcamp fields that should never leak to MCP clients.
 * These are API implementation details, not user-facing data.
 */
const INTERNAL_FIELDS = new Set([
  "hash",
  "api_key",
  "timestamp",
  "f_with_archived",
  "f_include_tags",
  "f_include_tr_data",
  "f_cf",
  "f_for_overview_app",
]);

/**
 * Filter and normalize a Freedcamp API response.
 * Strips internal fields and applies field limiting.
 */
export function filterResponse(
  response: unknown,
  requestedFields?: string | string[]
): { data: unknown; meta: Record<string, unknown> } | null {
  if (response === null) {
    return { data: null, meta: {} };
  }
  if (response === undefined) {
    return { data: undefined, meta: {} };
  }

  // If the response is already a McpToolResult, extract the payload
  if (typeof response === "object" && response !== null && "ok" in response) {
    const result = response as McpToolResult;
    if (!result.ok) {
      return { data: null, meta: { error: result.error } };
    }
    if ("payload" in result) {
      response = result.payload;
    }
  }

  const raw = response as RawApiResponse;
  let data: unknown = raw.data ?? raw;

  // Strip internal fields from each object
  if (Array.isArray(data)) {
    data = (data as Record<string, unknown>[]).map(stripInternalFields);
  } else if (typeof data === "object" && data !== null) {
    data = stripInternalFields(data as Record<string, unknown>);
  }

  // Apply field limiting if requested
  if (requestedFields) {
    data = applyFieldLimiting(data, requestedFields);
  }

  const meta: Record<string, unknown> = {};
  if (raw.meta?.total_count !== undefined) meta.total_count = raw.meta.total_count;
  if (raw.meta?.has_more !== undefined) meta.has_more = raw.meta.has_more;

  return { data, meta };
}

/**
 * Strip internal API fields from a single object.
 */
function stripInternalFields(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!INTERNAL_FIELDS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}