import { z } from "zod";
import { toolRegistry } from "../../../modules/mcp/registry/tool-registry";
import type { FreedcampApiClient } from "../api-client";
import {
  createCreateHandler,
  createDeleteHandler,
  createGetHandler,
  createListHandler,
  createPostActionHandler,
  createUpdateHandler,
  genericActionSchema,
  genericCreateSchema,
  genericDeleteSchema,
  genericGetSchema,
  genericListSchema,
  genericUpdateSchema,
  scopedListSchema,
} from "./generic-endpoints";

type ToolSpec = {
  name: string;
  description: string;
  endpoint: string;
  kind: "list" | "get" | "create" | "update" | "delete" | "post_action";
  requiredPageKey?: string;
  schema?: z.ZodSchema;
  actionBody?: Record<string, unknown>;
};

const appItemIdSchema = z.object({
  app_id: z.union([z.number().int(), z.string()]).describe("Freedcamp app/module ID, for example 2 for tasks or 4 for milestones."),
  item_id: z.union([z.number().int(), z.string()]).describe("Item ID in that app/module."),
  params: z.record(z.unknown()).optional(),
  fields: z.string().optional(),
}).catchall(z.unknown());

const linkedItemAddSchema = z.object({
  app_id: z.union([z.number().int(), z.string()]).describe("Target app/module ID in the linked_items path."),
  item_id: z.union([z.number().int(), z.string()]).describe("Target item ID in the linked_items path."),
  links: z.record(z.array(z.union([z.number().int(), z.string()]))).optional()
    .describe("Linked items keyed by app/module ID, e.g. {\"2\": [123]} to link tasks."),
  body: z.record(z.unknown()).optional(),
}).catchall(z.unknown());

const installSchema = z.object({
  app_id: z.union([z.number().int(), z.string()]).describe("Freedcamp application/module ID to install or uninstall."),
  project_id: z.union([z.number().int(), z.string()]).describe("Project ID."),
  body: z.record(z.unknown()).optional(),
  params: z.record(z.unknown()).optional(),
}).catchall(z.unknown());

const groupMembershipRemoveSchema = z.object({
  group_id: z.union([z.number().int(), z.string()]).describe("Group ID."),
  user_id: z.union([z.number().int(), z.string()]).describe("User ID to remove from the group."),
  params: z.record(z.unknown()).optional(),
}).catchall(z.unknown());

const teamMembershipSchema = z.object({
  team_id: z.union([z.number().int(), z.string()]).describe("Team ID."),
  body: z.record(z.unknown()).optional(),
  params: z.record(z.unknown()).optional(),
}).catchall(z.unknown());

const teamMembershipRemoveSchema = teamMembershipSchema.extend({
  user_id: z.union([z.number().int(), z.string()]).describe("User ID to remove from the team."),
});

const favoriteProjectSchema = z.object({
  project_id: z.union([z.number().int(), z.string()]).describe("Project ID."),
  params: z.record(z.unknown()).optional(),
}).catchall(z.unknown());

const fileCreateSchema = z.object({
  file_path: z.string().min(1).describe("Local filesystem path of the file to upload."),
  filename: z.string().optional().describe("Optional upload filename override."),
  file_field_name: z.string().optional().default("file").describe("Multipart file field name. Freedcamp's Postman collection uses file."),
  data: z.record(z.unknown()).optional().describe("Freedcamp data object sent as the multipart data JSON field."),
  body: z.record(z.unknown()).optional().describe("Alias for data. Top-level extra fields are also included in data."),
  params: z.record(z.unknown()).optional().describe("Additional query parameters."),
}).catchall(z.unknown());

function endpointWith(input: Record<string, unknown>, template: string): string {
  return template.replace(/\{([a-z_]+)\}/g, (_match, key) => encodeURIComponent(String(input[key])));
}

function uploadData(input: Record<string, unknown> & { data?: Record<string, unknown>; body?: Record<string, unknown> }): Record<string, unknown> {
  const excluded = new Set(["file_path", "filename", "file_field_name", "params", "data", "body"]);
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!excluded.has(key) && value !== undefined) {
      data[key] = value;
    }
  }
  return { ...data, ...(input.body ?? {}), ...(input.data ?? {}) };
}

