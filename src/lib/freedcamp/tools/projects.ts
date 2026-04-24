/**
 * Project tools — list_projects, get_project, create_project, update_project
 */

import { z } from "zod";
import type { McpToolResult } from "../../../modules/mcp/types";
import type { FreedcampApiClient } from "../api-client";
import { resolveProjectId } from "../utils/name-resolver";

// ── list_projects ───────────────────────────────────────────────────────────

export const listProjectsSchema = z.object({
  f_recent_projects_ids: z.string().optional().describe("Comma-separated list of recent project IDs to filter"),
  fields: z.string().optional().describe("Comma-separated dot-notation fields to include in response"),
  limit: z.number().int().min(1).max(100).optional().describe("Number of results per page (default 20)"),
  offset: z.number().int().min(0).optional().describe("Offset for pagination (default 0)"),
  order: z.record(z.enum(["asc", "desc"])).optional().describe("Sort: order[field]=asc|desc"),
});

export type ListProjectsInput = z.infer<typeof listProjectsSchema>;

export function createListProjectsHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as ListProjectsInput;
    const sortParams: Record<string, "asc" | "desc"> = {};
    if (input.order) {
      for (const [field, dir] of Object.entries(input.order)) {
        sortParams[field] = dir as "asc" | "desc";
      }
    }

    const params: Record<string, unknown> = {};
    if (input.f_recent_projects_ids) {
      params.f_recent_projects_ids = input.f_recent_projects_ids;
    }

    return client.request("/projects", {
      method: "GET",
      params,
      pagination: { limit: input.limit, offset: input.offset },
      sort: Object.keys(sortParams).length > 0 ? sortParams : undefined,
      fields: input.fields,
    });
  };
}

// ── get_project ─────────────────────────────────────────────────────────────

export const getProjectSchema = z.object({
  project_id: z.union([z.number().int(), z.string()]).describe("Project ID or name to look up"),
  f_for_overview_app: z.number().optional().describe("Set to 1 for overview app data"),
  fields: z.string().optional().describe("Comma-separated dot-notation fields to include"),
});

export type GetProjectInput = z.infer<typeof getProjectSchema>;

export function createGetProjectHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as GetProjectInput;

    // Resolve project name to ID if needed
    const resolved = await resolveProjectId(client, input.project_id);
    if (!resolved) {
      return { ok: false, kind: "data", error: `Project not found: "${input.project_id}"`, errorCode: "NOT_FOUND" as const };
    }

    const params: Record<string, unknown> = {};
    if (input.f_for_overview_app !== undefined) {
      params.f_for_overview_app = input.f_for_overview_app;
    }

    return client.request(`/projects/${resolved.id}`, {
      method: "GET",
      params,
      fields: input.fields,
    });
  };
}

// ── create_project ───────────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  project_name: z.string().min(1).describe("Project name (required)"),
  project_description: z.string().optional().describe("Project description"),
  project_color: z.string().optional().describe("Project color (hex, e.g. #FF0000)"),
  todo_view_type: z.number().int().optional().describe("View type for todo app"),
  group_id: z.number().int().optional().describe("Group ID to add project to"),
  group_name: z.string().optional().describe("Group name — creates group if group_id not set"),
  f_first: z.number().int().min(0).max(1).optional().describe("Set to 1 to mark as first project"),
  changed_users: z.union([z.number().int(), z.array(z.number().int())]).optional()
    .transform((v) => (Array.isArray(v) ? v : v !== undefined ? [v] : undefined))
    .describe("User IDs to add as project members"),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export function createCreateProjectHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as CreateProjectInput;

    const body: Record<string, unknown> = {
      project_name: input.project_name,
    };

    if (input.project_description !== undefined) body.project_description = input.project_description;
    if (input.project_color !== undefined) body.project_color = input.project_color;
    if (input.todo_view_type !== undefined) body.todo_view_type = input.todo_view_type;
    if (input.group_id !== undefined) body.group_id = input.group_id;
    if (input.group_name !== undefined) body.group_name = input.group_name;
    if (input.f_first !== undefined) body.f_first = input.f_first;
    if (input.changed_users !== undefined) body.changed_users = input.changed_users;

    return client.request("/projects", {
      method: "POST",
      body,
    });
  };
}

// ── update_project ───────────────────────────────────────────────────────────

export const updateProjectSchema = z.object({
  project_id: z.union([z.number().int(), z.string()]).describe("Project ID or name to update"),
  project_name: z.string().optional().describe("New project name"),
  project_description: z.string().optional().describe("New project description"),
  project_color: z.string().optional().describe("New project color (hex)"),
  todo_view_type: z.number().int().optional().describe("New view type for todo app"),
  group_id: z.number().int().optional().describe("New group ID"),
  group_name: z.string().optional().describe("New group name"),
  f_first: z.number().int().min(0).max(1).optional().describe("Set to 1 to mark as first project"),
  changed_users: z.union([z.number().int(), z.array(z.number().int())]).optional()
    .transform((v) => (Array.isArray(v) ? v : v !== undefined ? [v] : undefined))
    .describe("User IDs to add as project members"),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export function createUpdateProjectHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as UpdateProjectInput;

    // Resolve project name to ID if needed
    const resolved = await resolveProjectId(client, input.project_id);
    if (!resolved) {
      return { ok: false, kind: "data", error: `Project not found: "${input.project_id}"`, errorCode: "NOT_FOUND" as const };
    }

    const body: Record<string, unknown> = {};

    if (input.project_name !== undefined) body.project_name = input.project_name;
    if (input.project_description !== undefined) body.project_description = input.project_description;
    if (input.project_color !== undefined) body.project_color = input.project_color;
    if (input.todo_view_type !== undefined) body.todo_view_type = input.todo_view_type;
    if (input.group_id !== undefined) body.group_id = input.group_id;
    if (input.group_name !== undefined) body.group_name = input.group_name;
    if (input.f_first !== undefined) body.f_first = input.f_first;
    if (input.changed_users !== undefined) body.changed_users = input.changed_users;

    return client.request(`/projects/${resolved.id}`, {
      method: "PUT",
      body,
    });
  };
}