/**
 * Comment tools — add_comment, update_comment, delete_comment
 *
 * Freedcamp comments endpoint: POST /comments, POST /comments/{id}, DELETE /comments/{id}
 * requires app_id to identify which app the comment belongs to.
 *
 * Comments are included in task/project get responses via f_include_tr_data.
 * There is no standalone comment list endpoint (COMM-05).
 */

import { z } from "zod";
import type { McpToolResult } from "../../../modules/mcp/types";
import type { FreedcampApiClient } from "../api-client";

// ── App ID constants (COMM-04) ─────────────────────────────────────────────

export const APP_IDS = {
  tasks: 2,
  milestones: 3,
  discussions: 5,
  files: 6,
  time: 8,
  issue_tracker: 9,
} as const;

export type AppIdName = keyof typeof APP_IDS;
export type AppIdValue = typeof APP_IDS[AppIdName];

const APP_ID_DESCRIPTION = "App ID: tasks=2, milestones=3, discussions=5, files=6, time=8, issue_tracker=9";

// ── add_comment ─────────────────────────────────────────────────────────────

export const addCommentSchema = z.object({
  item_id: z.number().int().describe("ID of the item (task, milestone, etc.) to comment on"),
  app_id: z.union([z.number().int(), z.string()]).describe(APP_ID_DESCRIPTION),
  description: z.string().min(1).describe("Comment text (required)"),
  attached_ids: z.union([z.number().int(), z.array(z.number().int())]).optional()
    .transform((v) => (Array.isArray(v) ? v : v !== undefined ? [v] : undefined))
    .describe("File attachment IDs to include"),
});

export type AddCommentInput = z.infer<typeof addCommentSchema>;

export function createAddCommentHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as AddCommentInput;

    const appId = typeof input.app_id === "string"
      ? APP_IDS[input.app_id as AppIdName] ?? parseInt(input.app_id, 10)
      : input.app_id;

    if (isNaN(appId)) {
      return {
        ok: false,
        kind: "data" as const,
        error: `Invalid app_id: "${input.app_id}". Use numeric ID or one of: ${Object.keys(APP_IDS).join(", ")}`,
        errorCode: "VALIDATION_ERROR" as const,
      };
    }

    const body: Record<string, unknown> = {
      item_id: input.item_id,
      app_id: appId,
      description: input.description,
    };

    if (input.attached_ids !== undefined) {
      body.attached_ids = input.attached_ids;
    }

    return client.request("/comments", {
      method: "POST",
      body,
    });
  };
}

// ── update_comment ──────────────────────────────────────────────────────────

export const updateCommentSchema = z.object({
  comment_id: z.number().int().describe("ID of the comment to update"),
  description: z.string().min(1).describe("New comment text (required)"),
});

export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export function createUpdateCommentHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as UpdateCommentInput;

    const body: Record<string, unknown> = {
      description: input.description,
    };

    return client.request(`/comments/${input.comment_id}`, {
      method: "POST",
      body,
    });
  };
}

// ── delete_comment ──────────────────────────────────────────────────────────

export const deleteCommentSchema = z.object({
  comment_id: z.number().int().describe("ID of the comment to delete"),
});

export type DeleteCommentInput = z.infer<typeof deleteCommentSchema>;

export function createDeleteCommentHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as DeleteCommentInput;

    return client.request(`/comments/${input.comment_id}`, {
      method: "DELETE",
    });
  };
}