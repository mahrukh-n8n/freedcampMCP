# Project Research Summary

**Project:** Freedcamp MCP Server
**Domain:** MCP Server — REST API wrapper (standalone TypeScript)
**Researched:** 2026-04-23
**Confidence:** MEDIUM-HIGH

## Executive Summary

The Freedcamp MCP Server is a standalone TypeScript process that exposes Freedcamp's task, project, user, and comment APIs as semantic MCP tools, replacing a 3-agent n8n pipeline with a direct integration any LLM client can use. Experts build these servers by separating a portable MCP core (stdio transport, tool registry, dispatch loop) from app-specific wiring (Freedcamp auth, API client, tool definitions), following the accountant reference implementation pattern. The core value is output field limiting -- without it, Freedcamp's verbose responses burn agent context in a single call. The recommended approach is: ship STDIO-only, use HMAC-SHA1 auth computed in-process, build semantic tools per entity (not one generic API wrapper), and make name-to-ID resolution a first-class feature so LLMs can pass project names and user names directly.

The key risks are HMAC auth miscalculation (100% failure if wrong), unfiltered responses (context burn), and multi-value param formatting (wrong silently). All three are addressable in Phase 1 with proper API client implementation. A major gap: no public Freedcamp developer docs exist, so all Freedcamp-specific claims come from the existing n8n source code and need validation against a real API key.

## Key Findings

### Recommended Stack

The stack is fully specified and verified against the accountant reference and MCP SDK docs. TypeScript 5.x with Node.js 22.x LTS. The MCP SDK is pinned at v1.29.0 (v2 is pre-alpha as of Q1 2026). Zod is v4.3.6 (implements Standard Schema interface natively). tsx@4.21.0 runs the subprocess without a build step. The portable `src/modules/mcp/` layer is copied verbatim from the accountant -- it never imports app code, enforced by ESLint. Freedcamp has no database, so `TDb` is constrained to `void`. HMAC-SHA1 uses Node's built-in `crypto` module, not an external library.

**Core technologies:**
- **TypeScript 5.x**: Language -- required for MCP SDK; strict mode catches dispatch loop bugs
- **Node.js 22.x LTS**: Runtime -- required for STDIO subprocess; 20.x minimum
- **`@modelcontextprotocol/sdk@1.29.0`**: MCP transport + tool registration -- official SDK, v1.x is production stable
- **Zod@4.3.6**: Input validation -- used by SDK's Standard Schema interface; shared across MCP handlers and server actions
- **tsx@4.21.0**: Script runner -- subprocess entry without build step; 5-10x faster cold start than ts-node
- **`src/modules/mcp/` (from accountant)**: Portable MCP layer -- stdio transport, tool registry, dispatch loop, serialize helpers; copied verbatim

### Expected Features

**Must have (table stakes -- P1, ship or fail):**
- HMAC-SHA1 auth (computed in-process, not client-side) -- no auth = no data
- STDIO transport -- required for MCP protocol and Claude Desktop
- Zod input schemas on every tool -- LLM uses schema to construct valid calls
- `McpToolResult` envelope with kind discrimination (`data`/`selection`/`preview`/`commit`/`error`)
- `list_tasks` with filters (project, assignee, status, date range, search) -- primary use case
- `get_task` with embedded comments -- comments only available via task GET, not standalone
- `create_task` / `update_task` -- write operations; without these it's read-only
- `list_projects` / `get_project`, `list_users` / `get_current_user` -- prerequisite for resolution
- `add_comment` / `update_comment` / `delete_comment` -- task collaboration
- Output field limiting (`required_outputs`) on all list/get tools -- this is the #1 value prop
- Hybrid name/ID resolution -- LLM passes names, server resolves to IDs
- Multi-value param encoding with `[]` suffix -- `status[]=0&status[]=2`
- Structured error codes -- `PERMISSION_DENIED`, `VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`, `CONFLICT`

**Should have (P2, add after core validated):**
- Tag parsing from `description_processed` using `f_include_tags=1`
- User/project TTL cache (60s default) -- reduces repeated list calls
- Retry with exponential backoff for 429 and transient errors
- Tool suggestions (`next` field in envelope) -- guides LLM chaining
- Status code bidirectional mapping -- accept "completed" or 1

**Defer (v2+):**
- HTTP transport -- adds complexity without v1 value; STDIO is sufficient
- Milestones, Files, Discussions, Time Tracking, Issue Tracker endpoints
- Chained server-side pre-computation (n8n evaluator pattern)
- Webhook support (requires HTTP transport)

### Architecture Approach

