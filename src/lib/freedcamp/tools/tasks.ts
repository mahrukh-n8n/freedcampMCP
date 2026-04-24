/**
 * Task tools — list_tasks, get_task, create_task, update_task, delete_task, assign_task
 *
 * Freedcamp tasks endpoint: GET/POST /tasks, GET/PUT/DELETE /tasks/{id}
 * Default includes f_include_tags=1 to prevent silent data loss (TASK-06).
 * task_url constructed from project_id + task_id (TASK-10).
 * Tag names resolved from tag IDs in list responses (TASK-12).
 * Status: numeric codes are project-specific (custom status templates change 0/1/2 meanings).
 * The response includes status_title which reflects the project's actual labels.
 */

import { z } from "zod";
import type { McpToolResult } from "../../../modules/mcp/types";
import { dataResult, errorResult } from "../../../modules/mcp/utils/serialize";
import type { FreedcampApiClient } from "../api-client";
import { STATUS_MAP, STATUS_CODE_MAP, resolveStatus, resolveProjectId, resolveUserId } from "../utils/name-resolver";

// ── Constants ─────────────────────────────────────────────────────────────────

const FREEDCAMP_BASE_URL = "https://freedcamp.com";

function buildTaskUrl(projectId: number | string, taskId: number | string): string {
  return `${FREEDCAMP_BASE_URL}/project/${projectId}/task/${taskId}`;
}

/** Resolve an array of user identifiers (IDs, emails, or names) to numeric IDs. */
async function resolveUserIds(
  client: FreedcampApiClient,
  ids: (number | string)[]
): Promise<{ ids: number[] | null; error?: string }> {
  const resolved: number[] = [];
  for (const id of ids) {
    const r = await resolveUserId(client, id);
    if (r) resolved.push(r.id);
    else if (typeof id === "number") resolved.push(id);
    else return { ids: null, error: `User not found: "${id}"` };
  }
  return { ids: resolved };
}

/** Tag ID→name cache, scoped per project to avoid stale entries across projects. */
const tagCache = new Map<string, Map<string, string>>();

/**
 * Resolve tag IDs to tag names in a task list response.
 * If the API response already includes a tags lookup object, use it directly.
 * Otherwise, fetch tag details from a single task in the result to build the map.
 */
async function resolveTagNamesInResponse(
  client: FreedcampApiClient,
  result: McpToolResult,
  projectId: number
): Promise<void> {
  if (result.kind !== "data" || !result.ok) return;

  const payload = result.payload as Record<string, unknown>;
  const data = payload.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object") return;

  const tasks = Array.isArray(data)
    ? data as Record<string, unknown>[]
    : Array.isArray(data.tasks)
      ? data.tasks as Record<string, unknown>[]
      : null;
  if (!tasks || tasks.length === 0) return;

  // Check if API already returned a tags lookup object
  let tagMap: Map<string, string> | undefined;
  const rawTags = data.tags as Record<string, unknown>[] | undefined;
  if (rawTags && Array.isArray(rawTags) && rawTags.length > 0 && typeof rawTags[0] === "object" && "title" in rawTags[0]) {
    tagMap = new Map(rawTags.map(t => [String(t.id), String(t.title)]));
  } else {
    // Check cache first
    const cacheKey = String(projectId);
    const cached = tagCache.get(cacheKey);
    if (cached && cached.size > 0) {
      tagMap = cached;
    } else {
      // Fetch tag details from a single task that has tags
      const taggedTask = tasks.find(t => {
        const tags = t.tags as string[] | undefined;
        return tags && tags.length > 0;
      });

      if (taggedTask) {
        const taskId = Number(taggedTask.id);
        try {
          const detailResult = await client.request(`/tasks/${taskId}`, {
            method: "GET",
            params: { project_id: projectId, f_include_tr_data: 1, f_include_tags: 1 },
          });
          if (detailResult.ok && detailResult.kind === "data") {
            const detailPayload = detailResult.payload as Record<string, unknown>;
            const detailData = detailPayload.data as Record<string, unknown> | undefined;
            const detailTags = detailData?.tags as Record<string, unknown>[] | undefined;
            if (detailTags && Array.isArray(detailTags)) {
              tagMap = new Map(detailTags.map(t => [String(t.id), String(t.title)]));
              tagCache.set(cacheKey, tagMap);
            }
          }
        } catch {
          // Tag resolution is best-effort; don't fail the whole request
        }
      }
    }
  }

  if (!tagMap || tagMap.size === 0) return;

  // Replace tag ID arrays with tag name arrays on each task
  for (const task of tasks) {
    const tagIds = task.tags as string[] | undefined;
    if (tagIds && Array.isArray(tagIds)) {
      task.tag_names = tagIds.map(id => tagMap!.get(String(id)) ?? String(id));
    }
  }
}

