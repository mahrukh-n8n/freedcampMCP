# Freedcamp MCP Server — Project Roadmap

**Project:** Freedcamp MCP Server
**Type:** Greenfield — standalone TypeScript MCP server wrapping Freedcamp's REST API
**Date:** 2026-04-23
**Requirements:** 44 v1 requirements, all phased
**Reference:** Accountant (`/home/mahrukh/coding/accountant/`) — portable `src/modules/mcp/` pattern
**Transport:** STDIO only (v1); no HTTP

---

## Phase 1: Foundation

**Goal:** Working stdio subprocess with HMAC-authenticated API client. List projects and list users as first tools. All 13 foundational requirements delivered.

### Plan 1-1: MCP Module Setup
**Requirements:** AUTH-02, (AUTH-03 via schemas)
**Tasks:**
- [ ] Initialize `package.json`: `@modelcontextprotocol/sdk@1.29.0`, `zod@4.3.6`, `tsx@4.21.0`, TypeScript 5.x, Node 18+
- [ ] Initialize `tsconfig.json` in strict mode; copy accountant's `.eslintrc.json` with `no-restricted-imports` to enforce portable module boundary
- [ ] Copy `src/modules/mcp/` verbatim from accountant reference: registry, services, utils, types, models
- [ ] Verify no imports from `src/lib/freedcamp/` or app code anywhere in `src/modules/mcp/` (ESLint)
- [ ] Create `src/main.ts` subprocess entry: load env vars → validate HMAC → register tools → start stdio transport
- [ ] Create `src/lib/freedcamp/types.ts`: constrain `TDb` to `void` (no database), define `FREEDCAMP_*` env types

### Plan 1-2: HMAC Auth System
**Requirements:** AUTH-01, AUTH-06, AUTH-07 (partial)
**Tasks:**
- [ ] Create `src/lib/freedcamp/auth/hmac.ts`: `computeHmac(secret, apiKey, timestamp)` using Node `crypto` — HMAC-SHA1, hex output, timestamp in Unix seconds (integer)
- [ ] Create `src/lib/freedcamp/auth/hmac-validator.ts`: call `GET /api_key/check` at boot, return `{ userId, apiKey }` or throw `PERMISSION_DENIED`
- [ ] Expose `ping` tool: lightweight API check that returns `{ ok: true, userId }` — the health check / connection verification tool
- [ ] Document HMAC formula in code comment: `hash = HMAC-SHA1(secret, apiKey + timestamp)` where timestamp is Unix seconds

### Plan 1-3: API Client
**Requirements:** AUTH-07 (via ping), API-01, API-02, API-03, API-04, API-05, API-06
**Tasks:**
- [ ] Create `src/lib/freedcamp/api-client.ts`: typed HTTP client wrapping Node `fetch`
- [ ] Implement HMAC signing on every request: `api_key`, `timestamp`, `hash` as query params for both GET and POST
- [ ] Implement multi-value param encoding: `status[]=0&status[]=2`, `assigned_to_id[]=123` — even single values, `project_id` excluded
- [ ] Implement GET/POST param placement: GET uses URL query string; POST uses query string for auth, JSON body for params
- [ ] Implement pagination: `limit`/`offset` params, return `has_more`/`total_count` in response meta
- [ ] Implement sort encoding: `order[field]=asc|desc` via api-client helper
- [ ] Implement structured error handling: `PERMISSION_DENIED`, `NOT_FOUND`, `VALIDATION_ERROR`, `INTERNAL_ERROR`, `CONFLICT`
- [ ] Implement retry with exponential backoff for 429 and 5xx errors (configurable max retries)
- [ ] Verify API client against real Freedcamp API key before Plan 1-4 (critical path blocker)

### Plan 1-4: Core List Tools
**Requirements:** AUTH-03, AUTH-04, AUTH-05, PROJ-01, PROJ-05, USER-01, USER-06
**Tasks:**
- [ ] Create `src/lib/freedcamp/register-tools.ts`: single file that calls `toolRegistry.register()` for all tool families
- [ ] Create `src/lib/freedcamp/tools/projects.ts`: `list_projects` (filter: `f_recent_projects_ids`) and `get_project` (by ID or name, filter: `f_for_overview_app=1`)
- [ ] Create `src/lib/freedcamp/tools/users.ts`: `list_users` (filter: `project_id`) and `get_user` (by ID or name)
- [ ] Write Zod input schemas for each tool; wire to SDK's Standard Schema interface
- [ ] Implement `fields` parameter on all list/get tools with dot notation support (`"comments.created_ts"`)
- [ ] Implement `McpToolResult` envelope (`data`/`selection`/`preview`/`error` kinds) on all tools
- [ ] Implement response filtering: strip all fields not in `fields` allowlist before returning
- [ ] Write unit tests for each tool handler: happy path, validation errors, not-found errors