The architecture is a two-layer standalone: a portable MCP core (copied from accountant) on top of a thin Freedcamp-specific app layer. The portable layer (`src/modules/mcp/`) handles stdio transport, tool registry, dispatch loop, and result serialization -- it has zero knowledge of Freedcamp. The app layer (`src/lib/freedcamp/`) contains HMAC auth, API client, tool definitions per entity, name resolver, and response filter. The key rule: `src/modules/mcp/` must never import from `src/lib/freedcamp/`, enforced by ESLint `no-restricted-imports`.

**Major components:**
1. **`src/main.ts`** -- Subprocess entry: loads env vars, HMAC-validates API key, registers tools, starts stdio transport
2. **`src/modules/mcp/` (portable)** -- ToolRegistry, `createMcpServer()` dispatch loop, stdio transport, serialize helpers; copied verbatim from accountant
3. **`src/lib/freedcamp/auth/hmac-validator.ts`** -- Validates `FREEDCAMP_API_KEY` at boot via Freedcamp endpoint
4. **`src/lib/freedcamp/api-client.ts`** -- Typed HTTP client; handles HMAC signing, multi-value param encoding, GET/POST param placement, retry/backoff
5. **`src/lib/freedcamp/tools/{domain}.ts`** -- Tool families per entity (projects, tasks, events, files, discussions)
6. **`src/lib/freedcamp/utils/name-resolver.ts`** -- Resolves project names, user names, status strings to IDs; uses Zod field annotations
7. **`src/lib/freedcamp/utils/response-filter.ts`** -- Strips response fields using per-tool allowlist

### Critical Pitfalls

1. **Context window burn from unfiltered responses** -- Every tool MUST support field limiting. Default to minimal fields. Never return raw API responses. This is the #1 reason the project exists.

2. **HMAC-SHA1 auth miscalculation** -- `hash = HMAC-SHA1(secret, apiKey + timestamp)` where timestamp is Unix seconds (integer). Hash is hex. Auth params go in query string for both GET and POST. Wrong = 100% failure.

3. **Multi-value parameter formatting** -- Array params MUST use `[]` suffix: `status[]=0&status[]=2`. Even single values. `project_id` does NOT use brackets. Wrong formatting returns wrong results silently.

4. **Tags not being a first-class field** -- Tags are embedded in `description_processed` as `#tag_name`. Must pass `f_include_tags=1` on task queries. Tag filtering requires post-retrieval processing, not an API parameter.

5. **Comments only via GET /tasks/{id}** -- There is NO standalone comment list endpoint. To get comments, call GET /tasks/{id}. `add_comment` is a separate POST endpoint.

## Implications for Roadmap

Based on research, the architecture has a strict build order: portable module first, then API client, then tools. Feature dependencies cluster naturally into three phases.

### Phase 1: Foundation
**Rationale:** Cannot build tools without stdio transport and API client. Auth must work before any API call. API client must handle GET/POST param placement and HMAC signing correctly before tool handlers exist.

**Delivers:** Working stdio subprocess with HMAC-authenticated Freedcamp API client. List projects and list users as first tools.

**Implements:** `src/modules/mcp/` (copied and verified), `hmac-validator.ts`, `api-client.ts` with correct param encoding, basic project/user tools.

**Avoids:** P2 (HMAC miscalculation) -- verified against a real Freedcamp key; P3 (multi-value formatting) -- built into api-client URL encoding; P9 (POST vs GET param placement) -- handled in client.

### Phase 2: Core Tool Suite
**Rationale:** Tasks are the primary use case. Tasks depend on name resolver (for project/assignee resolution) and response filter (for field limiting). Comments depend on task GET. Status mapping depends on resolver. Tag support requires `f_include_tags=1` default.

**Delivers:** Full task tools (list with filters, get with comments, create, update, assign), comment tools, project/user tools with full filtering, name resolver, response filter, status code mapping.

**Implements:** `tools/tasks.ts`, `tools/comments.ts`, `utils/name-resolver.ts`, `utils/response-filter.ts`.

**Avoids:** P1 (context burn) -- all tools enforce field limiting; P4 (tags) -- `f_include_tags=1` is default; P5 (comments) -- only via task GET; P6 (status mismatch) -- bidirectional mapping in resolver; P7 (forgotten f_include_tags) -- default in task queries.

### Phase 3: Polish and Advanced Features
**Rationale:** v1 is feature-complete for core use cases. This phase adds features that improve LLM ergonomics but aren't blocking: tool suggestions, retry with backoff, user/project cache, forward reference resolution in create, tag parsing as structured field.

