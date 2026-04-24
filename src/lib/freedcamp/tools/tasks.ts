/**
 * Task tools — list_tasks, get_task, create_task, update_task, delete_task, assign_task
 *
 * Freedcamp tasks endpoint: GET/POST /tasks, GET/PUT/DELETE /tasks/{id}
 * Default includes f_include_tags=1 to prevent silent data loss (TASK-06).
 * task_url constructed from project_id + task_id (TASK-10).
 * Status bidirectional mapping: "not started"↔0, "in progress"↔1, "completed"↔2 (TASK-08).
 */

import { z } from "zod";
import type { McpToolResult } from "../../../modules/mcp/types";
import { dataResult, errorResult } from "../../../modules/mcp/utils/serialize";
import type { FreedcampApiClient } from "../api-client";
import { STATUS_MAP, STATUS_CODE_MAP, resolveStatus, resolveProjectId } from "../utils/name-resolver";

// ── Constants ─────────────────────────────────────────────────────────────────

const FREEDCAMP_BASE_URL = "https://freedcamp.com";

function buildTaskUrl(projectId: number | string, taskId: number | string): string {
  return `${FREEDCAMP_BASE_URL}/project/${projectId}/task/${taskId}`;
}

// ── list_tasks ────────────────────────────────────────────────────────────────

export const listTasksSchema = z.object({
  project_id: z.union([z.number().int(), z.string()]).describe("Project ID or name (required)"),
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

/** Map string status labels to numeric codes using centralized resolveStatus */
function mapStatusStatus(status: z.infer<typeof listTasksSchema>["status"]): number[] | undefined {
  if (status === undefined) return undefined;

  const values = Array.isArray(status) ? status : [status];
  return values.map((v) => resolveStatus(v));
}

export function createListTasksHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as ListTasksInput;

    // Resolve project name to ID if needed
    const resolved = await resolveProjectId(client, input.project_id);
    if (!resolved) {
      return { ok: false, kind: "data", error: `Project not found: "${input.project_id}"`, errorCode: "NOT_FOUND" as const };
    }

    const params: Record<string, unknown> = {
      project_id: resolved.id,
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

    const result = await client.request("/tasks", {
      method: "GET",
      params,
      pagination: { limit: input.limit, offset: input.offset },
      sort: Object.keys(sortParams).length > 0 ? sortParams : undefined,
      fields: input.fields,
    });

    // Inject task_url into each task in the list (TASK-10)
    if (result.ok && result.kind === "data") {
      const payload = result.payload as Record<string, unknown>;
      if (Array.isArray(payload.data)) {
        for (const task of payload.data as Record<string, unknown>[]) {
          const projectId = Number(task.project_id ?? resolved.id);
          const taskId = Number(task.id);
          if (taskId) {
            task.task_url = buildTaskUrl(projectId, taskId);
          }
        }
      }
    }

    return result;
  };
}

// ── get_task ──────────────────────────────────────────────────────────────────

export const getTaskSchema = z.object({
  project_id: z.union([z.number().int(), z.string()]).describe("Project ID or name the task belongs to"),
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

    // Resolve project name to ID if needed
    const resolved = await resolveProjectId(client, input.project_id);
    if (!resolved) {
      return { ok: false, kind: "data", error: `Project not found: "${input.project_id}"`, errorCode: "NOT_FOUND" as const };
    }

    const params: Record<string, unknown> = {
      project_id: resolved.id,
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
        task.task_url = buildTaskUrl(resolved.id, input.task_id);
      } else if (Array.isArray(payload.data)) {
        for (const task of payload.data as Record<string, unknown>[]) {
          task.task_url = buildTaskUrl(resolved.id, input.task_id);
        }
      }
    }

    return result;
  };
}

// ── Status mapping — centralized in name-resolver.ts (TASK-08) ──────────────

/** Accept both string labels and numeric codes, always output numeric code for API. */
function toStatusCode(status: string | number): number {
  return resolveStatus(status);
}

const STATUS_LABEL_TO_CODE = STATUS_MAP;
const STATUS_CODE_TO_LABEL = STATUS_CODE_MAP;

// ── create_task ──────────────────────────────────────────────────────────────

export const createTaskSchema = z.object({
  project_id: z.union([z.number().int(), z.string()]).describe("Project ID or name (required)"),
  title: z.string().min(1).describe("Task title (required)"),
  task_group_id: z.number().int().optional().describe("Task group ID"),
  description: z.string().optional().describe("Task description"),
  priority: z.number().int().min(0).max(3).optional().describe("Priority: 0=None, 1=Low, 2=Medium, 3=High"),
  assigned_to_id: z.union([z.number().int(), z.array(z.number().int())]).optional()
    .transform((v) => (Array.isArray(v) ? v : v !== undefined ? [v] : undefined))
    .describe("User ID(s) to assign"),
  status: z.union([z.number().int(), z.string()]).optional()
    .describe("Status: 0=not started, 1=in progress, 2=completed, or string label"),
  start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
  r_rule: z.string().optional().describe("Recurrence rule (iCal RRULE format)"),
  h_parent_id: z.number().int().optional().describe("Parent task ID for subtask"),
  cf_tpl_id: z.number().int().optional().describe("Custom field template ID"),
  custom_fields: z.record(z.unknown()).optional().describe("Custom field values as key-value pairs"),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export function createCreateTaskHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as CreateTaskInput;

    const resolved = await resolveProjectId(client, input.project_id);
    if (!resolved) {
      return { ok: false, kind: "data", error: `Project not found: "${input.project_id}"`, errorCode: "NOT_FOUND" as const };
    }

    const body: Record<string, unknown> = {
      project_id: resolved.id,
      title: input.title,
    };

    if (input.task_group_id !== undefined) body.task_group_id = input.task_group_id;
    if (input.description !== undefined) body.description = input.description;
    if (input.priority !== undefined) body.priority = input.priority;
    if (input.assigned_to_id !== undefined) body.assigned_to_id = input.assigned_to_id;
    if (input.status !== undefined) body.status = toStatusCode(input.status);
    if (input.start_date !== undefined) body.start_date = input.start_date;
    if (input.due_date !== undefined) body.due_date = input.due_date;
    if (input.r_rule !== undefined) body.r_rule = input.r_rule;
    if (input.h_parent_id !== undefined) body.h_parent_id = input.h_parent_id;
    if (input.cf_tpl_id !== undefined) body.cf_tpl_id = input.cf_tpl_id;
    if (input.custom_fields !== undefined) body.custom_fields = input.custom_fields;

    return client.request("/tasks", {
      method: "POST",
      body,
    });
  };
}

