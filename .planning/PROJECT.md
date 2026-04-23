# Freedcamp MCP Server

## What This Is

A standalone TypeScript MCP (Model Context Protocol) server that exposes Freedcamp's task, project, user, and comment APIs as semantic tools. It replaces an existing n8n workflow setup (3-agent pipeline + auth/IO handler) with a direct MCP integration that any LLM client can use. The server handles HMAC-SHA1 authentication, parameter formatting, output field limiting, and intelligent name-to-ID resolution — letting the LLM focus on intent rather than API mechanics.

## Core Value

Give LLM clients natural, type-safe access to Freedcamp data without burning context on raw API responses. Output field limiting is the critical differentiator — without it, Freedcamp returns massive payloads that overwhelm agent context windows.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Freedcamp API authentication (HMAC-SHA1: api_key + timestamp → hash)
- [ ] STDIO transport for local CLI use (Claude Desktop, etc.)
- [ ] Semantic MCP tools for core Freedcamp entities:
  - [ ] `list_tasks` — with filters (project, assignee, status, date ranges, tags)
  - [ ] `get_task` — single task with full metadata including comments
  - [ ] `create_task` / `update_task`
  - [ ] `list_projects` / `get_project`
  - [ ] `create_project`
  - [ ] `list_users` / `get_user` / `get_current_user`
  - [ ] `add_comment` / `update_comment` / `delete_comment`
- [ ] `search_tasks` — full-text search across tasks
- [ ] Output field limiting on all list/get tools (required_outputs pattern) to prevent context burn
- [ ] Hybrid name-to-ID resolution (auto-resolve when name given, accept IDs directly)
- [ ] Proper multi-value parameter formatting (`status[]`, `assigned_to_id[]`)
- [ ] Tag support via `f_include_tags=1` parameter
- [ ] Error handling with structured error envelopes
- [ ] Portable module architecture (following accountant project pattern: `modules/mcp/` is zero-app-import)

### Out of Scope

- HTTP transport — STDIO only for v1 (can add later following accountant pattern)
- Next.js hosting — standalone process only
- Milestones, Discussions, Files, Time Tracking, Issue Tracker endpoints — v2
- OAuth or session-based auth — API key only (matches Freedcamp's API model)
- Chained post-processing (the n8n evaluator's filtering logic) — the LLM client will handle this naturally by calling tools sequentially
- Rate limiting — Freedcamp's own limits are sufficient for MCP use

## Context

- **Reference implementation**: `/home/mahrukh/coding/accountant` contains a portable MCP module (`src/modules/mcp/`) with STDIO+HTTP transport, tool registry, dispatch loop, Zod schemas, and result envelopes. The Freedcamp server reuses this architectural pattern but as a standalone process.
- **Existing n8n workflows**: Two workflows handle auth/IO and AI-driven request orchestration. The auth workflow computes HMAC-SHA1 signatures, routes GET/POST, formats URL params, and filters response fields. The AI workflow parses natural language → structured intent → dependency resolution → API execution with chained processing.
- **Key Freedcamp API details**:
  - Base URL: `https://freedcamp.com/api/v1`
  - Auth: HMAC-SHA1 where `hash = HMAC-SHA1(secret, apiKey + timestamp)`
  - Query params: `api_key`, `timestamp`, `hash` on every request
  - Multi-value params use `[]` suffix: `status[]=0&status[]=2`
  - Tags aren't a separate endpoint — embedded in `description`/`description_processed`, requires `f_include_tags=1`
  - Comments only available via `GET /tasks/{id}` (no standalone comment list endpoint)
  - Task status codes: 0=Not Started, 1=Completed, 2=In Progress

## Constraints

- **Tech stack**: TypeScript, Node.js, Zod for validation — matching the accountant MCP module pattern
- **Transport**: STDIO only (no HTTP) — simpler standalone deployment
- **API key auth only** — Freedcamp uses API key + secret, not OAuth
- **No LLM calls inside the server** — the LLM client (Claude, etc.) does the reasoning; the server provides tools
- **Context conservation** — every tool MUST support output field limiting to keep responses small

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Semantic tools over generic API tool | Better discoverability, type safety, and LLM affordances | — Pending |
| Hybrid name/ID resolution | LLM can pass natural names OR IDs — fewest round-trips while staying flexible | — Pending |
| Output field limiting on all tools | Freedcamp returns huge payloads; without limiting, agent context burns fast | — Pending |
| STDIO only for v1 | Simpler deploy, no HTTP/auth complexity needed yet | — Pending |
| Standalone process (not Next.js) | No web framework dependency, runs as CLI subprocess | — Pending |
| No chained processing in server | The LLM client naturally chains calls (e.g., get tasks → filter by comment dates) | — Pending |

---
*Last updated: 2026-04-23 after initialization*