// ── list_tasks ────────────────────────────────────────────────────────────────

export const listTasksSchema = z.object({
  project_id: z.union([z.number().int(), z.string()]).describe("Project ID or name (required)"),
  task_group_id: z.number().int().optional().describe("Task group ID to filter by"),
  milestone_id: z.number().int().optional().describe("Milestone ID to filter by"),
  assigned_to_id: z.union([z.number().int(), z.string(), z.array(z.union([z.number().int(), z.string()]))]).optional()
    .transform((v) => (Array.isArray(v) ? v : v !== undefined ? [v] : undefined))
    .describe("User ID(s), email(s), or name(s) to filter by assigned user"),
  status: z.union([z.number().int(), z.string(), z.array(z.union([z.number().int(), z.string()]))]).optional()
    .describe("Status filter: numeric status_id values or string labels. NOTE: projects with custom status templates may use different numeric mappings (e.g., 0=No Progress, 1=Completed). Check status_title in responses for correct labels. Standard mapping: 0=not started, 1=in progress, 2=completed"),
  created_by_id: z.union([z.number().int(), z.string(), z.array(z.union([z.number().int(), z.string()]))]).optional()
    .transform((v) => (Array.isArray(v) ? v : v !== undefined ? [v] : undefined))
    .describe("User ID(s), email(s), or name(s) who created the task"),
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

    // assigned_to_id → resolve names/emails to IDs, encoded as multi-value array
    if (input.assigned_to_id !== undefined) {
      const result = await resolveUserIds(client, input.assigned_to_id);
      if (!result.ids) return { ok: false, kind: "data" as const, error: result.error!, errorCode: "NOT_FOUND" as const };
      params.assigned_to_id = result.ids;
    }

    // status → map string labels to numeric, encoded as multi-value
    const statusCodes = mapStatusStatus(input.status);
    if (statusCodes !== undefined) {
      params.status = statusCodes;
    }

    if (input.created_by_id !== undefined) {
      const result = await resolveUserIds(client, input.created_by_id);
      if (!result.ids) return { ok: false, kind: "data" as const, error: result.error!, errorCode: "NOT_FOUND" as const };
      params.created_by_id = result.ids;
    }
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
    // Only inject if no field filter or if task_url is explicitly in the filter
    const wantsTaskUrl = !input.fields || input.fields.split(",").map(f => f.trim()).some(f => f === "task_url");
    if (result.ok && result.kind === "data" && wantsTaskUrl) {
      const payload = result.payload as Record<string, unknown>;
      const data = payload.data as Record<string, unknown> | unknown[];
      // Handle both { tasks: [...] } and direct array response shapes
      const tasks = Array.isArray(data) ? data : Array.isArray(data?.tasks) ? data.tasks as Record<string, unknown>[] : null;
      if (tasks) {
        for (const task of tasks) {
          const pId = Number((task as Record<string, unknown>).project_id ?? resolved.id);
          const tId = Number((task as Record<string, unknown>).id);
          if (tId) {
            (task as Record<string, unknown>).task_url = buildTaskUrl(pId, tId);
          }
        }
      }
    }

    // Resolve tag IDs to tag names in the response (TASK-12)
    if (result.ok && result.kind === "data" && input.f_include_tags !== 0) {
      await resolveTagNamesInResponse(client, result, resolved.id);
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

    // Inject task_url (TASK-10) — respect field limiting
    const wantsTaskUrl = !input.fields || input.fields.split(",").map(f => f.trim()).some(f => f === "task_url");
    if (result.ok && result.kind === "data" && wantsTaskUrl) {
      const payload = result.payload as Record<string, unknown>;
      const data = payload.data as Record<string, unknown> | unknown[];
      // Handle { tasks: [...] } shape
      const tasks = Array.isArray(data) ? data as Record<string, unknown>[] : Array.isArray(data?.tasks) ? data.tasks as Record<string, unknown>[] : null;
      if (tasks) {
        for (const task of tasks) {
          task.task_url = buildTaskUrl(resolved.id, input.task_id);
        }
      } else if (data && typeof data === "object" && !Array.isArray(data)) {
        // Single task object (rare but possible)
        (data as Record<string, unknown>).task_url = buildTaskUrl(resolved.id, input.task_id);
      }
    }

    // Resolve tag IDs to tag names (TASK-12)
    if (result.ok && result.kind === "data" && input.f_include_tags !== 0) {
      await resolveTagNamesInResponse(client, result, resolved.id);
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
  assigned_to_id: z.union([z.number().int(), z.string(), z.array(z.union([z.number().int(), z.string()]))]).optional()
    .transform((v) => (Array.isArray(v) ? v : v !== undefined ? [v] : undefined))
    .describe("User ID(s), email(s), or name(s) to assign"),
  status: z.union([z.number().int(), z.string()]).optional()
    .describe("Status: numeric status_id or string label. NOTE: projects with custom status templates may use different mappings. Standard: 0=not started, 1=in progress, 2=completed"),
  start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
  r_rule: z.string().optional().describe("Recurrence rule (iCal RRULE format)"),
  h_parent_id: z.number().int().optional().describe("Parent task ID for subtask"),
  cf_tpl_id: z.number().int().optional().describe("Custom field template ID"),
  custom_fields: z.record(z.unknown()).optional().describe("Custom field values as key-value pairs"),
  attached_ids: z.union([z.number().int(), z.array(z.number().int())]).optional()
    .transform((v) => (Array.isArray(v) ? v : v !== undefined ? [v] : undefined))
    .describe("File attachment IDs to attach to this task"),
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
    if (input.assigned_to_id !== undefined) {
      const result = await resolveUserIds(client, input.assigned_to_id);
      if (!result.ids) return { ok: false, kind: "data" as const, error: result.error!, errorCode: "NOT_FOUND" as const };
      body.assigned_to_id = result.ids;
    }
    if (input.status !== undefined) body.status = toStatusCode(input.status);
    if (input.start_date !== undefined) body.start_date = input.start_date;
    if (input.due_date !== undefined) body.due_date = input.due_date;
    if (input.r_rule !== undefined) body.r_rule = input.r_rule;
    if (input.h_parent_id !== undefined) body.h_parent_id = input.h_parent_id;
    if (input.cf_tpl_id !== undefined) body.cf_tpl_id = input.cf_tpl_id;
    if (input.custom_fields !== undefined) body.custom_fields = input.custom_fields;
    if (input.attached_ids !== undefined) body.attached_ids = input.attached_ids;

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
  assigned_to_id: z.union([z.number().int(), z.string(), z.array(z.union([z.number().int(), z.string()]))]).optional()
    .transform((v) => (Array.isArray(v) ? v : v !== undefined ? [v] : undefined))
    .describe("User ID(s), email(s), or name(s) to assign"),
  status: z.union([z.number().int(), z.string()]).optional()
    .describe("Status: numeric status_id or string label. NOTE: projects with custom status templates may use different mappings"),
  start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
  r_rule: z.string().optional().describe("Recurrence rule"),
  h_parent_id: z.number().int().optional().describe("Parent task ID for subtask"),
  cf_tpl_id: z.number().int().optional().describe("Custom field template ID"),
  custom_fields: z.record(z.unknown()).optional().describe("Custom field values"),
  attached_ids: z.union([z.number().int(), z.array(z.number().int())]).optional()
    .transform((v) => (Array.isArray(v) ? v : v !== undefined ? [v] : undefined))
    .describe("File attachment IDs to attach to this task"),
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
    if (input.assigned_to_id !== undefined) {
      const result = await resolveUserIds(client, input.assigned_to_id);
      if (!result.ids) return { ok: false, kind: "data" as const, error: result.error!, errorCode: "NOT_FOUND" as const };
      body.assigned_to_id = result.ids;
    }
    if (input.status !== undefined) body.status = toStatusCode(input.status);
    if (input.start_date !== undefined) body.start_date = input.start_date;
    if (input.due_date !== undefined) body.due_date = input.due_date;
    if (input.r_rule !== undefined) body.r_rule = input.r_rule;
    if (input.h_parent_id !== undefined) body.h_parent_id = input.h_parent_id;
    if (input.cf_tpl_id !== undefined) body.cf_tpl_id = input.cf_tpl_id;
    if (input.custom_fields !== undefined) body.custom_fields = input.custom_fields;
    if (input.attached_ids !== undefined) body.attached_ids = input.attached_ids;

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
  user_id: z.union([z.number().int(), z.string(), z.array(z.union([z.number().int(), z.string()]))]).optional()
    .transform((v) => (Array.isArray(v) ? v : v !== undefined ? [v] : undefined))
    .describe("User ID(s), email(s), or name(s) to assign to this task"),
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
      const result = await resolveUserIds(client, input.user_id);
      if (!result.ids) return { ok: false, kind: "data" as const, error: result.error!, errorCode: "NOT_FOUND" as const };
      body.user_id = result.ids;
    }

    return client.request(`/tasks/${input.task_id}/assign`, {
      method: "POST",
      body,
    });
  };
}

export { STATUS_LABEL_TO_CODE, STATUS_CODE_TO_LABEL, toStatusCode };