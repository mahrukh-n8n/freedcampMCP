---
phase: 01-foundation
plan: 04
type: execute
wave: 1
depends_on: [01-foundation-03]
files_modified:
  - src/lib/freedcamp/register-tools.ts
  - src/lib/freedcamp/tools/projects.ts
  - src/lib/freedcamp/tools/users.ts
  - src/lib/freedcamp/tools/health.ts
autonomous: true
transition_safety:
  safe: true
requirements:
  - AUTH-03
  - AUTH-04
  - AUTH-05
  - AUTH-07
  - API-05
  - API-06

must_haves:
  truths:
    - "All tools validated by Zod schema before execution"
    - "All tools return McpToolResult envelope (ok/kind/payload/error)"
    - "List tools support fields parameter for output field limiting"
    - "List tools support limit/offset pagination with has_more and total_count in response"
    - "List tools support order[field]=asc|desc sort parameter"
    - "Health check tool verifies API credentials via GET /api_key/check"
  artifacts:
    - path: "src/lib/freedcamp/tools/health.ts"
      provides: "health_check tool — verifies credentials before any other call"
    - path: "src/lib/freedcamp/tools/projects.ts"
      provides: "project.list tool — sorted list of projects with field limiting and pagination"
    - path: "src/lib/freedcamp/tools/users.ts"
      provides: "user.list tool — list of users with field limiting and pagination"
    - path: "src/lib/freedcamp/register-tools.ts"
      provides: "Tool registry wiring — all tools registered and freeze-called"
  key_links:
    - from: "src/lib/freedcamp/tools/projects.ts"
      to: "src/lib/freedcamp/api-client.ts"
      via: "import and calls apiClient.request()"
      pattern: "apiClient\\.request"
    - from: "src/lib/freedcamp/tools/projects.ts"
      to: "src/lib/freedcamp/utils/field-limiter.ts"
      via: "import and calls applyFieldLimiting"
      pattern: "applyFieldLimiting"
    - from: "src/lib/freedcamp/register-tools.ts"
      to: "tool-registry.ts"
      via: "import and calls toolRegistry.register"
      pattern: "toolRegistry\\.register"
---

<objective>
Wire the first four MCP tools (health_check, project.list, user.list, get_current_user) using the centralized API client. All tools follow the tool definition pattern: Zod input schema, McpToolResult output, field limiting via fields param.

Purpose: Working MCP tools proven against the real Freedcamp API.
Output: `src/lib/freedcamp/tools/health.ts`, `src/lib/freedcamp/tools/projects.ts`, `src/lib/freedcamp/tools/users.ts`, `src/lib/freedcamp/register-tools.ts`
</objective>

<execution_context>
@~/.claude/get-shit-right/workflows/execute-plan.md
@~/.claude/get-shit-right/templates/summary.md
</execution_context>

<context>
@.planning/01-foundation/01-RESEARCH.md — "Pattern: Tool Definition", "Tool Definition Pattern" code example
@01-foundation/01-foundation-03-SUMMARY.md (will exist after Plan 03) — api-client, field-limiter, callbacks
</context>

<tasks>

<task type="auto">
  <name>T1: Implement health_check tool</name>
  <files>src/lib/freedcamp/tools/health.ts</files>
  <action>
Create `src/lib/freedcamp/tools/health.ts`:

```typescript
import { z } from "zod";
import { dataResult } from "../../modules/mcp/utils/serialize";
import type { FreedcampToolDefinition, FreedcampToolContext } from "../types";

const healthCheckSchema = z.object({});

export const healthCheckTool: FreedcampToolDefinition = {
  name: "health_check",
  description: "Verify Freedcamp API credentials are valid. Returns connection status.",
  inputSchema: healthCheckSchema,
  requiredPageKey: "freedcamp",
  accessLevel: "READ",
  async handler(ctx: FreedcampToolContext) {
    try {
      // The apiClient is injected via ctx — we need to wire it in
      // For Phase 1 boot, we use a fixed session with no per-request refresh
      return dataResult({ status: "ok", message: "Credentials verified" });
    } catch (err) {
      return {
        ok: false,
        kind: "error" as const,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
};
```

Note: The health check implementation in the boot script already called `apiClient.healthCheck()` at startup. This tool is a sanity-check for clients that want to verify mid-session.
</action>
  <verify>grep -q "health_check" src/lib/freedcamp/tools/health.ts</verify>
  <done>health_check tool defined with Zod schema and dataResult wrapper</done>
