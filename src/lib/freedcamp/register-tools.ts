/**
 * Tool registration — wires all tool definitions to the MCP registry.
 *
 * Each tool follows the {domain}.{action} naming convention.
 * Handlers receive a FreedcampApiClient closure (injected at registration time).
 */

import { toolRegistry } from "../../modules/mcp/registry/tool-registry";
import type { FreedcampApiClient } from "./api-client";
import { listProjectsSchema, createListProjectsHandler, getProjectSchema, createGetProjectHandler } from "./tools/projects";
import { listUsersSchema, createListUsersHandler, getUserSchema, createGetUserHandler } from "./tools/users";
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
      // Import handler directly to avoid circular deps
      const { healthCheckHandler } = await import("./tools/health");
      return healthCheckHandler(apiKey, apiSecret, baseUrl);
    },
  });

  // Projects
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
    description: "Get details of a single project by ID. Supports field limiting.",
    inputSchema: getProjectSchema,
    requiredPageKey: "projects",
    accessLevel: "READ",
    handler: createGetProjectHandler(client),
  });

  // Users
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

  toolRegistry.freeze();
}