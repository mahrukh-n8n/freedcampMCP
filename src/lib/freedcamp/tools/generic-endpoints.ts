import { z } from "zod";
import type { McpToolResult } from "../../../modules/mcp/types";
import type { FreedcampApiClient, SortParams } from "../api-client";

type GenericInput = Record<string, unknown> & {
  id?: number | string;
  project_id?: number | string;
  group_id?: number | string;
  user_id?: number | string;
  item_id?: number | string;
  app_id?: number | string;
  module_id?: number | string;
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  fields?: string;
  limit?: number;
  offset?: number;
  order?: SortParams;
};

const primitive = z.union([z.string(), z.number(), z.boolean()]);

export const genericListSchema = z.object({
  params: z.record(z.unknown()).optional().describe("Additional query parameters from the Freedcamp API/Postman collection."),
  fields: z.string().optional().describe("Comma-separated dot-notation fields to include in the response."),
  limit: z.number().int().min(0).max(500).optional().describe("Results per page. Freedcamp examples use 0 for API default/all behavior."),
  offset: z.number().int().min(0).optional().describe("Pagination offset."),
  order: z.record(z.enum(["asc", "desc"])).optional().describe("Sort map encoded as order[field]=asc|desc."),
}).catchall(z.unknown());

export const genericGetSchema = z.object({
  id: z.union([z.number().int(), z.string()]).describe("Resource ID."),
  params: z.record(z.unknown()).optional().describe("Additional query parameters."),
  fields: z.string().optional().describe("Comma-separated dot-notation fields to include in the response."),
}).catchall(z.unknown());

export const genericCreateSchema = z.object({
  body: z.record(z.unknown()).optional().describe("Request JSON body. Top-level extra fields are also sent in the body."),
}).catchall(z.unknown());

export const genericUpdateSchema = z.object({
  id: z.union([z.number().int(), z.string()]).describe("Resource ID."),
  body: z.record(z.unknown()).optional().describe("Request JSON body. Top-level extra fields are also sent in the body."),
}).catchall(z.unknown());

export const genericDeleteSchema = z.object({
  id: z.union([z.number().int(), z.string()]).describe("Resource ID."),
  params: z.record(z.unknown()).optional().describe("Additional query parameters."),
}).catchall(z.unknown());

export const genericActionSchema = z.object({
  id: z.union([z.number().int(), z.string()]).optional().describe("Resource ID when the endpoint path requires one."),
  body: z.record(z.unknown()).optional().describe("Request JSON body. Top-level extra fields are also sent in the body."),
  params: z.record(z.unknown()).optional().describe("Additional query parameters."),
}).catchall(z.unknown());

export const scopedListSchema = genericListSchema.extend({
  project_id: primitive.optional().describe("Project ID when filtering/scoping this endpoint."),
  group_id: primitive.optional().describe("Group ID when filtering/scoping this endpoint."),
  module_id: primitive.optional().describe("Module/app ID when filtering/scoping this endpoint."),
});

const CONTROL_KEYS = new Set([
  "id",
  "params",
  "body",
  "fields",
  "limit",
  "offset",
  "order",
]);

function extraFields(input: GenericInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!CONTROL_KEYS.has(key) && value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function listParams(input: GenericInput): Record<string, unknown> {
  return {
    ...extraFields(input),
    ...(input.params ?? {}),
  };
}

function bodyParams(input: GenericInput): Record<string, unknown> {
  return {
    ...extraFields(input),
    ...(input.body ?? {}),
  };
}

function withId(endpoint: string, id: number | string | undefined): string {
  if (id === undefined || id === null || id === "") {
    return endpoint;
  }
  return `${endpoint.replace(/\/$/, "")}/${encodeURIComponent(String(id))}`;
}

export function createListHandler(client: FreedcampApiClient, endpoint: string) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as GenericInput;
    return client.request(endpoint, {
      method: "GET",
      params: listParams(input),
      pagination: { limit: input.limit, offset: input.offset },
      sort: input.order,
      fields: input.fields,
    });
  };
}

export function createGetHandler(client: FreedcampApiClient, endpoint: string) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as GenericInput;
    return client.request(withId(endpoint, input.id), {
      method: "GET",
      params: input.params,
      fields: input.fields,
    });
  };
}

export function createCreateHandler(client: FreedcampApiClient, endpoint: string) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as GenericInput;
    return client.request(endpoint, {
      method: "POST",
      body: bodyParams(input),
    });
  };
}

export function createUpdateHandler(client: FreedcampApiClient, endpoint: string) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as GenericInput;
    return client.request(withId(endpoint, input.id), {
      method: "POST",
      body: bodyParams(input),
    });
  };
}

export function createDeleteHandler(client: FreedcampApiClient, endpoint: string) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as GenericInput;
    return client.request(withId(endpoint, input.id), {
      method: "DELETE",
      params: { ...extraFields(input), ...(input.params ?? {}) },
    });
  };
}

export function createPostActionHandler(
  client: FreedcampApiClient,
  endpoint: string,
  actionBody?: Record<string, unknown>
) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as GenericInput;
    return client.request(withId(endpoint, input.id), {
      method: "POST",
      params: input.params,
      body: {
        ...actionBody,
        ...bodyParams(input),
      },
    });
  };
}

