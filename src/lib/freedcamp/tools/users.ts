/**
 * User tools — list_users, get_user (by ID)
 */

import { z } from "zod";
import type { McpToolResult } from "../../../modules/mcp/types";
import type { FreedcampApiClient } from "../api-client";

// ── list_users ──────────────────────────────────────────────────────────────

export const listUsersSchema = z.object({
  project_id: z.number().int().optional().describe("Filter users by project ID"),
  fields: z.string().optional().describe("Comma-separated dot-notation fields to include"),
  limit: z.number().int().min(1).max(100).optional().describe("Number of results per page"),
  offset: z.number().int().min(0).optional().describe("Offset for pagination"),
});

export type ListUsersInput = z.infer<typeof listUsersSchema>;

export function createListUsersHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as ListUsersInput;
    const params: Record<string, unknown> = {};
    if (input.project_id !== undefined) {
      params.project_id = input.project_id;
    }

    return client.request("/users", {
      method: "GET",
      params,
      pagination: { limit: input.limit, offset: input.offset },
      fields: input.fields,
    });
  };
}

// ── get_user ────────────────────────────────────────────────────────────────

export const getUserSchema = z.object({
  user_id: z.union([z.number().int(), z.string()]).describe("User ID to look up"),
  fields: z.string().optional().describe("Comma-separated dot-notation fields to include"),
});

export type GetUserInput = z.infer<typeof getUserSchema>;

export function createGetUserHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as GetUserInput;
    return client.request(`/users/${input.user_id}`, {
      method: "GET",
      fields: input.fields,
    });
  };
}