### Plan 1-5: Integration Test
**Requirements:** AUTH-07 (complete)
**Tasks:**
- [ ] Write integration test suite: boot server, call `list_projects`, `list_users`, `ping` via stdio JSON-RPC
- [ ] Test HMAC auth: verify `PERMISSION_DENIED` on bad API key
- [ ] Test multi-value encoding: pass `status[]=0&status[]=2`, verify correct request shape
- [ ] Test `fields` parameter: verify only requested fields returned; raw response never returned
- [ ] Document `FREEDCAMP_API_KEY`, `FREEDCAMP_API_SECRET`, `FREEDCAMP_USER_ID` in `.env.example`
- [ ] Phase 1 is feature-complete when `list_projects`, `list_users`, and `ping` work end-to-end

**Phase 1 Gate:** API client makes successful authenticated calls to real Freedcamp API. At least `list_projects` and `list_users` return filtered, enveloped results. No raw API responses exposed to MCP client.

---

## Phase 2: Core Task & Project Suite

**Goal:** Full task management tools (list, get, create, update, delete, assign) and complete project tools. 16 requirements delivered.

### Plan 2-1: Task List & Get
**Requirements:** TASK-01, TASK-02, TASK-06, TASK-07, TASK-09, TASK-10, TASK-11
**Tasks:**
- [ ] Create `src/lib/freedcamp/tools/tasks.ts`
- [ ] Implement `list_tasks`: filters for `project_id`, `task_group_id`, `milestone_id`, `assigned_to_id[]`, `status[]`, `created_by_id[]`, `search`, `due_date[from|to]`, `created_date[from|to]`, `f_with_archived`, `f_include_tags=1` (default), `f_cf`; sort by `priority` or `due_date` (asc/desc)
- [ ] Implement `get_task`: by ID, include `f_include_tr_data=1` default to get tag detail (id, title, owner_id, usages_count)
- [ ] Ensure `f_include_tags=1` is default on task list queries (TASK-06 — silent data loss prevention)
- [ ] Implement `task_url` field in all task outputs (TASK-10) — construct from Freedcamp URL pattern `/project/{project_id}/task/{task_id}`
- [ ] Wire `fields` parameter with dot notation on both tools; nested fields supported
- [ ] Comments accessible only via `get_task` (TASK-02) — include in default `fields` if not restricted

### Plan 2-2: Task Write Operations
**Requirements:** TASK-03, TASK-04, TASK-05, TASK-08
**Tasks:**
- [ ] Implement `create_task`: title*, project_id*, task_group_id, description, priority, assigned_to_id, start_date, due_date, r_rule, attached_ids, h_parent_id, cf_tpl_id, custom_fields[]
- [ ] Implement `update_task`: same fields as create_task, PATCH via API
- [ ] Implement `delete_task`: by ID
- [ ] Implement `assign_task`: POST to `/tasks/{id}/assign` with `user_id`
- [ ] Implement status bidirectional mapping (TASK-08): accept `"not started"` / `"in progress"` / `"completed"` AND numeric codes `0` / `1` / `2`; map both directions in input parsing and output normalization
- [ ] Implement sort encoding (TASK-09): `order[priority]=asc` or `order[due_date]=desc` via api-client
- [ ] Write unit tests for each write operation

### Plan 2-3: Extended Project Tools
**Requirements:** PROJ-02, PROJ-03, PROJ-04
**Tasks:**
- [ ] Implement `get_project` by project name (hybrid — accepts ID or name, auto-resolves)
- [ ] Implement `create_project`: project_name*, project_description, project_color, todo_view_type, group_id/group_name, f_first, changed_users
- [ ] Implement `update_project`: same fields as create, PATCH via API
- [ ] Integrate with `name-resolver.ts` (deferred in Phase 1 but planned) — project name → ID resolution

### Plan 2-4: Response Filter & Envelope Polish
**Requirements:** AUTH-04, AUTH-05
**Tasks:**
- [ ] Audit all Phase 1 and Phase 2 tools: verify every list/get tool accepts `fields` parameter
- [ ] Implement `response-filter.ts` as a utility: takes raw API response + per-tool allowlist → filtered object; handles dot notation for nested fields
- [ ] Implement `McpToolResult` with `kind` discrimination on all tools: `data` for list/get, `selection` for single-entity get, `preview` for write confirmations, `error` for failures
- [ ] Implement `next` field in result envelopes (Phase 3 deferred features): include contextual tool suggestions (e.g., "try get_task with id={id}" after list_tasks)
- [ ] Verify no raw Freedcamp API response ever reaches the MCP client