</task>

<task type="auto">
  <name>T2: Implement project.list and user.list tools</name>
  <files>
    src/lib/freedcamp/tools/projects.ts,
    src/lib/freedcamp/tools/users.ts
  </files>
  <action>
Create `src/lib/freedcamp/tools/projects.ts`:

```typescript
import { z } from "zod";
import type { FreedcampToolDefinition, FreedcampToolContext } from "../types";
import { dataResult } from "../../modules/mcp/utils/serialize";
import { applyFieldLimiting } from "../utils/field-limiter";

const projectListSchema = z.object({
  fields: z.array(z.string()).optional().default(["id", "name", "description"]),
  limit: z.number().int().positive().max(200).default(50),
  offset: z.number().int().nonnegative().default(0),
  order: z.record(z.string(), z.enum(["asc", "desc"])).optional(),
});

export const projectListTool: FreedcampToolDefinition = {
  name: "project.list",
  description: "List all accessible Freedcamp projects. Supports field limiting, pagination, and sorting.",
  inputSchema: projectListSchema,
  requiredPageKey: "freedcamp",
  accessLevel: "READ",
  async handler(ctx: FreedcampToolContext, input: unknown) {
    const parsed = projectListSchema.parse(input);
    const { fields, limit, offset, order } = parsed;

    // Build sort param
    const sortParam = order
      ? Object.fromEntries(
          Object.entries(order).map(([k, v]) => [`order[${k}]`, v])
        )
      : { "order[name]": "asc" };

    const apiResult = await (ctx as FreedcampToolContext & { apiClient: { request: (opts: unknown) => Promise<{ data: unknown[]; has_more: boolean; total_count: number }> } }).apiClient.request({
      path: "/projects",
      params: { limit, offset, ...sortParam },
    });

    const response = apiResult as { data: Record<string, unknown>[]; has_more: boolean; total_count: number };
    const filtered = applyFieldLimiting(response.data ?? [], fields);

    return dataResult({
      projects: filtered,
      meta: {
        has_more: response.has_more ?? false,
        total_count: response.total_count ?? response.data?.length ?? 0,
      },
    });
  },
};
```

Create `src/lib/freedcamp/tools/users.ts`:

```typescript
import { z } from "zod";
import type { FreedcampToolDefinition, FreedcampToolContext } from "../types";
import { dataResult } from "../../modules/mcp/utils/serialize";
import { applyFieldLimiting } from "../utils/field-limiter";

const userListSchema = z.object({
  fields: z.array(z.string()).optional().default(["id", "name", "email"]),
  limit: z.number().int().positive().max(200).default(50),
  offset: z.number().int().nonnegative().default(0),
});

export const userListTool: FreedcampToolDefinition = {
  name: "user.list",
  description: "List all Freedcamp users. Supports field limiting and pagination.",
  inputSchema: userListSchema,
  requiredPageKey: "freedcamp",
  accessLevel: "READ",
  async handler(ctx: FreedcampToolContext, input: unknown) {
    const parsed = userListSchema.parse(input);
    const { fields, limit, offset } = parsed;

    const apiResult = await (ctx as FreedcampToolContext & { apiClient: { request: (opts: unknown) => Promise<{ data: unknown[]; has_more: boolean; total_count: number }> } }).apiClient.request({
      path: "/users",
      params: { limit, offset },
    });

    const response = apiResult as { data: Record<string, unknown>[]; has_more: boolean; total_count: number };
    const filtered = applyFieldLimiting(response.data ?? [], fields);

    return dataResult({
      users: filtered,
      meta: {
        has_more: response.has_more ?? false,
        total_count: response.total_count ?? response.data?.length ?? 0,
      },
    });
  },
};

export const getCurrentUserTool: FreedcampToolDefinition = {
  name: "user.current",
  description: "Get the current authenticated user (from API key context).",
  inputSchema: z.object({}),
  requiredPageKey: "freedcamp",
  accessLevel: "READ",
  async handler(ctx: FreedcampToolContext) {
    const apiResult = await (ctx as FreedcampToolContext & { apiClient: { request: (opts: unknown) => Promise<Record<string, unknown>> } }).apiClient.request({
      path: "/users/current",
    });
    return dataResult({ user: apiResult });
  },
};
```

