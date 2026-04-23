/**
 * Tool registration — wires all tool definitions to the MCP registry.
 *
 * Each tool follows the {domain}.{action} naming convention.
 * Handlers receive a FreedcampApiClient closure (injected at registration time).
 */

import { toolRegistry } from "../../modules/mcp/registry/tool-registry";
import type { FreedcampApiClient } from "./api-client";
import {
  listProjectsSchema, createListProjectsHandler,
  getProjectSchema, createGetProjectHandler,
  createProjectSchema, createCreateProjectHandler,
  updateProjectSchema, createUpdateProjectHandler,
} from "./tools/projects";
import {
  listUsersSchema, createListUsersHandler,
  getUserSchema, createGetUserHandler,
  getCurrentUserSchema, createGetCurrentUserHandler,
  createUserSchema, createCreateUserHandler,
  updateCurrentUserSchema, createUpdateCurrentUserHandler,
} from "./tools/users";
import {
  listTasksSchema, createListTasksHandler,
  getTaskSchema, createGetTaskHandler,
  createTaskSchema, createCreateTaskHandler,
  updateTaskSchema, createUpdateTaskHandler,
  deleteTaskSchema, createDeleteTaskHandler,
  assignTaskSchema, createAssignTaskHandler,
} from "./tools/tasks";
import { healthCheckSchema } from "./tools/health";

export function registerAllTools(client: FreedcampApiClient, apiKey: string, apiSecret: string, baseUrl?: string): void {
  // Health check
  toolRegistry.register({
    name: "health.check",
    description: "Verify Freedcamp API credentials and connection status. Returns { ok, userId } on success.",
    inputSchema: healthCheckSchema,
    requiredPageKey: "health",
    accessLevel: "READ",
    handler: async (_ctx, _input) => {
      const { healthCheckHandler } = await import("./tools/health");
      return healthCheckHandler(apiKey, apiSecret, baseUrl);
    },
  });

  // Projects — read
  toolRegistry.register({
    name: "project.list",
    description: "List all projects the authenticated user has access to. Supports pagination, sorting, and field limiting.",
    inputSchema: listProjectsSchema,
    requiredPageKey: "projects",
    accessLevel: "READ",
    handler: createListProjectsHandler(client),
  });

  toolRegistry.register({
    name: "project.get",
    description: "Get details of a single project by ID or name. Supports field limiting.",
    inputSchema: getProjectSchema,
    requiredPageKey: "projects",
    accessLevel: "READ",
    handler: createGetProjectHandler(client),
  });

  // Projects — write
  toolRegistry.register({
    name: "project.create",
    description: "Create a new project. Requires project_name. Optionally set description, color, view type, and group.",
    inputSchema: createProjectSchema,
    requiredPageKey: "projects",
    accessLevel: "WRITE",
    handler: createCreateProjectHandler(client),
  });

  toolRegistry.register({
    name: "project.update",
    description: "Update an existing project. Only provided fields are changed. Accepts project ID or name.",
    inputSchema: updateProjectSchema,
    requiredPageKey: "projects",
    accessLevel: "WRITE",
    handler: createUpdateProjectHandler(client),
  });

  // Users — read
  toolRegistry.register({
    name: "user.list",
    description: "List users. Optionally filter by project_id. Supports pagination and field limiting.",
    inputSchema: listUsersSchema,
    requiredPageKey: "users",
    accessLevel: "READ",
    handler: createListUsersHandler(client),
  });

  toolRegistry.register({
    name: "user.get",
    description: "Get a single user by ID. Supports field limiting.",
    inputSchema: getUserSchema,
    requiredPageKey: "users",
    accessLevel: "READ",
    handler: createGetUserHandler(client),
  });

  toolRegistry.register({
    name: "user.current",
    description: "Get the authenticated user's profile. Supports field limiting.",
    inputSchema: getCurrentUserSchema,
    requiredPageKey: "users",
    accessLevel: "READ",
    handler: createGetCurrentUserHandler(client),
  });

  // Users — write
  toolRegistry.register({
    name: "user.create",
    description: "Create a new user. Requires email, password, and first_name.",
    inputSchema: createUserSchema,
    requiredPageKey: "users",
    accessLevel: "WRITE",
    handler: createCreateUserHandler(client),
  });

  toolRegistry.register({
    name: "user.update_current",
    description: "Update the authenticated user's profile. Requires confirmation_password when changing password.",
    inputSchema: updateCurrentUserSchema,
    requiredPageKey: "users",
    accessLevel: "WRITE",
    handler: createUpdateCurrentUserHandler(client),
  });

  // Tasks — read
  toolRegistry.register({
    name: "task.list",
    description: "List tasks in a project with full filter support: assigned user, status (0/1/2 or labels), date ranges, tags, search. Defaults f_include_tags=1 to prevent data loss. Supports pagination, sort, and field limiting.",
    inputSchema: listTasksSchema,
    requiredPageKey: "tasks",
    accessLevel: "READ",
    handler: createListTasksHandler(client),
  });

  toolRegistry.register({
    name: "task.get",
    description: "Get a single task by ID with comments and tag detail. Defaults f_include_tr_data=1 and f_include_tags=1. Injects task_url field. Supports field limiting.",
    inputSchema: getTaskSchema,
    requiredPageKey: "tasks",
    accessLevel: "READ",
    handler: createGetTaskHandler(client),
  });

  // Tasks — write
  toolRegistry.register({
    name: "task.create",
    description: "Create a new task. Accepts string status labels (\"not started\", \"in progress\", \"completed\") or numeric codes (0, 1, 2).",
    inputSchema: createTaskSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    handler: createCreateTaskHandler(client),
  });

  toolRegistry.register({
    name: "task.update",
    description: "Update an existing task. Only provided fields are changed. Accepts string status labels or numeric codes.",
    inputSchema: updateTaskSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    handler: createUpdateTaskHandler(client),
  });

  toolRegistry.register({
    name: "task.delete",
    description: "Delete a task by ID.",
    inputSchema: deleteTaskSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    handler: createDeleteTaskHandler(client),
  });

  toolRegistry.register({
    name: "task.assign",
    description: "Assign one or more users to a task. POST to /tasks/{id}/assign.",
    inputSchema: assignTaskSchema,
    requiredPageKey: "tasks",
    accessLevel: "WRITE",
    handler: createAssignTaskHandler(client),
  });

  toolRegistry.freeze();
}