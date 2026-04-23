# Freedcamp MCP Server — Claude Instructions

## Project Overview
TypeScript MCP server wrapping the Freedcamp REST API. Stdio transport only. Node 18+.

## Commands
- `npx tsc --noEmit` — type check
- `npx vitest run` — run tests
- `npx vitest` — watch mode
- `npm start` — run server

## Architecture
- `src/modules/mcp/` — portable MCP framework (no app imports)
- `src/lib/freedcamp/` — Freedcamp-specific code
- `scripts/mcp-server.ts` — entry point

## Key Patterns
- Tool handlers use `FreedcampApiClient.request()` — never raw fetch
- All responses go through `dataResult()` / `errorResult()`
- Tool names follow `{domain}.{action}` convention
- Zod schemas define input types
- `toolRegistry.register()` + `toolRegistry.freeze()` pattern
- Name resolution: `resolveProjectId()`, `resolveUserId()`, `resolveStatus()`
- TTL cache for name→ID lookups (`ResolutionCache`)

## Status Codes
- 0 = not started, 1 = in progress, 2 = completed
- Both numeric and string labels accepted in task tools

## App IDs (for comments)
- tasks=2, milestones=3, discussions=5, files=6, time=8, issue_tracker=9