**Delivers:** v1.0 release candidate with all P2 features.

**Uses:** TTL cache module, retry configuration, `next` field in result envelopes.

### Phase Ordering Rationale

- **Phase 1 first:** Transport and auth are prerequisites. No tools without these.
- **Phase 2 before Phase 3:** Core tools (tasks, comments) are the primary value. Polish features are additive.
- **Projects + Users before Tasks in Phase 1:** Name resolution depends on having project/user list cached. Build the resolution source before the dependent tools.
- **API client is the bottleneck:** The HMAC signing, GET/POST param placement, and multi-value encoding all live in the API client. Bugs here corrupt every tool. Verify with a real Freedcamp key before building tools.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** `GET /api_key/check` endpoint URL -- needs verification from n8n source or real API test. Also GET vs POST param placement for this specific endpoint.
- **Phase 2:** Tag parsing regex from `description_processed` -- confirmed pattern exists in n8n but exact extraction logic needs verification.
- **Phase 2:** `add_comment` POST endpoint URL and body format -- confirmed from n8n but not independently verified.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Portable `src/modules/mcp/` layer -- fully documented in accountant reference, no ambiguity.
- **Phase 1:** stdio transport -- hand-rolled, well-understood, no Freedcamp-specific logic.
- **Phase 2:** Tool registry and dispatch loop -- follow accountant pattern exactly.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified: MCP SDK v1.29.0 on npm, Zod v4.3.6, tsx v4.21.0. Accountant reference provides exact patterns. |
| Features | MEDIUM-HIGH | MCP feature patterns (HIGH confidence) are well-documented. Freedcamp-specific behaviors (MEDIUM confidence) come from n8n source -- no public docs exist. |
| Architecture | HIGH | Two-layer portable pattern fully documented in accountant. Build order is explicit. ESLint boundary enforcement clear. |
| Pitfalls | MEDIUM | HMAC calculation, multi-value encoding, and POST/GET placement are correct from n8n source. Comments-via-task-GET confirmed. Tag embedding pattern confirmed. Freedcamp API behavior confidence limited by no public docs. |

**Overall confidence:** MEDIUM-HIGH

The MCP architecture is well-understood and the accountant reference removes most ambiguity. Freedcamp API specifics are inferred from n8n workflows, not public documentation. The critical risks (auth, field limiting, param encoding) are all addressable by Phase 1 implementation and testing with a real Freedcamp API key.

### Gaps to Address

- **Freedcamp API endpoint URLs:** No public docs. `GET /api_key/check`, comment POST endpoint, and exact field names need verification from n8n source or live API test. During Phase 1, test the API client against the real Freedcamp API before building tool handlers.
- **Tag parsing implementation:** `f_include_tags=1` behavior and `description_processed` format confirmed qualitatively from n8n but exact tag extraction regex needs to be extracted from n8n evaluator code.
- **Status code exact values:** 0=Not Started, 1=Completed, 2=In Progress confirmed from project context. Validate these map correctly by testing against a real Freedcamp instance.
- **Pagination behavior:** Freedcamp's default limit of 200 is noted but `offset`/`limit` param names should be verified during API client implementation.

## Sources

### Primary (HIGH confidence)
- [`@modelcontextprotocol/sdk` npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) -- v1.29.0 verified; v2 pre-alpha warning
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk) -- v1.x production stable, v2 pre-alpha
- [Accountant `src/modules/mcp/`](file:///home/mahrukh/coding/accountant/src/modules/mcp/) -- portable module, stdio transport, registry, dispatcher pattern; PRIMARY reference
- [Accountant `src/lib/mcp/`](file:///home/mahrukh/coding/accountant/src/lib/mcp/) -- app-bridge implementation pattern

### Secondary (MEDIUM confidence)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/docs) -- official spec, stdio transport architecture
- [Claude MCP documentation](https://docs.anthropic.com/en/docs/claude-desktop/mcp-servers) -- official TypeScript server guidance
- [n8n workflow source (existing)](file:///home/mahrukh/coding/freedcampMCP/.planning/n8n-workflow-reference/) -- HMAC signing, param formatting, field filtering; Freedcamp API behavior inferred from here

### Tertiary (LOW confidence)
- Freedcamp API endpoint URLs -- not publicly documented; verified from n8n source only
- Tag parsing exact behavior -- confirmed `f_include_tags=1` pattern exists; extraction regex needs n8n code extraction
- Pagination param names -- `offset`/`limit` assumed from general REST convention; needs verification

---
*Research completed: 2026-04-23*
*Ready for roadmap: yes*
