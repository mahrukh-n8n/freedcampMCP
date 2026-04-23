# Requirements: Freedcamp MCP Server

**Defined:** 2026-04-23
**Core Value:** Give LLM clients natural, type-safe access to Freedcamp data without burning context on raw API responses.

## v1 Requirements

### Authentication & Core

- [ ] **AUTH-01**: Server authenticates every Freedcamp API request with HMAC-SHA1 (hash = HMAC-SHA1(secret, apiKey + timestamp))
- [ ] **AUTH-02**: Server supports STDIO transport (JSON-RPC 2.0) for local CLI use
- [ ] **AUTH-03**: Server validates tool input with Zod schemas before execution
- [ ] **AUTH-04**: All tools return structured McpToolResult envelope (ok/kind/payload/error)
- [ ] **AUTH-05**: All list/get tools accept `fields` parameter to limit output fields and prevent context burn. Supports dot notation for nested fields (e.g., `["id", "comments.created_ts", "comments.user_full_name"]`)
- [ ] **AUTH-06**: Auth credentials configurable via env vars (FREEDCAMP_API_KEY, FREEDCAMP_API_SECRET) or CLI args
- [ ] **AUTH-07**: Health check / connection verification tool that tests API credentials

### Tasks

- [ ] **TASK-01**: list_tasks with filters (project_id, task_group_id, milestone_id, assigned_to_id[], status[], created_by_id[], search, due_date[from|to], created_date[from|to], f_with_archived, f_include_tags, f_cf)
- [ ] **TASK-02**: get_task by ID (returns full metadata including comments, files, tags detail)
- [ ] **TASK-03**: create_task (fields: title*, project_id*, task_group_id, description, priority, assigned_to_id, start_date, due_date, r_rule, attached_ids, h_parent_id, cf_tpl_id, custom_fields[])
- [ ] **TASK-04**: update_task by ID (same fields as create_task)
- [ ] **TASK-05**: delete_task by ID
- [ ] **TASK-06**: All task list tools include `f_include_tags=1` by default (not applicable to /tasks/{id})
- [ ] **TASK-07**: get_task includes `f_include_tr_data=1` by default to retrieve tag detail (id, title, owner_id, usages_count)
- [ ] **TASK-08**: Status mapping: accept "not started", "in progress", "completed" AND numeric codes 0, 1, 2
- [ ] **TASK-09**: Sort support: order by priority or due_date (asc/desc)
- [ ] **TASK-10**: Task URL included in all task list/get outputs (for user navigation)
- [ ] **TASK-11**: All task tools support output field limiting via `fields` parameter with dot notation

### Projects

- [ ] **PROJ-01**: list_projects with optional filter (f_recent_projects_ids=1)
- [ ] **PROJ-02**: get_project by ID or project name (with optional f_for_overview_app=1)
- [ ] **PROJ-03**: create_project (fields: project_name*, project_description, project_color, todo_view_type, group_id/group_name, f_first, changed_users)
- [ ] **PROJ-04**: update_project by ID (same fields as create_project)
- [ ] **PROJ-05**: All project tools support output field limiting via `fields` parameter

### Users

- [ ] **USER-01**: list_users (with optional project_id filter)
- [ ] **USER-02**: get_user by ID or name (email may be null due to privacy)
- [ ] **USER-03**: get_current_user
- [ ] **USER-04**: create_user (fields: email*, password*, first_name*, last_name, oauth_provider, oauth_access_token)
- [ ] **USER-05**: update_current_user (fields: first_name*, email, password, confirmation_password, last_name, timezone)
- [ ] **USER-06**: All user tools support output field limiting via `fields` parameter

### Comments

- [ ] **COMM-01**: add_comment (fields: item_id*, app_id*, description*, attached_ids[])
- [ ] **COMM-02**: update_comment by ID (fields: description*)
- [ ] **COMM-03**: delete_comment by ID
- [ ] **COMM-04**: App ID constants mapped to Freedcamp apps (2=Tasks, 3=Milestones, 5=Discussions, 6=Files, 8=Time, 9=Issue Tracker)
- [ ] **COMM-05**: Comments are only accessible via get_task (GET /tasks/{id}) — no standalone comment list endpoint

### Name Resolution

- [ ] **RESL-01**: Hybrid name/ID resolution — tools accept names (project_name, user_name, status_name) or IDs; names auto-resolve via API lookup
- [ ] **RESL-02**: Project name resolution (name → project_id)
- [ ] **RESL-03**: User name resolution (name/fpartial match → user_id)
- [ ] **RESL-04**: Status name resolution (name → status code)

### API Client

- [ ] **API-01**: HTTP client with proper HMAC-SHA1 auth on every request (api_key, timestamp, hash as query params)
- [ ] **API-02**: Multi-value parameter encoding with [] suffix (status[]=0&status[]=2, assigned_to_id[]=123) — even for single values in array-capable fields
- [ ] **API-03**: GET requests put params in URL query string; POST requests put auth in query string and body params as JSON
- [ ] **API-04**: Proper error handling and structured error responses
- [ ] **API-05**: Pagination support (limit, offset) with meta (has_more, total_count) on all list endpoints
- [ ] **API-06**: Sort support via order[field]=asc|desc parameter encoding

## v2 Requirements

### Caching

- **CACH-01**: Resolution caching for repeated name lookups within a session

