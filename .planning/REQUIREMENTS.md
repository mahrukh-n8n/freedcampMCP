# Requirements: Freedcamp MCP Server

**Defined:** 2026-04-23
**Core Value:** Give LLM clients natural, type-safe access to Freedcamp data without burning context on raw API responses.

## v1 Requirements

### Authentication & Core

- [ ] **AUTH-01**: Server authenticates every Freedcamp API request with HMAC-SHA1 (hash = HMAC-SHA1(secret, apiKey + timestamp))
- [ ] **AUTH-02**: Server supports STDIO transport (JSON-RPC 2.0) for local CLI use
- [ ] **AUTH-03**: Server validates tool input with Zod schemas before execution
- [ ] **AUTH-04**: All tools return structured McpToolResult envelope (ok/kind/payload/error)
- [ ] **AUTH-05**: All list/get tools accept `fields` parameter to limit output fields and prevent context burn
- [ ] **AUTH-06**: Auth credentials configurable via env vars (FREEDCAMP_API_KEY, FREEDCAMP_API_SECRET) or CLI args
- [ ] **AUTH-07**: Health check / connection verification tool that tests API credentials

### Tasks

- [ ] **TASK-01**: list_tasks with filters (project, assignee, status by name or ID, date ranges, search text)
- [ ] **TASK-02**: get_task by ID (returns full metadata including comments and files)
- [ ] **TASK-03**: create_task with required and optional fields
- [ ] **TASK-04**: update_task (status, title, description, assignee, due date, priority)
- [ ] **TASK-05**: All task tools include `f_include_tags=1` by default
- [ ] **TASK-06**: Status mapping: accept "not started", "in progress", "completed" AND numeric codes 0, 1, 2
- [ ] **TASK-07**: Tag parsing from description_processed field
- [ ] **TASK-08**: All task list/get tools support output field limiting via `fields` parameter

### Projects

- [ ] **PROJ-01**: list_projects with optional filtering
- [ ] **PROJ-02**: get_project by ID or project name
- [ ] **PROJ-03**: create_project with required fields (name, description, etc.)
- [ ] **PROJ-04**: All project tools support output field limiting via `fields` parameter

### Users

- [ ] **USER-01**: list_users (with optional project_id filter)
- [ ] **USER-02**: get_user by ID or name
- [ ] **USER-03**: get_current_user
- [ ] **USER-04**: All user tools support output field limiting via `fields` parameter

### Comments

- [ ] **COMM-01**: add_comment with item_id, app_id, and description
- [ ] **COMM-02**: update_comment by ID with new description
- [ ] **COMM-03**: delete_comment by ID
- [ ] **COMM-04**: App ID constants mapped to Freedcamp apps (2=Tasks, 3=Milestones, 5=Discussions, 6=Files, 8=Time, 9=Issue Tracker)

### Name Resolution

- [ ] **RESL-01**: Hybrid name/ID resolution — tools accept names (project_name, user_name) or IDs; names auto-resolve via API lookup
- [ ] **RESL-02**: Project name resolution (name → project_id)
- [ ] **RESL-03**: User name resolution (name → user_id)
- [ ] **RESL-04**: Status name resolution (name → status code)

### API Client

- [ ] **API-01**: HTTP client with proper HMAC-SHA1 auth on every request (api_key, timestamp, hash as query params)
- [ ] **API-02**: Multi-value parameter encoding with [] suffix (status[]=0&status[]=2, assigned_to_id[]=123)
- [ ] **API-03**: GET requests put params in URL query string; POST requests put auth in query string and body params as JSON
- [ ] **API-04**: Proper error handling and structured error responses

## v2 Requirements

### Pagination

- **PAGI-01**: Pagination support (limit/offset) on all list tools with has_more/total_count metadata

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
| TASK-01 | Phase 2 | Pending |
| TASK-02 | Phase 2 | Pending |
| TASK-03 | Phase 2 | Pending |
| TASK-04 | Phase 2 | Pending |
| TASK-05 | Phase 2 | Pending |
| TASK-06 | Phase 2 | Pending |
| TASK-07 | Phase 2 | Pending |
| TASK-08 | Phase 2 | Pending |
| PROJ-01 | Phase 2 | Pending |
| PROJ-02 | Phase 2 | Pending |
| PROJ-03 | Phase 2 | Pending |
| PROJ-04 | Phase 2 | Pending |
| USER-01 | Phase 3 | Pending |
| USER-02 | Phase 3 | Pending |
| USER-03 | Phase 3 | Pending |
| USER-04 | Phase 3 | Pending |
| COMM-01 | Phase 3 | Pending |
| COMM-02 | Phase 3 | Pending |
| COMM-03 | Phase 3 | Pending |
| COMM-04 | Phase 3 | Pending |
| RESL-01 | Phase 4 | Pending |
| RESL-02 | Phase 4 | Pending |
| RESL-03 | Phase 4 | Pending |
| RESL-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-23*
*Last updated: 2026-04-23 after initial definition*