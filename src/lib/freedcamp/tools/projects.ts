/**
 * Project tools — list_projects, get_project
 */

import { z } from "zod";
import type { McpToolResult } from "../../../modules/mcp/types";
import type { FreedcampApiClient } from "../api-client";

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
        sortParams[field] = dir;
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
    const params: Record<string, unknown> = {};
    if (input.f_for_overview_app !== undefined) {
      params.f_for_overview_app = input.f_for_overview_app;
    }

    return client.request(`/projects/${input.project_id}`, {
      method: "GET",
      params,
      fields: input.fields,
    });
  };
}