function register(spec: ToolSpec, client: FreedcampApiClient): void {
  const schema = spec.schema ?? schemaFor(spec.kind);
  toolRegistry.register({
    name: spec.name,
    description: spec.description,
    inputSchema: schema,
    requiredPageKey: spec.requiredPageKey ?? spec.name.split(".")[0],
    accessLevel: spec.kind === "list" || spec.kind === "get" ? "READ" : "WRITE",
    handler: handlerFor(spec, client),
  });
}

function schemaFor(kind: ToolSpec["kind"]): z.ZodSchema {
  switch (kind) {
    case "list": return scopedListSchema;
    case "get": return genericGetSchema;
    case "create": return genericCreateSchema;
    case "update": return genericUpdateSchema;
    case "delete": return genericDeleteSchema;
    case "post_action": return genericActionSchema;
  }
}

function handlerFor(spec: ToolSpec, client: FreedcampApiClient) {
  switch (spec.kind) {
    case "list": return createListHandler(client, spec.endpoint);
    case "get": return createGetHandler(client, spec.endpoint);
    case "create": return createCreateHandler(client, spec.endpoint);
    case "update": return createUpdateHandler(client, spec.endpoint);
    case "delete": return createDeleteHandler(client, spec.endpoint);
    case "post_action": return createPostActionHandler(client, spec.endpoint, spec.actionBody);
  }
}