**Phase 2 Gate:** All 16 task and project requirements tested and passing. `list_tasks` with filters, `get_task` with comments, `create_task`, `update_task`, `delete_task` all working end-to-end. Response filtering verified on all tools.

---

## Phase 3: Users & Comments

**Goal:** Full user management tools and comment tools. App ID constants wired up. 10 requirements delivered.

### Plan 3-1: User Management Tools
**Requirements:** USER-01, USER-02, USER-03, USER-04, USER-05, USER-06
**Tasks:**
- [ ] Implement `get_current_user`: `GET /users/current` — returns authenticated user profile
- [ ] Implement `get_user` by ID or name (USER-02): partial name match → resolve to user_id, then fetch
- [ ] Implement `list_users` with optional `project_id` filter (USER-01)
- [ ] Implement `create_user` (USER-04): email*, password*, first_name*, last_name, oauth_provider, oauth_access_token
- [ ] Implement `update_current_user` (USER-05): first_name*, email, password, confirmation_password, last_name, timezone
- [ ] Wire `fields` parameter on all user tools (USER-06)
- [ ] Note: `DELETE /users/{id}` is out of scope per requirements; Freedcamp doesn't support it

### Plan 3-2: Comment Tools
**Requirements:** COMM-01, COMM-02, COMM-03, COMM-04, COMM-05
**Tasks:**
- [ ] Define `APP_IDS` constant map: `tasks=2`, `milestones=3`, `discussions=5`, `files=6`, `time=8`, `issue_tracker=9` (COMM-04)
- [ ] Implement `add_comment`: POST to `/comments`, fields: `item_id*`, `app_id*`, `description*`, `attached_ids[]`
- [ ] Implement `update_comment`: POST to `/comments/{id}`, field: `description*`
- [ ] Implement `delete_comment`: DELETE to `/comments/{id}`
- [ ] Document COMM-05: comments only via `get_task` — no standalone comment list endpoint
- [ ] Write unit tests for comment CRUD; verify app_id constants used correctly

### Plan 3-3: User Auth Utilities
**Tasks:**
- [ ] Create `src/lib/freedcamp/utils/email-utils.ts`: validate email format (used in user creation)
- [ ] Create `src/lib/freedcamp/utils/date-utils.ts`: parse and format Freedcamp date fields (`YYYY-MM-DD HH:MM:SS`)
- [ ] Write integration tests for all user and comment tools

**Phase 3 Gate:** User tools and comment tools tested and passing. `get_current_user`, `list_users`, `add_comment`, `update_comment`, `delete_comment` all working end-to-end.

---

## Phase 4: Name Resolution

**Goal:** Make all tools accept names instead of IDs. LLM passes "Project Alpha" not `project_id=123`. 4 requirements delivered.

### Plan 4-1: Name Resolver Core
**Requirements:** RESL-01, RESL-02, RESL-03, RESL-04
**Tasks:**
- [ ] Create `src/lib/freedcamp/utils/name-resolver.ts`: central resolution utility
- [ ] Implement project name → `project_id` resolution (RESL-02): query `list_projects`, match `project_name` → return first match (exact or partial)
- [ ] Implement user name → `user_id` resolution (RESL-03): query `list_users`, match `user_name` or `user_email` → return first match
- [ ] Implement status name → status code resolution (RESL-04): `{"not started": 0, "in progress": 2, "completed": 1}` — bidirectional
- [ ] Implement hybrid input handling (RESL-01): if input is numeric string → parse as ID; if alphabetic → resolve via name lookup
- [ ] Wire resolver into tool registry's permission/check phase: all tool args with `_id` fields auto-checked for name input
- [ ] Add Zod field annotation convention: `z.string().meta({ resolveTo: 'project' })` for clear resolver registration
- [ ] Write integration tests: pass project name string, verify correct ID resolved and used in API call

### Plan 4-2: Resolution Caching
**Requirements:** CACH-01 (v2)
**Tasks:**
- [ ] Create `src/lib/freedcamp/utils/resolution-cache.ts`: TTL-based in-memory cache (default 60s) for project/user name → ID lookups
- [ ] Cache key: `type:id` (e.g., `project:123`, `user:456`); cache both directions (name→ID and ID→name)
- [ ] Integrate cache into `name-resolver.ts`; add cache bypass option for fresh resolution
- [ ] Add `CACHE_TTL_MS` env var (default: 60000)