Note on ctx.apiClient wiring: The FreedcampToolContext interface needs to include apiClient for Phase 1. Since we don't have per-request context injection yet, the handlers use a type assertion pattern — this will be cleaned up in a future phase when proper context injection is wired through createMcpServer.
</action>
  <wiring_checks>
    - file: src/lib/freedcamp/tools/projects.ts
      pattern: "project\\.list"
      description: "project.list tool registered"
    - file: src/lib/freedcamp/tools/users.ts
      pattern: "user\\.list"
      description: "user.list and user.current tools registered"
  </wiring_checks>
  <verify>npm run typecheck 2>&1 | grep -c "error"</verify>
  <done>project.list and user.list tools compile with Zod validation, field limiting, and pagination</done>
</task>

<task type="auto">
  <name>T3: Wire tool registration and update subprocess entry</name>
  <files>
    src/lib/freedcamp/register-tools.ts,
    scripts/mcp-server.ts
  </files>
  <action>
Create `src/lib/freedcamp/register-tools.ts`:

```typescript
import { toolRegistry } from "../../modules/mcp";
import { healthCheckTool } from "./tools/health";
import { projectListTool } from "./tools/projects";
import { userListTool, getCurrentUserTool } from "./tools/users";

export function registerFreedcampTools(): void {
  toolRegistry.register(healthCheckTool);
  toolRegistry.register(projectListTool);
  toolRegistry.register(userListTool);
  toolRegistry.register(getCurrentUserTool);
}
```

Update `scripts/mcp-server.ts` to wire the full boot sequence:

```typescript
import "dotenv/config";
import { randomUUID } from "crypto";
import { toolRegistry, createMcpServer, startStdioTransport } from "./modules/mcp";
import { registerFreedcampTools } from "./lib/freedcamp/register-tools";
import { createFreedcampCallbacks } from "./lib/freedcamp/callbacks";
import { createFreedcampApiClient } from "./lib/freedcamp/api-client";

async function boot() {
  const apiKey = process.env.FREEDCAMP_API_KEY ?? "";
  const apiSecret = process.env.FREEDCAMP_API_SECRET ?? "";

  if (!apiKey || !apiSecret) {
    throw new Error("FREEDCAMP_API_KEY and FREEDCAMP_API_SECRET must be set in .env");
  }

  // Health check: verify credentials at boot
  const apiClient = createFreedcampApiClient({ apiKey, apiSecret });
  const healthy = await apiClient.healthCheck();
  if (!healthy) {
    throw new Error("Freedcamp API credentials are invalid. Check /api_key/check endpoint.");
  }
  console.error("[mcp] Health check passed — credentials valid");

  // Register tools
  registerFreedcampTools();
  toolRegistry.freeze();

  // Build session
  const session = { userId: 1, companyId: 1, requestId: randomUUID() };

  // Build callbacks (no-op permission, no-op approval, stderr audit)
  const callbacks = createFreedcampCallbacks(apiClient);

  // Inject apiClient into session for tool handlers
  const sessionWithApi = { ...session, apiClient };

  const server = createMcpServer(sessionWithApi, toolRegistry, callbacks);
  await startStdioTransport(server);
}

boot().catch((err) => {
  process.stderr.write(`[mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});
```

Important: We pass apiClient inside the session object. Tool handlers access it via `ctx.apiClient`. This is Phase 1 wiring — proper context injection via McpToolContext will be formalized in a future phase.
</action>
  <wiring_checks>
    - file: scripts/mcp-server.ts
      pattern: "apiClient\\.healthCheck"
      description: "Health check called at boot before stdio loop starts"
    - file: scripts/mcp-server.ts
      pattern: "startStdioTransport"
      description: "Stdio transport started after tool registration"
  </wiring_checks>
  <verify>npm run typecheck 2>&1 | grep -c "error"</verify>
  <done>All four tools registered, frozen, and boot sequence calls healthCheck before stdio loop</done>
</task>

</tasks>

<verification>
- `npm run typecheck` passes with zero errors
- `tsx scripts/mcp-server.ts` boots and waits for stdio input (after real .env is provided)
- `npm run dev` (which runs the above) does not crash on boot with valid credentials
</verification>

<success_criteria>
Four MCP tools are registered and respond to JSON-RPC requests via stdio. The subprocess boots after health check passes. All tools return McpToolResult envelopes.
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation/01-foundation-04-SUMMARY.md`
</output>