const specs: ToolSpec[] = [
  // Calendar events
  { name: "event.list", endpoint: "/events", kind: "list", description: "List calendar events. Supports project_id, from_ts, to_ts, pagination, sorting, and other Freedcamp query params." },
  { name: "event.get", endpoint: "/events", kind: "get", description: "Get a calendar event by ID." },
  { name: "event.create", endpoint: "/events", kind: "create", description: "Create a calendar event. Common fields: project_id, title, description, f_all_day, start_date, start_time, end_date, end_time, r_rule, mixed_users, attached_ids." },
  { name: "event.update", endpoint: "/events", kind: "update", description: "Update a calendar event by ID using Freedcamp's POST edit endpoint." },
  { name: "event.delete", endpoint: "/events", kind: "delete", description: "Delete a calendar event by ID." },

  // Discussions
  { name: "discussion.list", endpoint: "/discussions", kind: "list", description: "List discussions. Supports project_id, limit, offset, sorting, and other Freedcamp query params." },
  { name: "discussion.get", endpoint: "/discussions", kind: "get", description: "Get a discussion by ID." },
  { name: "discussion.create", endpoint: "/discussions", kind: "create", description: "Create a discussion. Common fields: title, description, project_id, list_id, list_title, list_descr, f_sticky, f_private, private_users, notifications, attached_ids." },
  { name: "discussion.update", endpoint: "/discussions", kind: "update", description: "Update a discussion by ID." },
  { name: "discussion.delete", endpoint: "/discussions", kind: "delete", description: "Delete a discussion by ID." },

  // Files. Binary multipart upload is not modeled by this MCP client; file metadata endpoints are exposed.
  { name: "file.list", endpoint: "/files", kind: "list", description: "List files. Supports project_id, group_id, application_id, item_id, and other Freedcamp query params." },
  { name: "file.get", endpoint: "/files", kind: "get", description: "Get file metadata by ID." },
  { name: "file.delete", endpoint: "/files", kind: "delete", description: "Delete a file by ID." },

  // Issues
  { name: "issue.list", endpoint: "/issues", kind: "list", description: "List issues. Supports project_id, limit, offset, tags, sorting, and other Freedcamp query params." },
  { name: "issue.get", endpoint: "/issues", kind: "get", description: "Get an issue by ID." },
  { name: "issue.create", endpoint: "/issues", kind: "create", description: "Create an issue. Common fields: title, description, project_id, priority, status, type, assigned_to_id, due_date, closer_id, attached_ids." },
  { name: "issue.update", endpoint: "/issues", kind: "update", description: "Update an issue by ID." },
  { name: "issue.delete", endpoint: "/issues", kind: "delete", description: "Delete an issue by ID." },

  // Milestones
  { name: "milestone.list", endpoint: "/milestones", kind: "list", description: "List milestones. Supports project_id, limit, offset, sorting, and other Freedcamp query params." },
  { name: "milestone.get", endpoint: "/milestones", kind: "get", description: "Get a milestone by ID." },
  { name: "milestone.create", endpoint: "/milestones", kind: "create", description: "Create a milestone. Common fields: title, description, project_id, priority, assigned_to_id, due_date, status." },
  { name: "milestone.update", endpoint: "/milestones", kind: "update", description: "Update a milestone by ID." },
  { name: "milestone.delete", endpoint: "/milestones", kind: "delete", description: "Delete a milestone by ID." },

  // CRM tasks and calls
  { name: "crm_task.list", endpoint: "/crm_tasks", kind: "list", description: "List CRM tasks. Supports group_id, limit, offset, sorting, and other Freedcamp query params." },
  { name: "crm_task.get", endpoint: "/crm_tasks", kind: "get", description: "Get a CRM task by ID." },
  { name: "crm_task.create", endpoint: "/crm_tasks", kind: "create", description: "Create a CRM task. Common fields: title, description, group_id, type, contact_title, f_private, assigned_to_id, due_date." },
  { name: "crm_task.update", endpoint: "/crm_tasks", kind: "update", description: "Update a CRM task by ID." },
  { name: "crm_task.delete", endpoint: "/crm_tasks", kind: "delete", description: "Delete a CRM task by ID." },
  { name: "crm_call.list", endpoint: "/crm_calls", kind: "list", description: "List CRM calls. Supports group_id, limit, offset, sorting, and other Freedcamp query params." },
  { name: "crm_call.get", endpoint: "/crm_calls", kind: "get", description: "Get a CRM call by ID." },
  { name: "crm_call.create", endpoint: "/crm_calls", kind: "create", description: "Create a CRM call. Common fields: title, description, group_id, f_inbound, contact_title, assigned_to_id, due_date, duration." },
  { name: "crm_call.update", endpoint: "/crm_calls", kind: "update", description: "Update a CRM call by ID." },
  { name: "crm_call.delete", endpoint: "/crm_calls", kind: "delete", description: "Delete a CRM call by ID." },

  // Time records
  { name: "time.list", endpoint: "/times", kind: "list", description: "List time records. Supports project_id, limit, offset, sorting, and other Freedcamp query params." },
  { name: "time.get", endpoint: "/times", kind: "get", description: "Get a time record by ID." },
  { name: "time.create", endpoint: "/times", kind: "create", description: "Create a time record. Common fields: description, project_id, assigned_to_id, date, minutes_count, f_started, f_billed." },
  { name: "time.update", endpoint: "/times", kind: "update", description: "Update a time record by ID." },
  { name: "time.start", endpoint: "/times", kind: "post_action", actionBody: { action: "start" }, description: "Start a time record timer by ID." },
  { name: "time.stop", endpoint: "/times", kind: "post_action", actionBody: { action: "stop" }, description: "Stop a time record timer by ID." },
  { name: "time.bill", endpoint: "/times", kind: "post_action", actionBody: { action: "bill" }, description: "Mark a time record as billed by ID." },
  { name: "time.unbill", endpoint: "/times", kind: "post_action", actionBody: { action: "unbill" }, description: "Mark a time record as unbilled by ID." },
  { name: "time.delete", endpoint: "/times", kind: "delete", description: "Delete a time record by ID." },

  // Wiki
  { name: "wiki.list", endpoint: "/wikis", kind: "list", description: "List wiki pages. Supports project_id, limit, offset, sorting, and other Freedcamp query params." },
  { name: "wiki.get", endpoint: "/wikis", kind: "get", description: "Get a wiki page by ID." },
  { name: "wiki.create", endpoint: "/wikis", kind: "create", description: "Create a wiki page. Common fields: title, description, project_id, list_id, list_title, list_descr, f_private, f_public, private_users, attached_ids." },
  { name: "wiki.update", endpoint: "/wikis", kind: "update", description: "Update a wiki page by ID." },
  { name: "wiki.add_version", endpoint: "/wikis", kind: "post_action", actionBody: { f_new_version: true }, description: "Add a new version to a wiki page by ID." },
  { name: "wiki.delete", endpoint: "/wikis", kind: "delete", description: "Delete a wiki page by ID." },

  // Aggregated/account/project management
  { name: "notification.list", endpoint: "/notifications", kind: "list", schema: genericListSchema, description: "List notifications." },
  { name: "notification.update", endpoint: "/notifications", kind: "create", description: "Update notification state. Common fields: new_state, items." },
  { name: "calendar_item.list", endpoint: "/calendar_items", kind: "list", description: "List aggregated calendar items grouped by application. Supports project_id and other query params." },
  { name: "project.recent_ids", endpoint: "/recent_project_ids", kind: "list", schema: genericListSchema, description: "List recent project IDs for the authenticated user.", requiredPageKey: "projects" },
  { name: "project.delete", endpoint: "/projects", kind: "delete", description: "Delete a project by ID.", requiredPageKey: "projects" },
  { name: "project.leave", endpoint: "/project_memberships", kind: "delete", description: "Leave a project/delete the current user's project membership by membership/project ID.", requiredPageKey: "projects" },

  // Lists, linked items, groups, installs, custom fields
  { name: "item_list.list", endpoint: "/lists/2", kind: "list", description: "List item lists for app/module 2 by default. Supports project_id and query params." },
  { name: "item_list.create", endpoint: "/lists/2", kind: "create", description: "Create an item list. Common fields: project_id, title, description." },
  { name: "item_list.update", endpoint: "/lists/2", kind: "update", description: "Update an item list by ID." },
  { name: "item_list.archive", endpoint: "/lists/2", kind: "post_action", actionBody: { f_archived: true }, description: "Archive an item list by ID." },
  { name: "item_list.unarchive", endpoint: "/lists/2", kind: "post_action", actionBody: { f_archived: false }, description: "Unarchive an item list by ID." },
  { name: "item_list.delete", endpoint: "/lists/2", kind: "delete", description: "Delete an item list by ID." },
  { name: "group.list", endpoint: "/groups", kind: "list", schema: genericListSchema, description: "List groups." },
  { name: "group.create", endpoint: "/groups", kind: "create", description: "Create a group. Common fields: name, description." },
  { name: "group.update", endpoint: "/groups", kind: "update", description: "Update a group by ID." },
  { name: "group.delete", endpoint: "/groups", kind: "delete", description: "Delete a group by ID." },
  { name: "custom_field_template.list", endpoint: "/cf_templates", kind: "list", description: "List custom field templates. Supports module_id and query params." },
  { name: "custom_field_template.create", endpoint: "/cf_templates", kind: "create", description: "Create a custom field template. Common fields: title, module_id, owner_id, fields." },
  { name: "custom_field_template.update", endpoint: "/cf_templates", kind: "update", description: "Update a custom field template by ID." },
  { name: "custom_field_template.delete", endpoint: "/cf_templates", kind: "delete", description: "Delete a custom field template by ID." },

  // Memberships
  { name: "group_membership.add", endpoint: "/group_memberships", kind: "update", description: "Add users/teams to a group membership endpoint. Use id as group_id. Common fields: users, invited_global_teams." },
  { name: "project_membership.add", endpoint: "/project_memberships/all/users", kind: "create", description: "Add/remove a user's project memberships. Common fields: email, add_project_ids, remove_project_ids." },
  { name: "project_membership.remove", endpoint: "/project_memberships", kind: "delete", description: "Remove a project membership by project/membership ID." },
];