**Phase 4 Gate:** Name resolution working on all tools. `list_tasks project="Project Alpha"` resolves to `project_id=123` internally. Cache hit rate measurable in logs.

---

## Phase 5: Polish & Release

**Goal:** Production hardening, documentation, release candidate. All 44 v1 requirements complete.

### Plan 5-1: Error Handling & Resilience
**Tasks:**
- [ ] Audit all tool handlers: verify consistent `McpToolResult.error` shape for all error cases
- [ ] Implement graceful shutdown: drain in-flight requests before exiting, handle `SIGTERM`
- [ ] Implement verbose mode: `LOG_LEVEL=debug` env var dumps raw API responses (off by default)
- [ ] Write comprehensive error message guide in README: what each error code means and how to fix it

### Plan 5-2: Performance & Scale
**Tasks:**
- [ ] Implement connection reuse: keep alive HTTP agent with pool size based on `MAX_CONCURRENT_REQUESTS` env var
- [ ] Implement request timeout: `REQUEST_TIMEOUT_MS` env var (default: 30000)
- [ ] Profile boot time: tsx startup should be <500ms; if not, investigate lazy imports
- [ ] Run load test: 100 sequential tool calls, measure latency and memory

### Plan 5-3: Documentation & Release
**Tasks:**
- [ ] Write `README.md`: installation, env vars, tool list with schema, error codes, troubleshooting
- [ ] Write `DEVELOPER.md`: how to add a new tool, how to extend the name resolver, testing strategy
- [ ] Write `CLAUDE.md` or `instructions/system-prompt.md` for agent self-discovery
- [ ] Verify all 44 v1 requirements are implemented and tested
- [ ] Tag `v1.0.0-rc.1`; publish to npm (or distribute as tarball)
- [ ] Submit to Claude Desktop MCP server registry if applicable

**Phase 5 Gate:** All 44 v1 requirements implemented, tested, and documented. `v1.0.0` release candidate tagged.

---

## Summary

| Phase | Focus | Requirements | Plans | Gate |
|-------|-------|-------------|-------|------|
| 1 | Foundation: MCP module, HMAC auth, API client, core list tools | 13 | 5 | API client verified against real Freedcamp API |
| 2 | Core tools: task list/get/create/update/delete/assign + project CRUD | 16 | 4 | Full task suite end-to-end |
| 3 | Users & comments | 10 | 3 | User and comment tools end-to-end |
| 4 | Name resolution | 4 | 2 | LLM can pass names, not IDs |
| 5 | Polish, hardening, release | 1 | 3 | All 44 requirements tested, v1.0.0-rc tagged |
| **Total** | | **44** | **17** | |

### Phase Dependency Graph

```
Phase 1 (all)
    │
    ├── Plan 1-1 → Plan 1-2 → Plan 1-3 → Plan 1-4 → Plan 1-5
    │                    ↓
    │              Phase 1 Gate (API client works)
    │
Phase 2 (requires Phase 1)
    │
    ├── Plan 2-1 → Plan 2-2 → Plan 2-3 → Plan 2-4
    │                    ↓
    │              Phase 2 Gate (tasks + projects)
    │
Phase 3 (requires Phase 2)
    │
    ├── Plan 3-1 → Plan 3-2 → Plan 3-3
    │                    ↓
    │              Phase 3 Gate (users + comments)
    │
Phase 4 (requires Phase 3)
    │
    ├── Plan 4-1 → Plan 4-2
    │                    ↓
    │              Phase 4 Gate (name resolution works)
    │
Phase 5 (requires Phase 4)
    │
    └── Plan 5-1 → Plan 5-2 → Plan 5-3
                               ↓
                         v1.0.0 Release
```

### Out of Scope (v2+)

| Feature | Phase | Reason |
|---------|-------|--------|
| HTTP transport | v2 | STDIO sufficient for v1; adds auth/session complexity |
| JWT session management | v2 | Only needed for HTTP transport |
| Rate limiting (HTTP) | v2 | Only for HTTP transport |
| Milestones | v2 | Deferred from v1 |
| Discussions | v2 | Deferred from v1 |
| File upload/list | v2 | Deferred from v1 |
| Time tracking | v2 | Deferred from v1 |
| Issue tracker | v2 | Deferred from v1 |
| Audit logging | v2 | stderr logging sufficient for v1 |

---

*Roadmap created: 2026-04-23*
*Ready for implementation: yes, starting with Phase 1 Plan 1-1*
