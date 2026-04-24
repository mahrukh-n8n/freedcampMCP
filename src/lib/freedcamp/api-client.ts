/**
 * Freedcamp API Client — centralized HTTP client with HMAC authentication.
 *
 * - Every request is HMAC-SHA1 signed (apiKey + timestamp)
 * - GET: all params in URL query string
 * - POST: auth params in query string, body params as JSON
 * - Multi-value fields use [] suffix: status[]=0&status[]=2
 * - Pagination: limit/offset, returns has_more/total_count in meta
 * - Sort encoding: order[field]=asc|desc
 * - Error handling: structured error codes
 * - Retry with exponential backoff for 429 and 5xx
 */

import { buildAuthParams, type AuthParams } from "./auth/hmac";
import { filterResponse } from "./utils/response-filter";
import { logger } from "./utils/logger";
import type { McpToolResult } from "../../modules/mcp/types";
import { dataResult, commitResult, errorResult } from "../../modules/mcp/utils/serialize";

export type FreedcampClientConfig = {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  maxRetries?: number;
  requestTimeoutMs?: number;
};

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export type PaginationParams = {
  limit?: number;
  offset?: number;
};

export type SortParams = Record<string, "asc" | "desc">;

export type RequestConfig = {
  method?: HttpMethod;
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  pagination?: PaginationParams;
  sort?: SortParams;
  fields?: string | string[];
  signal?: AbortSignal;
};

const DEFAULT_BASE_URL = "https://freedcamp.com";
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

type FreedcampResponse<T = unknown> = {
  data?: T;
  meta?: {
    total_count?: number;
    has_more?: boolean;
  };
  url?: string;
};

export class FreedcampApiClient {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly requestTimeoutMs: number;

  constructor(config: FreedcampClientConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.requestTimeoutMs = config.requestTimeoutMs ?? (parseInt(process.env.REQUEST_TIMEOUT_MS ?? "", 10) || DEFAULT_REQUEST_TIMEOUT_MS);
  }

  /**
   * Make an authenticated request to the Freedcamp API.
   *
   * GET: all params go in query string
   * POST/PUT/DELETE: auth in query string, body params as JSON
   */
  async request<T = unknown>(endpoint: string, config: RequestConfig = {}): Promise<McpToolResult> {
    const { method = "GET", params, body, pagination, sort, fields, signal } = config;

    const auth = buildAuthParams(this.apiKey, this.apiSecret);
    const url = new URL(endpoint, this.baseUrl);

    // Auth params always go in query string
    url.searchParams.set("api_key", auth.api_key);
    url.searchParams.set("timestamp", auth.timestamp);
    url.searchParams.set("hash", auth.hash);

    // Build query params
    const queryParams = encodeAllParams(params, pagination, sort);

    if (method === "GET") {
      // GET: all params in query string
      queryParams.forEach((value, key) => {
        url.searchParams.append(key, value);
      });
    }

    // For POST/PUT/DELETE: auth in query, body as JSON
    const isBodyMethod = method !== "GET";
    const fetchOptions: RequestInit = {
      method,
      headers: isBodyMethod ? { "Content-Type": "application/json" } : {},
      signal: signal ?? AbortSignal.timeout(this.requestTimeoutMs),
    };

    if (isBodyMethod && body) {
      // Non-array, non-sort query params merge into body
      const bodyParams: Record<string, unknown> = {};
      queryParams.forEach((value, key) => {
        if (!key.includes("[") && !key.startsWith("order")) {
          bodyParams[key] = value;
        }
      });
      // Multi-value and sort params stay in URL
      queryParams.forEach((value, key) => {
        if (key.includes("[") || key.startsWith("order")) {
          url.searchParams.append(key, value);
        }
      });
      fetchOptions.body = JSON.stringify({ ...body, ...bodyParams });
    } else if (isBodyMethod) {
      // No body — multi-value and sort params go in URL
      queryParams.forEach((value, key) => {
        url.searchParams.append(key, value);
      });
    }

    return this.executeWithRetry<T>(url.toString(), fetchOptions, fields, isBodyMethod, signal);
  }

  /**
   * Execute fetch with retry for 429 and 5xx errors.
   */
  private async executeWithRetry<T>(
    url: string,
    options: RequestInit,
    fields: string | string[] | undefined,
    isWrite: boolean,
    signal?: AbortSignal,
    attempt: number = 0
  ): Promise<McpToolResult> {
    logger.debug(`Request: ${options.method} ${url} (attempt ${attempt + 1})`);

    try {
      const response = await fetch(url, options);

      if (response.status === 401 || response.status === 403) {
        return errorResult("Invalid API key or secret", "PERMISSION_DENIED");
      }

      if (response.status === 404) {
        return errorResult("Resource not found", "NOT_FOUND");
      }

      if (response.status === 422) {
        const body = await response.json().catch(() => ({}));
        const msg = typeof body === "object" && body && "message" in body
          ? String((body as Record<string, unknown>).message)
          : "Validation error";
        return errorResult(msg, "VALIDATION_ERROR");
      }

      if (response.status === 409) {
        return errorResult("Resource already exists (conflict)", "CONFLICT");
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt < this.maxRetries - 1) {
          const delayMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          logger.warn(`Retrying ${url} after ${response.status} (attempt ${attempt + 1}, delay ${delayMs}ms)`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return this.executeWithRetry<T>(url, options, fields, isWrite, signal, attempt + 1);
        }
        if (response.status === 429) {
          return errorResult("Rate limited — too many requests", "INTERNAL_ERROR");
        }
        return errorResult(`Server error: ${response.status}`, "INTERNAL_ERROR");
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        return errorResult(`Unexpected error: ${response.status} ${text}`, "INTERNAL_ERROR");
      }

      const json = await response.json() as FreedcampResponse<T>;

      // Apply response filter: strip internal fields, apply field limiting
      const filtered = filterResponse(json, fields);

      // Use commit envelope for write operations, data envelope for reads
      const resultData = {
        data: filtered?.data ?? json,
        meta: filtered?.meta ?? json.meta ?? {},
        ...(json.url ? { url: json.url } : {}),
      };

      if (isWrite) {
        return commitResult(resultData);
      }
      return dataResult(resultData);
    } catch (err) {
      if (signal?.aborted) {
        return errorResult("Request cancelled", "INTERNAL_ERROR");
      }
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`Network error: ${msg}`, "INTERNAL_ERROR");
    }
  }
}

/**
 * Encode all request params into URLSearchParams.
 * Handles multi-value arrays with [] suffix, sort with order[] prefix,
 * and pagination limit/offset.
 */
export function encodeAllParams(
  params?: Record<string, unknown>,
  pagination?: PaginationParams,
  sort?: SortParams
): URLSearchParams {
  const result = new URLSearchParams();

  // Regular params
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;

      // Multi-value fields (arrays) use [] suffix
      if (Array.isArray(value)) {
        for (const item of value) {
          result.append(`${key}[]`, String(item));
        }
      } else if (typeof value === "object" && value !== null) {
        // Skip nested objects at this level
      } else {
        result.set(key, String(value));
      }
    }
  }

  // Pagination
  if (pagination?.limit !== undefined) {
    result.set("limit", String(pagination.limit));
  }
  if (pagination?.offset !== undefined) {
    result.set("offset", String(pagination.offset));
  }

  // Sort: order[field]=asc|desc
  if (sort) {
    for (const [field, direction] of Object.entries(sort)) {
      result.set(`order[${field}]`, direction);
    }
  }

  return result;
}