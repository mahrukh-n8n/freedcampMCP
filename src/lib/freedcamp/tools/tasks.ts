/**
 * Task tools — list_tasks, get_task
 *
 * Freedcamp tasks endpoint: GET /tasks, GET /tasks/{id}
 * Default includes f_include_tags=1 to prevent silent data loss (TASK-06).
 * task_url constructed from project_id + task_id (TASK-10).
 */

import { z } from "zod";
import type { McpToolResult } from "../../../modules/mcp/types";
import type { FreedcampApiClient } from "../api-client";

// ── Constants ─────────────────────────────────────────────────────────────────

const FREEDCAMP_BASE_URL = "https://freedcamp.com";

function buildTaskUrl(projectId: number | string, taskId: number | string): string {
  return `${FREEDCAMP_BASE_URL}/project/${projectId}/task/${taskId}`;
}

// ── list_tasks ────────────────────────────────────────────────────────────────

export const listTasksSchema = z.object({
  project_id: z.number().int().describe("Project ID (required)"),
  task_group_id: z.number().int().optional().describe("Task group ID to filter by"),
  milestone_id: z.number().int().optional().describe("Milestone ID to filter by"),
  assigned_to_id: z.union([z.number().int(), z.array(z.number().int())]).optional()
    .transform((v) => (Array.isArray(v) ? v : v !== undefined ? [v] : undefined))
    .describe("User ID(s) to filter by assigned user"),
  status: z.union([z.number().int(), z.string(), z.array(z.union([z.number().int(), z.string()]))]).optional()
    .describe("Status filter: 0=not started, 1=in progress, 2=completed; string labels accepted"),
  created_by_id: z.union([z.number().int(), z.array(z.number().int())]).optional()
    .transform((v) => (Array.isArray(v) ? v : v !== undefined ? [v] : undefined))
    .describe("User ID(s) who created the task"),
  search: z.string().optional().describe("Search string to filter tasks by title"),
  due_date_from: z.string().optional().describe("Filter tasks due on or after this date (YYYY-MM-DD)"),
  due_date_to: z.string().optional().describe("Filter tasks due on or before this date (YYYY-MM-DD)"),
  created_date_from: z.string().optional().describe("Filter tasks created on or after this date (YYYY-MM-DD)"),
  created_date_to: z.string().optional().describe("Filter tasks created on or before this date (YYYY-MM-DD)"),
  f_with_archived: z.number().int().min(0).max(1).optional().describe("Include archived tasks (1=yes)"),
  f_include_tags: z.number().int().min(0).max(1).optional().default(1).describe("Include tag data (default 1)"),
  f_cf: z.number().int().min(0).max(1).optional().describe("Include custom fields (1=yes)"),
  fields: z.string().optional().describe("Comma-separated dot-notation fields to include"),
  limit: z.number().int().min(1).max(100).optional().describe("Results per page (default 20)"),
  offset: z.number().int().min(0).optional().describe("Pagination offset"),
  order: z.record(z.enum(["asc", "desc"])).optional().describe("Sort: e.g. {\"priority\":\"asc\"} or {\"due_date\":\"desc\"}"),
});

export type ListTasksInput = z.infer<typeof listTasksSchema>;

/** Map string status labels to numeric codes */
function mapStatusStatus(status: z.infer<typeof listTasksSchema>["status"]): number[] | undefined {
  if (status === undefined) return undefined;

  const labelMap: Record<string, number> = {
    "not started": 0,
    "in progress": 1,
    completed: 2,
  };

  const values = Array.isArray(status) ? status : [status];

  return values.map((v) => {
    if (typeof v === "number") return v;
    const lower = v.toLowerCase();
    if (lower in labelMap) return labelMap[lower];
    return parseInt(v, 10);
  });
}

export function createListTasksHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as ListTasksInput;

    const params: Record<string, unknown> = {
      project_id: input.project_id,
    };

    if (input.task_group_id !== undefined) params.task_group_id = input.task_group_id;
    if (input.milestone_id !== undefined) params.milestone_id = input.milestone_id;

    // assigned_to_id → multi-value array
    if (input.assigned_to_id !== undefined) {
      params.assigned_to_id = input.assigned_to_id;
    }

    // status → map string labels to numeric, encoded as multi-value
    const statusCodes = mapStatusStatus(input.status);
    if (statusCodes !== undefined) {
      params.status = statusCodes;
    }

    if (input.created_by_id !== undefined) params.created_by_id = input.created_by_id;
    if (input.search !== undefined) params.search = input.search;

    if (input.due_date_from !== undefined) params.due_date_from = input.due_date_from;
    if (input.due_date_to !== undefined) params.due_date_to = input.due_date_to;
    if (input.created_date_from !== undefined) params.created_date_from = input.created_date_from;
    if (input.created_date_to !== undefined) params.created_date_to = input.created_date_to;

    if (input.f_with_archived !== undefined) params.f_with_archived = input.f_with_archived;
    params.f_include_tags = input.f_include_tags ?? 1;
    if (input.f_cf !== undefined) params.f_cf = input.f_cf;

    const sortParams: Record<string, "asc" | "desc"> = {};
    if (input.order) {
      for (const [field, dir] of Object.entries(input.order)) {
        sortParams[field] = dir as "asc" | "desc";
      }
    }

    return client.request("/tasks", {
      method: "GET",
      params,
      pagination: { limit: input.limit, offset: input.offset },
      sort: Object.keys(sortParams).length > 0 ? sortParams : undefined,
      fields: input.fields,
    });
  };
}

// ── get_task ──────────────────────────────────────────────────────────────────

export const getTaskSchema = z.object({
  project_id: z.number().int().describe("Project ID the task belongs to"),
  task_id: z.number().int().describe("Task ID to look up"),
  f_include_tr_data: z.number().int().min(0).max(1).optional().default(1)
    .describe("Include tag detail (id, title, owner_id, usages_count) — default 1"),
  f_include_tags: z.number().int().min(0).max(1).optional().default(1)
    .describe("Include tag data — default 1 (TASK-06)"),
  f_cf: z.number().int().min(0).max(1).optional().describe("Include custom fields (1=yes)"),
  fields: z.string().optional().describe("Comma-separated dot-notation fields to include"),
});

export type GetTaskInput = z.infer<typeof getTaskSchema>;

export function createGetTaskHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as GetTaskInput;

    const params: Record<string, unknown> = {
      project_id: input.project_id,
    };
    params.f_include_tr_data = input.f_include_tr_data ?? 1;
    params.f_include_tags = input.f_include_tags ?? 1;
    if (input.f_cf !== undefined) params.f_cf = input.f_cf;

    const result = await client.request(`/tasks/${input.task_id}`, {
      method: "GET",
      params,
      fields: input.fields,
    });

    // Inject task_url (TASK-10)
    if (result.ok && result.kind === "data") {
      const payload = result.payload as Record<string, unknown>;
      if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
        const task = payload.data as Record<string, unknown>;
        task.task_url = buildTaskUrl(input.project_id, input.task_id);
      } else if (Array.isArray(payload.data)) {
        for (const task of payload.data as Record<string, unknown>[]) {
          task.task_url = buildTaskUrl(input.project_id, input.task_id);
        }
      }
    }

    return result;
  };
}