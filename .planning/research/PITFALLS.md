# Pitfalls: Freedcamp MCP Server

**Project:** Freedcamp MCP Server
**Date:** 2026-04-23
**Confidence:** MEDIUM (based on n8n workflow patterns and MCP general knowledge)

## Critical Pitfalls

### P1: Context Window Burn from Unfiltered Responses
**Severity:** HIGH — this is the #1 reason the project exists
**Warning signs:** LLM responses become incoherent after a single Freedcamp API call; token usage spikes
**Prevention:** Every tool MUST accept `fields` parameter. Never return full API responses without filtering. Default to minimal fields if not specified.
**Phase:** Must be addressed in Phase 1 (tool schema design), enforced in Phase 2+

### P2: HMAC-SHA1 Auth Miscalculation
**Severity:** HIGH — wrong auth = 100% failure rate
**Warning signs:** 401 responses from Freedcamp API
**Prevention:** `hash = HMAC-SHA1(secret, apiKey + timestamp)` where timestamp is Unix seconds (integer, not milliseconds). Hash is hex-encoded. Every request must include `api_key`, `timestamp`, and `hash` as query params (GET) or query params (POST — not in body).
**Phase:** Address in Phase 1 (API client)

### P3: Multi-Value Parameter Formatting
**Severity:** HIGH — incorrect formatting returns wrong results silently
**Warning signs:** Filters like `status=0,2` return unexpected results; `assigned_to_id=123` only returns partial matches
**Prevention:** Array params MUST use `[]` suffix: `status[]=0&status[]=2`, `assigned_to_id[]=123`. Even single values in array-capable fields need `[]`. `project_id` does NOT use brackets.
**Phase:** Address in Phase 1 (API client URL encoding)

### P4: Tags Are Not a First-Class Field
**Severity:** MEDIUM — causes confusion in tool design
**Warning signs:** Tools returning `tags` as null; tag filtering not working
**Prevention:** Tags are embedded in `description` text (as `#tag_name`). Must pass `f_include_tags=1` to get parsed tags in `description_processed`. Tag filtering requires post-retrieval processing, not an API parameter.
**Phase:** Address in Phase 2 (task tools)

### P5: Comments Only Available via GET /tasks/{id}
**Severity:** MEDIUM — shapes entire comment tool design
**Warning signs:** Attempting to call GET /comments endpoint; comment tools returning 404
**Prevention:** There is NO standalone comment list endpoint. To get comments for a task, call GET /tasks/{id}. The `add_comment` POST endpoint exists separately. Design comment tools accordingly.
**Phase:** Address in Phase 2 (tool design)

### P6: Status Code Mismatch Between Names and Numbers
**Severity:** MEDIUM — LLMs say "in progress" but API needs "2"
**Prevention:** Maintain explicit mapping: 0=Not Started, 1=Completed, 2=In Progress. Name-to-ID resolution must handle status names. Tools should accept both names and numeric codes.
**Phase:** Address in Phase 2 (resolution utilities)

### P7: Forgetting f_include_tags=1 on Task Queries
**Severity:** MEDIUM — silent data loss
**Warning signs:** Tag-related features not working; description_processed missing tags
**Prevention:** Always include `f_include_tags=1` in task list/get queries. Make this the default, not opt-in.
**Phase:** Address in Phase 2 (task tools default params)

### P8: MCP SDK Context Protocol Mismatch
**Severity:** MEDIUM — tools that return giant objects break the protocol
**Warning signs:** Tool responses timing out; MCP client disconnects
**Prevention:** Use `McpToolResult` envelope with kind discrimination. Never return raw API responses. Always filter to requested fields. Keep responses under ~10KB per tool call.
**Phase:** Address in Phase 1 (result envelope design)

### P9: POST vs GET Parameter Placement
**Severity:** LOW — but causes confusing bugs
**Warning signs:** POST requests returning 422; query params being ignored
**Prevention:** GET requests put all params (including auth) in URL query string. POST requests put auth params in URL query string BUT body params in JSON body. The API client must handle this difference correctly.
**Phase:** Address in Phase 1 (API client)

### P10: No Pagination Handling
**Severity:** LOW for v1 — but will bite at scale
**Warning signs:** Tool only returns first 200 results; users report missing tasks
**Prevention:** Freedcamp default limit is 200. Add `limit` and `offset` parameters to list tools. Document the default limit behavior.
**Phase:** Address in Phase 2+ (pagination params on list tools)

## Anti-Patterns to Avoid

1. **Don't embed LLM calls in the server** — The n8n workflows use LLM agents for query parsing and dependency resolution. In an MCP server, the LLM *client* does this naturally. The server provides tools; the client reasons.

2. **Don't skip output field limiting** — This is the core value. Without it, the server is just a proxy that burns context.

3. **Don't use a generic single-tool API wrapper** — Semantic tools (list_tasks, get_project) give the LLM clear affordances. A generic `freedcamp_request` tool forces the LLM to know the API spec by heart.

4. **Don't add HTTP transport in v1** — It adds auth, session, and rate-limit complexity without v1 value. STDIO is sufficient for Claude Desktop and similar clients.

5. **Don't implement chained processing in the server** — The n8n evaluator-executor does post-retrieval filtering. In MCP, the LLM calls tools sequentially and filters itself. This is more flexible and the LLM can explain its reasoning.