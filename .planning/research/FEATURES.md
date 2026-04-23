# Feature Research

**Domain:** MCP Server — Freedcamp REST API wrapper
**Researched:** 2026-04-23
**Confidence:** HIGH
**Note:** No public Freedcamp developer docs exist; analysis is based on the existing n8n workflow patterns, the accountant MCP reference implementation, and general MCP server architecture principles. Claims about Freedcamp-specific behavior are verified against the n8n source; claims about MCP server patterns are verified against the accountant reference.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must be present or the MCP server fails its basic purpose.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **HMAC-SHA1 auth** | Freedcamp requires it on every request; no auth = no data | LOW | `hash = HMAC-SHA1(secret, apiKey + timestamp)`. Auth computation must be in the server, not the client. |
| **STDIO transport** | MCP protocol requires it; without it, Claude Desktop and stdio clients can't connect | LOW | Standard MCP stdio transport — no HTTP for v1 |
| **Zod input schemas** | MCP best practice; the LLM uses schema to construct valid calls | LOW | Every tool's inputSchema must be a Zod schema. Must match the same schema used by any server-side handler. |
| **Result envelope (McpToolResult)** | Structured, discriminated results let the LLM branch on kind (data/selection/preview/commit/error) | LOW | Follow accountant pattern: `{ ok, kind, payload?, error?, errorCode?, blockers?, warnings?, next? }` |
| **`list_tasks` with filters** | Primary Freedcamp use case; without filtering, you get everything and burn context | MEDIUM | Filters: `project_id`, `assigned_to_id[]`, `status[]`, `date_from`, `date_to`, `search`. Multi-value params need `[]` suffix. |
| **`get_task` with comments** | Comments are only available via `GET /tasks/{id}`, not standalone | MEDIUM | Must call task GET with embedded comment expansion; no separate comment endpoint |
| **`list_projects` / `get_project`** | Project listing and selection is prerequisite for task operations | LOW | Freedcamp has projects as the top-level container |
| **`list_users` / `get_current_user`** | User resolution and context are prerequisite for assignee filtering | LOW | `get_current_user` is a dedicated endpoint; no auth token decode needed |
| **`create_task` / `update_task`** | Write operations; no write tools = read-only wrapper | MEDIUM | `update_task` needs diff handling (only send changed fields) |
| `add_comment` / `update_comment` / `delete_comment` | Task collaboration is a core Freedcamp workflow | MEDIUM | Comment-only operations; no standalone comment GET |
| **Output field limiting** | Critical — Freedcamp returns massive payloads; without `required_outputs` / `fields[]`, agent context burns in one call | MEDIUM | Every list/get tool must support field limiting. This is the #1 differentiator. |
| **Structured error codes** | The LLM needs to branch on error type (NOT_FOUND vs VALIDATION_ERROR vs PERMISSION_DENIED) | LOW | Error codes from the accountant MCP: `PERMISSION_DENIED`, `VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`, `CONFLICT`, `WRITE_DISABLED`, `INVALID_STATE` |
| **Name → ID resolution** | LLMs produce names, not IDs; without resolution, every call fails silently | MEDIUM | Resolve: project names → project_ids, user names → user_ids, status labels → status codes (0/1/2) |

### Differentiators (Competitive Advantage)