### Extended Endpoints

- **MILE-01**: Milestone tools (list, create, update)
- **DISC-01**: Discussion tools (list, create, update)
- **FILE-01**: File tools (list, upload)
- **TIME-01**: Time tracking tools (list, create)
- **ISSU-01**: Issue tracker tools (list, create, update)

### HTTP Transport

- **HTTP-01**: HTTP transport for remote/web clients (following accountant pattern)
- **HTTP-02**: JWT session management for HTTP transport
- **HTTP-03**: Rate limiting for HTTP transport

## Out of Scope

| Feature | Reason |
|---------|--------|
| LLM calls inside the server | The MCP client (Claude, etc.) handles reasoning; server provides tools |
| Chained post-processing in server | LLM client chains calls naturally; server doesn't need to replicate this |
| OAuth authentication | Freedcamp uses API key auth; no OAuth flow |
| Database/persistence layer | Standalone server, no DB needed for v1 |
| Next.js hosting | Standalone process, not a web app |
| Approval/permission gates | Not needed for v1 — API key provides access control |
| Audit logging | v2 concern; stderr logging sufficient for v1 |
| Rate limiting (STDIO) | Freedcamp's own limits sufficient for single-user CLI |
| DELETE /users/{id} | Freedcamp doesn't support it — uses POST /wipe/current instead |
| DELETE /projects/{id} | Not publicly supported by Freedcamp API |

## n8n Parity Verification

| n8n Capability | MCP Requirement | Covered |
|---------------|----------------|---------|
| HMAC-SHA1 auth | AUTH-01 | Yes |
| GET/POST routing | API-03 | Yes |
| Multi-value param [] encoding | API-02 | Yes |
| required_outputs field filtering | AUTH-05 | Yes |
| Dot notation nested fields | AUTH-05 | Yes |
| /users list | USER-01 | Yes |
| /users/current | USER-03 | Yes |
| /users/{id} | USER-02 | Yes |
| /users POST (create) | USER-04 | Yes |
| /users/current POST (update) | USER-05 | Yes |
| /projects list | PROJ-01 | Yes |
| /projects/{id} | PROJ-02 | Yes |
| /projects POST (create) | PROJ-03 | Yes |
| /projects/{id} POST (update) | PROJ-04 | Yes |
| /tasks list with all filters | TASK-01 | Yes |
| /tasks/{id} | TASK-02 | Yes |
| /tasks POST (create) | TASK-03 | Yes |
| /tasks/{id} POST (update) | TASK-04 | Yes |
| /tasks/{id} DELETE | TASK-05 | Yes |
| f_include_tags=1 | TASK-06 | Yes |
| f_include_tr_data=1 | TASK-07 | Yes |
| Status code mapping | TASK-08 | Yes |
| Sort support | TASK-09 | Yes |
| Task URL in output | TASK-10 | Yes |
| /comments POST (add) | COMM-01 | Yes |
| /comments/{id} POST (update) | COMM-02 | Yes |
| /comments/{id} DELETE | COMM-03 | Yes |
| App ID constants | COMM-04 | Yes |
| Name→ID resolution | RESL-01–04 | Yes |
| Pagination (limit/offset/meta) | API-05 | Yes |
| Custom fields support | TASK-03/04 | Yes |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AUTH-06 | Phase 1 | Pending |
| AUTH-07 | Phase 1 | Pending |
| API-01 | Phase 1 | Pending |
| API-02 | Phase 1 | Pending |
| API-03 | Phase 1 | Pending |
| API-04 | Phase 1 | Pending |
| API-05 | Phase 1 | Pending |
| API-06 | Phase 1 | Pending |
| TASK-01 | Phase 2 | Pending |
| TASK-02 | Phase 2 | Pending |
| TASK-03 | Phase 2 | Pending |
| TASK-04 | Phase 2 | Pending |
| TASK-05 | Phase 2 | Pending |
| TASK-06 | Phase 2 | Pending |
| TASK-07 | Phase 2 | Pending |
| TASK-08 | Phase 2 | Pending |
| TASK-09 | Phase 2 | Pending |
| TASK-10 | Phase 2 | Pending |
| TASK-11 | Phase 2 | Pending |
| PROJ-01 | Phase 2 | Pending |
| PROJ-02 | Phase 2 | Pending |
| PROJ-03 | Phase 2 | Pending |
| PROJ-04 | Phase 2 | Pending |
| PROJ-05 | Phase 2 | Pending |
| USER-01 | Phase 3 | Pending |
| USER-02 | Phase 3 | Pending |
| USER-03 | Phase 3 | Pending |
| USER-04 | Phase 3 | Pending |
| USER-05 | Phase 3 | Pending |
| USER-06 | Phase 3 | Pending |
| COMM-01 | Phase 3 | Pending |
| COMM-02 | Phase 3 | Pending |
| COMM-03 | Phase 3 | Pending |
| COMM-04 | Phase 3 | Pending |
| COMM-05 | Phase 3 | Pending |
| RESL-01 | Phase 4 | Pending |
| RESL-02 | Phase 4 | Pending |
| RESL-03 | Phase 4 | Pending |
| RESL-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 44 total
- Mapped to phases: 44
- Unmapped: 0
- n8n parity: 100% — all capabilities covered

---
*Requirements defined: 2026-04-23*
*Last updated: 2026-04-23 after n8n parity verification*