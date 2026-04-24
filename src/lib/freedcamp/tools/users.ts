/**
 * User tools — list_users, get_user, get_current_user, create_user, update_current_user
 *
 * Freedcamp users endpoint: GET /users, GET /users/{id}, GET /users/current
 * POST /users (create), POST /users/current (update)
 * Delete user is not supported by Freedcamp API.
 */

import { z } from "zod";
import type { McpToolResult } from "../../../modules/mcp/types";
import type { FreedcampApiClient } from "../api-client";
import { resolveUserId, resolveProjectId } from "../utils/name-resolver";

// ── list_users ──────────────────────────────────────────────────────────────

export const listUsersSchema = z.object({
  project_id: z.union([z.number().int(), z.string()]).optional().describe("Filter users by project ID or name"),
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
      const resolved = await resolveProjectId(client, input.project_id);
      if (!resolved) {
        return { ok: false, kind: "data", error: `Project not found: "${input.project_id}"`, errorCode: "NOT_FOUND" as const };
      }
      params.project_id = resolved.id;
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

    // Resolve user name/email to ID if needed
    const resolved = await resolveUserId(client, input.user_id);
    if (!resolved) {
      return { ok: false, kind: "data", error: `User not found: "${input.user_id}"`, errorCode: "NOT_FOUND" as const };
    }

    return client.request(`/users/${resolved.id}`, {
      method: "GET",
      fields: input.fields,
    });
  };
}

// ── get_current_user ────────────────────────────────────────────────────────

export const getCurrentUserSchema = z.object({
  fields: z.string().optional().describe("Comma-separated dot-notation fields to include"),
});

export type GetCurrentUserInput = z.infer<typeof getCurrentUserSchema>;

export function createGetCurrentUserHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as GetCurrentUserInput;
    return client.request("/users/current", {
      method: "GET",
      fields: input.fields,
    });
  };
}

// ── create_user ─────────────────────────────────────────────────────────────

export const createUserSchema = z.object({
  email: z.string().email().describe("Email address (required)"),
  password: z.string().min(6).describe("Password (required, min 6 chars)"),
  first_name: z.string().min(1).describe("First name (required)"),
  last_name: z.string().optional().describe("Last name"),
  project_id: z.union([z.number().int(), z.string()]).optional().describe("Project ID or name to add user to"),
  group_id: z.number().int().optional().describe("Group ID within the project"),
  f_is_admin: z.number().int().min(0).max(1).optional().describe("Make user an admin (1=yes)"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export function createCreateUserHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as CreateUserInput;

    const body: Record<string, unknown> = {
      email: input.email,
      password: input.password,
      first_name: input.first_name,
    };

    if (input.last_name !== undefined) body.last_name = input.last_name;
    if (input.project_id !== undefined) {
      const resolved = await resolveProjectId(client, input.project_id);
      if (!resolved) {
        return { ok: false, kind: "data", error: `Project not found: "${input.project_id}"`, errorCode: "NOT_FOUND" as const };
      }
      body.project_id = resolved.id;
    }
    if (input.group_id !== undefined) body.group_id = input.group_id;
    if (input.f_is_admin !== undefined) body.f_is_admin = input.f_is_admin;

    return client.request("/users", {
      method: "POST",
      body,
    });
  };
}

// ── update_current_user ──────────────────────────────────────────────────────

export const updateCurrentUserSchema = z.object({
  first_name: z.string().min(1).optional().describe("New first name"),
  email: z.string().email().optional().describe("New email address"),
  password: z.string().min(6).optional().describe("New password"),
  confirmation_password: z.string().optional().describe("Current password confirmation (required if changing password)"),
  last_name: z.string().optional().describe("New last name"),
  timezone: z.string().optional().describe("New timezone (e.g. 'America/New_York')"),
});

export type UpdateCurrentUserInput = z.infer<typeof updateCurrentUserSchema>;

export function createUpdateCurrentUserHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as UpdateCurrentUserInput;

    const body: Record<string, unknown> = {};

    if (input.first_name !== undefined) body.first_name = input.first_name;
    if (input.email !== undefined) body.email = input.email;
    if (input.password !== undefined) {
      if (!input.confirmation_password) {
        return {
          ok: false,
          kind: "data" as const,
          error: "confirmation_password is required when changing password",
          errorCode: "VALIDATION_ERROR" as const,
        };
      }
      body.password = input.password;
      body.confirmation_password = input.confirmation_password;
    }
    if (input.last_name !== undefined) body.last_name = input.last_name;
    if (input.timezone !== undefined) body.timezone = input.timezone;

    return client.request("/users/current", {
      method: "POST",
      body,
    });
  };
}