Features that set the Freedcamp MCP server apart from a generic API wrapper.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Hybrid name/ID resolution** | LLM can pass `project: "Marketing"` or `project_id: 42` — server resolves whatever is given | MEDIUM | Auto-detect whether input is name or ID. Check ID validity before name resolution. Cache resolved IDs to reduce repeated resolution. |
| **Tag parsing support** | Tags are buried in `description_processed`; without parsing, they're invisible | MEDIUM | Freedcamp embeds tags in description, requires `f_include_tags=1`. The MCP server should expose parsed tags as a structured field. |
| **Comment pre-filtering** | Only `GET /tasks/{id}` exposes comments; chained tool calls for date filtering are expensive | MEDIUM | Provide a `get_task_with_comments(since_date)` pattern that auto-fetches and pre-filters comments server-side. Reduces LLM round-trips. |
| **Forward references in create** | When creating a task, user refers to a project by name; resolution must happen before POST | HIGH | `create_task` must resolve project name → ID before POSTing. Same for `assigned_to` → user ID. |
| **Smart default fields** | The LLM shouldn't have to specify 15 fields for every list call | LOW | Default to `required_outputs` that return `{ id, title, status, assigned_to_name, due_date }`; allow override |
| **Status code mapping** | Freedcamp uses numeric codes (0/1/2); LLMs produce "completed" / "in progress" | MEDIUM | Bidirectional mapping: 0="Not Started", 1="Completed", 2="In Progress". Accept both numeric and string status in filters. |
| **User/project cache** | `list_users` and `list_projects` are called repeatedly for resolution | MEDIUM | In-process TTL cache (60s default). Configurable via `FREEDCAMP_CACHE_TTL_MS`. Reduces auth overhead and latency. |
| **Retry with backoff** | Freedcamp API may return 429 or transient errors | MEDIUM | Configurable retry: 3 attempts, exponential backoff (500ms base). Respect `Retry-After` headers. |
| **Multi-value param encoding** | `assigned_to_id[]=1&assigned_to_id[]=2` — easy to get wrong | LOW | Server-side encoding; LLM passes array, server formats as `[]` params. |
| **Tool suggestion (`next` field)** | Help the LLM chain the next logical call | LOW | In result envelope, include `next: [{ tool, description, args }]` for multi-step workflows (e.g., after create_task, suggest add_comment) |
| **Typed error messages** | Error messages should guide the LLM toward correction | LOW | Not just "validation error" but "status must be 0, 1, or 2 — received 'done'". Include the tool name, the field, and the valid range. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem logical but create problems or aren't needed for this product.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| **HTTP transport (HTTP + STDIO dual)** | "Make it work in web apps too" | Adds complexity, auth surface, and deployment overhead. For v1, STDIO-only is the right scope. | Build STDIO first; add HTTP transport in v2 if needed, following the accountant's dual-transport pattern. |
| **OAuth authentication** | "Match modern auth patterns" | Freedcamp uses API key + HMAC-SHA1 — there is no OAuth. Adding OAuth would be building a feature for a platform that doesn't support it. | Stick to API key auth; document the HMAC-SHA1 flow clearly. |
| **Web UI or Next.js hosting** | "Make it deployable as a service" | The entire value prop is "drop in a stdio process". A web service re-introduces the n8n complexity we're replacing. | Standalone Node.js process. Run as Claude Desktop subprocess or local CLI. |
| **All Freedcamp endpoints in v1** | "Milestones, Discussions, Files, Time Tracking, etc." | Milestones, Files, Discussions, Issue Tracker, Time Tracking are all v2. Building them in v1 bloats scope and delays shipping. | Ship v1 with Tasks, Projects, Users, Comments only. |
| **LLM-generated tool descriptions at runtime** | "Dynamic descriptions based on context" | The MCP protocol tool handler has no LLM. Adding LLM calls inside the server violates the no-LLM-inside-server constraint. | Static Zod-documented descriptions. Improve descriptions during design reviews, not at runtime. |
| **Rate limiting at server level** | "Protect Freedcamp API from overuse" | Freedcamp has its own rate limits. Server-level rate limiting adds complexity and is redundant. The LLM client controls call frequency. | Remove rate limiting; rely on Freedcamp's limits and client-side backoff. |
| **Real-time / webhook support** | "Get notified when Freedcamp changes" | Webhooks require HTTP transport and a receiving endpoint. This is fundamentally at odds with STDIO-only. | Skip for v1. LLM clients poll via list_tasks with date filters for freshness. |
| **Session state between calls** | "Remember last project for subsequent tasks" | MCP tools are stateless by design. Maintaining session state would break the stateless contract and create hard-to-debug issues. | LLM client maintains context. Each tool call is self-contained. |
| **Write-through caching** | "Cache writes for faster subsequent reads" | Caching writes introduces staleness risk. The server has no way to know if Freedcamp processed the write before the next read. | Read-through cache only (for `list_users`, `list_projects`). No write caching. |