export function registerCollectionEndpointTools(client: FreedcampApiClient): void {
  for (const spec of specs) {
    register(spec, client);
  }

  toolRegistry.register({
    name: "file.create",
    description: "Upload and attach a file using multipart/form-data. Provide file_path plus data fields such as project_id/group_id, application_id, and item_id.",
    inputSchema: fileCreateSchema,
    requiredPageKey: "file",
    accessLevel: "WRITE",
    handler: async (_ctx, rawInput) => {
      const input = rawInput as Record<string, unknown> & {
        file_path: string;
        filename?: string;
        file_field_name?: string;
        data?: Record<string, unknown>;
        body?: Record<string, unknown>;
        params?: Record<string, unknown>;
      };
      return client.requestMultipart("/files", {
        filePath: input.file_path,
        filename: input.filename,
        fileFieldName: input.file_field_name,
        data: uploadData(input),
        params: input.params,
      });
    },
  });

  toolRegistry.register({
    name: "favorite_project.add",
    description: "Mark a project as favorite.",
    inputSchema: favoriteProjectSchema,
    requiredPageKey: "projects",
    accessLevel: "WRITE",
    handler: async (_ctx, rawInput) => client.request(endpointWith(rawInput as Record<string, unknown>, "/favorite_projects/{project_id}"), {
      method: "POST",
      params: (rawInput as { params?: Record<string, unknown> }).params,
    }),
  });

  toolRegistry.register({
    name: "favorite_project.remove",
    description: "Remove a project from favorites.",
    inputSchema: favoriteProjectSchema,
    requiredPageKey: "projects",
    accessLevel: "WRITE",
    handler: async (_ctx, rawInput) => client.request(endpointWith(rawInput as Record<string, unknown>, "/favorite_projects/{project_id}"), {
      method: "DELETE",
      params: (rawInput as { params?: Record<string, unknown> }).params,
    }),
  });

  toolRegistry.register({
    name: "linked_item.list",
    description: "List linked items for an app/item pair, e.g. app_id=2 and item_id=<task_id>.",
    inputSchema: appItemIdSchema,
    requiredPageKey: "linked_items",
    accessLevel: "READ",
    handler: async (_ctx, rawInput) => {
      const input = rawInput as Record<string, unknown> & { params?: Record<string, unknown>; fields?: string };
      return client.request(endpointWith(input, "/linked_items/{app_id}/{item_id}"), {
        method: "GET",
        params: input.params,
        fields: input.fields,
      });
    },
  });

  toolRegistry.register({
    name: "linked_item.add",
    description: "Add linked items for an app/item pair. Use links/body keyed by target app ID, e.g. {\"2\": [123]}.",
    inputSchema: linkedItemAddSchema,
    requiredPageKey: "linked_items",
    accessLevel: "WRITE",
    handler: async (_ctx, rawInput) => {
      const input = rawInput as Record<string, unknown> & { links?: Record<string, unknown>; body?: Record<string, unknown> };
      return client.request(endpointWith(input, "/linked_items/{app_id}/{item_id}"), {
        method: "POST",
        body: { ...(input.links ?? {}), ...(input.body ?? {}) },
      });
    },
  });

  for (const [name, method] of [["install.add", "POST"], ["install.remove", "DELETE"]] as const) {
    toolRegistry.register({
      name,
      description: name.endsWith(".add") ? "Install a Freedcamp app/module in a project." : "Uninstall a Freedcamp app/module from a project.",
      inputSchema: installSchema,
      requiredPageKey: "installs",
      accessLevel: "WRITE",
      handler: async (_ctx, rawInput) => {
        const input = rawInput as Record<string, unknown> & { body?: Record<string, unknown>; params?: Record<string, unknown> };
        return client.request(endpointWith(input, "/installs/{app_id}/{project_id}"), {
          method,
          params: input.params,
          body: input.body,
        });
      },
    });
  }

  toolRegistry.register({
    name: "group_membership.remove",
    description: "Remove a user from a group membership.",
    inputSchema: groupMembershipRemoveSchema,
    requiredPageKey: "group_memberships",
    accessLevel: "WRITE",
    handler: async (_ctx, rawInput) => {
      const input = rawInput as Record<string, unknown> & { params?: Record<string, unknown> };
      return client.request(endpointWith(input, "/group_memberships/{group_id}/users/{user_id}"), {
        method: "DELETE",
        params: input.params,
      });
    },
  });

  toolRegistry.register({
    name: "team_membership.add",
    description: "Add users to a team. Supports params such as f_dry_run and body.users.",
    inputSchema: teamMembershipSchema,
    requiredPageKey: "team_memberships",
    accessLevel: "WRITE",
    handler: async (_ctx, rawInput) => {
      const input = rawInput as Record<string, unknown> & { body?: Record<string, unknown>; params?: Record<string, unknown> };
      return client.request(endpointWith(input, "/team_memberships/{team_id}"), {
        method: "POST",
        params: input.params,
        body: input.body,
      });
    },
  });

  toolRegistry.register({
    name: "team_membership.remove",
    description: "Remove a user from a team.",
    inputSchema: teamMembershipRemoveSchema,
    requiredPageKey: "team_memberships",
    accessLevel: "WRITE",
    handler: async (_ctx, rawInput) => {
      const input = rawInput as Record<string, unknown> & { params?: Record<string, unknown> };
      return client.request(endpointWith(input, "/team_memberships/{team_id}"), {
        method: "DELETE",
        params: { ...(input.params ?? {}), user_id: input.user_id },
      });
    },
  });
}