// ── update_task ──────────────────────────────────────────────────────────────

export const updateTaskSchema = z.object({
  project_id: z.union([z.number().int(), z.string()]).describe("Project ID or name (required)"),
  task_id: z.number().int().describe("Task ID to update (required)"),
  title: z.string().min(1).optional().describe("New task title"),
  task_group_id: z.number().int().optional().describe("Move to this task group"),
  description: z.string().optional().describe("New description"),
  priority: z.number().int().min(0).max(3).optional().describe("Priority: 0=None, 1=Low, 2=Medium, 3=High"),
  assigned_to_id: z.union([z.number().int(), z.array(z.number().int())]).optional()
    .transform((v) => (Array.isArray(v) ? v : v !== undefined ? [v] : undefined))
    .describe("User ID(s) to assign"),
  status: z.union([z.number().int(), z.string()]).optional()
    .describe("Status: 0/1/2 or string label"),
  start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
  r_rule: z.string().optional().describe("Recurrence rule"),
  h_parent_id: z.number().int().optional().describe("Parent task ID for subtask"),
  cf_tpl_id: z.number().int().optional().describe("Custom field template ID"),
  custom_fields: z.record(z.unknown()).optional().describe("Custom field values"),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export function createUpdateTaskHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as UpdateTaskInput;

    const resolved = await resolveProjectId(client, input.project_id);
    if (!resolved) {
      return { ok: false, kind: "data", error: `Project not found: "${input.project_id}"`, errorCode: "NOT_FOUND" as const };
    }

    const body: Record<string, unknown> = {
      project_id: resolved.id,
    };

    if (input.title !== undefined) body.title = input.title;
    if (input.task_group_id !== undefined) body.task_group_id = input.task_group_id;
    if (input.description !== undefined) body.description = input.description;
    if (input.priority !== undefined) body.priority = input.priority;
    if (input.assigned_to_id !== undefined) body.assigned_to_id = input.assigned_to_id;
    if (input.status !== undefined) body.status = toStatusCode(input.status);
    if (input.start_date !== undefined) body.start_date = input.start_date;
    if (input.due_date !== undefined) body.due_date = input.due_date;
    if (input.r_rule !== undefined) body.r_rule = input.r_rule;
    if (input.h_parent_id !== undefined) body.h_parent_id = input.h_parent_id;
    if (input.cf_tpl_id !== undefined) body.cf_tpl_id = input.cf_tpl_id;
    if (input.custom_fields !== undefined) body.custom_fields = input.custom_fields;

    return client.request(`/tasks/${input.task_id}`, {
      method: "PUT",
      body,
    });
  };
}

// ── delete_task ──────────────────────────────────────────────────────────────

export const deleteTaskSchema = z.object({
  project_id: z.union([z.number().int(), z.string()]).describe("Project ID or name the task belongs to"),
  task_id: z.number().int().describe("Task ID to delete"),
});

export type DeleteTaskInput = z.infer<typeof deleteTaskSchema>;

export function createDeleteTaskHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as DeleteTaskInput;

    const resolved = await resolveProjectId(client, input.project_id);
    if (!resolved) {
      return { ok: false, kind: "data", error: `Project not found: "${input.project_id}"`, errorCode: "NOT_FOUND" as const };
    }

    return client.request(`/tasks/${input.task_id}`, {
      method: "DELETE",
      params: { project_id: resolved.id },
    });
  };
}

// ── assign_task ──────────────────────────────────────────────────────────────

export const assignTaskSchema = z.object({
  project_id: z.union([z.number().int(), z.string()]).describe("Project ID or name the task belongs to"),
  task_id: z.number().int().describe("Task ID to assign"),
  user_id: z.union([z.number().int(), z.array(z.number().int())]).optional()
    .transform((v) => (Array.isArray(v) ? v : v !== undefined ? [v] : undefined))
    .describe("User ID(s) to assign to this task"),
});

export type AssignTaskInput = z.infer<typeof assignTaskSchema>;

export function createAssignTaskHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as AssignTaskInput;

    const resolved = await resolveProjectId(client, input.project_id);
    if (!resolved) {
      return { ok: false, kind: "data", error: `Project not found: "${input.project_id}"`, errorCode: "NOT_FOUND" as const };
    }

    const body: Record<string, unknown> = {
      project_id: resolved.id,
    };
    if (input.user_id !== undefined) {
      body.user_id = input.user_id;
    }

    return client.request(`/tasks/${input.task_id}/assign`, {
      method: "POST",
      body,
    });
  };
}

export { STATUS_LABEL_TO_CODE, STATUS_CODE_TO_LABEL, toStatusCode };