---

## Feature Dependencies

```
Output field limiting
       └──requires──> Structured response envelope
                            └──requires──> Result kind discrimination (data/selection/preview/commit)

Name → ID resolution
       └──requires──> list_users + list_projects (cached)
                            └──requires──> HMAC-SHA1 auth

Tag parsing
       └──requires──> Output field limiting (must request f_include_tags=1)
                            └──requires──> Freedcamp API param knowledge

Comment pre-filtering
       └──requires──> get_task with comment expansion
                            └──requires──> Task GET endpoint coverage

Forward reference resolution (create_task)
       └──requires──> Name → ID resolution
                            └──requires──> list_users + list_projects cache

Tool suggestions (next field)
       └──enhances──> All tools (reduces LLM round-trips)

Status code mapping
       └──enhances──> list_tasks filters (accepts strings AND numeric codes)
       └──conflicts──> Direct numeric status passing (ambiguous: user meant name or ID?)
```

### Dependency Notes

- **Output field limiting requires structured responses:** A flat JSON array doesn't support field projection. Every tool must return a structured payload that can be sliced before serialization.
- **Name → ID resolution requires a cache:** Without caching, every create_task triggers two additional list calls, doubling or tripling the auth overhead.
- **Tag parsing requires the `f_include_tags=1` param:** This is a Freedcamp-specific quirk. The MCP server must know to pass this param when tags are requested, and to parse the resulting `description_processed` for `#tag` patterns.
- **Comment pre-filtering conflicts with stateless design:** The `get_task_with_comments(since)` helper is a convenience wrapper, not a fundamental feature. It should be a separate tool, not baked into `get_task`.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] **HMAC-SHA1 auth** — Required for any API call
- [ ] **STDIO transport** — Required for MCP protocol
- [ ] **McpToolResult envelope** — Structured results with kind discrimination
- [ ] **`list_tasks` with filters** — Primary use case (project, assignee, status, date, search)
- [ ] **`get_task` with comments** — Single task + embedded comment expansion
- [ ] **`create_task` / `update_task`** — Write operations
- [ ] **`list_projects` / `get_project`** — Project context
- [ ] **`list_users` / `get_current_user`** — User context + resolution source
- [ ] **`add_comment` / `update_comment` / `delete_comment`** — Comment operations
- [ ] **Output field limiting** — `required_outputs` on all list/get tools
- [ ] **Hybrid name/ID resolution** — Auto-resolve project names, user names, status strings
- [ ] **Multi-value param encoding** — `[]` suffix formatting
- [ ] **Structured error codes** — Discriminated error responses

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **Tag parsing** — Expose structured tags from `description_processed`
- [ ] **User/project cache** — TTL cache to reduce repeated list calls
- [ ] **Retry with backoff** — Handle 429 and transient Freedcamp errors
- [ ] **Tool suggestions (`next` field)** — Help LLM chain calls

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **HTTP transport** — Web app integration, webhook endpoints
- [ ] **Milestones endpoint** — Freedcamp milestones API
- [ ] **Files endpoint** — File attachments on tasks/comments
- [ ] **Discussions endpoint** — Forum-style discussions
- [ ] **Time tracking** — Freedcamp time tracking integration
- [ ] **Issue Tracker** — Freedcamp's issue tracker entity
- [ ] **Chained pre-computation** — Server-side filtering beyond what the LLM can do client-side

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| HMAC-SHA1 auth | HIGH | LOW | **P1** |
| STDIO transport | HIGH | LOW | **P1** |
| McpToolResult envelope | HIGH | LOW | **P1** |
| list_tasks with filters | HIGH | MEDIUM | **P1** |
| get_task with comments | HIGH | MEDIUM | **P1** |
| create_task / update_task | HIGH | MEDIUM | **P1** |
| Output field limiting | HIGH | MEDIUM | **P1** |
| Name → ID resolution | HIGH | MEDIUM | **P1** |
| Structured error codes | HIGH | LOW | **P1** |
| list_projects / get_project | HIGH | LOW | **P1** |
| list_users / get_current_user | HIGH | LOW | **P1** |
| add/update/delete comment | MEDIUM | MEDIUM | **P1** |
| Multi-value param encoding | MEDIUM | LOW | **P1** |
| Tag parsing | MEDIUM | MEDIUM | **P2** |
| User/project cache | MEDIUM | MEDIUM | **P2** |
| Retry with backoff | MEDIUM | MEDIUM | **P2** |
| Tool suggestions (next) | MEDIUM | LOW | **P2** |
| Status code mapping | MEDIUM | MEDIUM | **P2** |
| HTTP transport | LOW | HIGH | **P3** |
| All Freedcamp endpoints (v2) | LOW | HIGH | **P3** |

