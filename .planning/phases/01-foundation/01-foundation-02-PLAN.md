---
phase: 01-foundation
plan: 02
type: execute
wave: 1
depends_on: [01-foundation-01]
files_modified:
  - src/modules/mcp/index.ts
  - src/modules/mcp/types.ts
  - src/modules/mcp/models/response-types.ts
  - src/modules/mcp/client.ts
  - src/modules/mcp/registry/tool-registry.ts
  - src/modules/mcp/services/create-mcp-server.ts
  - src/modules/mcp/services/stdio-transport.ts
  - src/modules/mcp/utils/serialize.ts
  - src/modules/mcp/utils/paginate.ts
  - src/lib/freedcamp/types.ts
autonomous: true
transition_safety:
  safe: true
requirements:
  - AUTH-02
  - AUTH-03
  - AUTH-04

must_haves:
  truths:
    - "Portable MCP module is copied verbatim from accountant reference"
    - "Freedcamp-constrained types replace generic TDb"
    - "Module boundary rule enforced: src/modules/mcp never imports from src/lib/"
  artifacts:
    - path: "src/modules/mcp/index.ts"
      provides: "Public exports of portable module (toolRegistry, createMcpServer, startStdioTransport)"
    - path: "src/modules/mcp/types.ts"
      provides: "McpToolContext, McpToolDefinition, McpToolResult types"
    - path: "src/lib/freedcamp/types.ts"
      provides: "Constrained aliases (TDb = void, FreedcampToolContext, FreedcampToolDefinition)"
  key_links:
    - from: "src/lib/freedcamp/types.ts"
      to: "src/modules/mcp/types.ts"
      via: "import and constrain TDb = void"
      pattern: "import.*from.*modules/mcp"
---

<objective>
Copy the portable MCP module from the accountant reference and adapt it for the Freedcamp server. The module is copied verbatim — only the type aliases are re-constrained for the API-key-only context (TDb = void, no Prisma).

Purpose: Production-proven portable module as the backbone of the stdio server.
Output: `src/modules/mcp/` directory with all portable files + `src/lib/freedcamp/types.ts`
</objective>

<execution_context>
@~/.claude/get-shit-right/workflows/execute-plan.md
@~/.claude/get-shit-right/templates/summary.md
</execution_context>

<context>
@.planning/01-foundation/01-RESEARCH.md — "portable module boundary", "DI callbacks collapsed", TDb = unknown pattern
@/home/mahrukh/coding/accountant/src/modules/mcp/ — source files (copy verbatim)
</context>

<tasks>

<task type="auto">
  <name>T1: Copy portable MCP module verbatim from accountant</name>
  <files>
    src/modules/mcp/index.ts,
    src/modules/mcp/types.ts,
    src/modules/mcp/models/response-types.ts,
    src/modules/mcp/client.ts,
    src/modules/mcp/registry/tool-registry.ts,
    src/modules/mcp/services/create-mcp-server.ts,
    src/modules/mcp/services/stdio-transport.ts,
    src/modules/mcp/utils/serialize.ts,
    src/modules/mcp/utils/paginate.ts
  </files>
  <action>
Copy ALL files from `/home/mahrukh/coding/accountant/src/modules/mcp/` into `src/modules/mcp/`.

Files to copy:
- index.ts
- types.ts
- models/response-types.ts
- client.ts
- registry/tool-registry.ts
- services/create-mcp-server.ts
- services/stdio-transport.ts
- utils/serialize.ts
- utils/paginate.ts

DO NOT modify any file content during copy. The portable module is copied verbatim.

After copying, verify each file exists with the same content by reading a few lines from each.
</action>
  <verify>find src/modules/mcp -type f | sort | xargs wc -l</verify>
  <done>All 9 files exist in src/modules/mcp/ with identical content to accountant reference</done>
</task>

<task type="auto">
  <name>T2: Create Freedcamp-constrained type aliases</name>
  <files>src/lib/freedcamp/types.ts</files>
  <action>
Create `src/lib/freedcamp/types.ts` that re-constrains the portable module's generic types:

```typescript
import type {
  McpToolDefinition as _McpToolDefinition,
  McpToolContext as _McpToolContext,
  McpToolResult as _McpToolResult,
  McpServerCallbacks as _McpServerCallbacks,
  McpSessionContext,
} from "../../modules/mcp/types";

// ── TDb = void (no database client) ─────────────────────────────────────────

/** No database — all data comes from Freedcamp REST API. */
export type TDb = void;

/** Freedcamp tool context. No db client — apiClient is the data access layer. */
export interface FreedcampToolContext {
  userId: number;
  companyId: number;
  requestId: string;
  signal?: AbortSignal;
}

// Re-export for convenience in tool registration
export type FreedcampToolDefinition = _McpToolDefinition<void>;
export type FreedcampToolResult = _McpToolResult;
export type FreedcampSessionContext = McpSessionContext;
```

The portable module's `TDb` was `unknown` by default. Here we constrain it to `void` since there's no DB client. All tool definitions reference `void` as their TDb type.
</action>
  <verify>grep -l "TDb.*void" src/lib/freedcamp/types.ts</verify>
  <done>Freedcamp-constrained types export TDb = void; FreedcampToolContext, FreedcampToolDefinition, FreedcampToolResult aliased</done>
</task>

<task type="auto">
  <name>T3: Verify module boundary rule — no app imports in portable layer</name>
  <files>tsconfig.json</files>
  <action>
Add an ESLint rule to tsconfig.json to prevent the portable module from importing app code. Add to tsconfig.json's `compilerOptions`:

```json
"paths": {
  "@modules/mcp": ["./src/modules/mcp"]
},
"noImplicitAny": true
```

Also create `src/modules/mcp/.eslintrc.json` (or add to project ESLint config) with a path-based restriction. For Phase 1 simplicity, add a comment at the top of each portable file:

```typescript
/**
 * PORTABLE LAYER — no imports from src/lib/freedcamp/ or any app code.
 * This module is framework-agnostic and must stay that way.
 */
```

Verify with: `grep -r "lib/freedcamp" src/modules/mcp/ | grep -v "^Binary"` — should return nothing.
</action>
  <wiring_checks>
    - file: src/modules/mcp/index.ts
      pattern: "PORTABLE LAYER"
      description: "Module boundary comment present"
  </wiring_checks>
  <verify>grep -r "lib/freedcamp" src/modules/mcp/ 2>/dev/null | grep -v "^Binary" | wc -l</verify>
  <done>Portable module has no imports from src/lib/freedcamp/; boundary rule documented</done>
</task>

</tasks>

<verification>
- All 9 portable module files exist in src/modules/mcp/ with exact content from accountant
- `src/lib/freedcamp/types.ts` exports TDb = void and constrained aliases
- `grep -r "lib/freedcamp" src/modules/mcp/` returns zero results
- `npm run typecheck` passes (no TS errors in copied portable module)
</verification>

<success_criteria>
Portable MCP module lives at src/modules/mcp/ unchanged from accountant; Freedcamp-specific types constrain TDb = void. Module boundary is documented and no app imports exist in the portable layer.
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation/01-foundation-02-SUMMARY.md`
</output>