**Priority key:**
- **P1:** Must have for launch — missing any of these and the MCP server doesn't serve its core purpose
- **P2:** Should have, add after v1 core is validated — improves DX and reduces round-trips
- **P3:** Nice to have, future consideration — adds complexity without validating the core value prop

---

## Competitor Feature Analysis

There are no direct competitor MCP servers for Freedcamp (this is a greenfield integration). Analysis is based on general MCP server patterns for REST APIs.

| Feature | Generic REST MCP | Existing n8n Workflow | Freedcamp MCP (proposed) |
|---------|-----------------|---------------------|-------------------------|
| Auth | API key passthrough | HMAC-SHA1 computed in auth workflow | HMAC-SHA1 in server |
| Transport | HTTP + STDIO | HTTP (n8n) | STDIO only (v1) |
| Output limiting | Rare | `fields[]` param used | `required_outputs` on every tool |
| Name → ID resolution | None | In evaluator agent | Auto-resolve in server |
| Tag support | None | Tags in description via f_include_tags=1 | Structured tag field |
| Comment access | Standalone endpoint | Chained GET | Via get_task only |
| Error codes | Generic HTTP errors | Structured via evaluator | Discriminated error codes |
| Multi-value params | Rare | `param[]` encoding | Auto-handled |
| Tool suggestions | None | None | `next` field in envelope |
| Caching | None | None | TTL cache for users/projects |

**Key insight:** The existing n8n workflows have all the intelligence (HMAC signing, param formatting, field filtering, name resolution, status mapping). The MCP server takes that intelligence and moves it into a portable, zero-dependency process. The differentiator is that this server does the n8n work without n8n.

---

## Sources

- **Freedcamp API behavior:** Observed from existing n8n workflow patterns. No public Freedcamp developer documentation exists (verified 2026-04-23).
- **MCP server patterns:** [Model Context Protocol documentation](https://modelcontextprotocol.io/) (official MCP spec).
- **Reference implementation:** `/home/mahrukh/coding/accountant/src/modules/mcp/` — portable MCP module with STDIO transport, tool registry, Zod schemas, and result envelopes.
- **MCP TypeScript servers:** [Claude MCP documentation](https://docs.anthropic.com/en/docs/claude-desktop/mcp-servers) — official guidance on TypeScript MCP server implementation.
- **Confidence note:** No independent verification of Freedcamp API behavior was possible due to absence of public docs. All Freedcamp-specific claims are based on the existing n8n source code. Treat Freedcamp API behavior as MEDIUM confidence; MCP architecture patterns as HIGH confidence.

---
*Feature research for: Freedcamp MCP Server*
*Researched: 2026-04-23*
*Confidence: MEDIUM (Freedcamp specifics) / HIGH (MCP architecture)*