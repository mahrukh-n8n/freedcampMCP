# Stack Research

**Domain:** MCP Server — REST API wrapper with HMAC-SHA1 auth, STDIO transport, semantic tools
**Researched:** 2026-04-23
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | 5.x (latest) | Language | Required for MCP SDK; strict mode catches dispatch loop bugs |
| Node.js | 22.x LTS | Runtime | Required for STDIO subprocess; 20.x minimum |
| `@modelcontextprotocol/sdk` | **1.29.0** | MCP transport + tool registration | Official SDK; v1.x is stable (v2 is pre-alpha as of Q1 2026); provides `McpServer`, `StdioServerTransport`, Zod-compatible schema validation |
| Zod | **4.3.6** | Input validation schemas | Used by MCP SDK's Standard Schema interface; used by accountant reference for tool definitions; single source of truth for both server actions and MCP handlers |
| `tsx` | **4.21.0** | Script runner | Runs the stdio subprocess entry (`scripts/mcp-server.ts`) without a separate build step; also used for dev/testing |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dotenv` | 17.x | Environment variable loading | Always — subprocess reads `MCP_API_KEY`, `FREEDCAMP_API_KEY`, etc. from `.env` at boot |
| Node.js `crypto` | built-in | HMAC-SHA1 signing | Always — Freedcamp auth requires HMAC-SHA1 signature of request body with API secret; use `crypto.createHmac("sha1", secret)` |
| Node.js `fetch` | built-in (Node 18+) | REST API calls | Always — makes HTTP requests to Freedcamp API endpoint; no external HTTP client needed |
| `zod-to-json-schema` | 3.x | Zod → JSON Schema | Optional — MCP SDK v1.29.0 handles Zod schemas natively via Standard Schema interface; only needed if building custom JSON Schema conversion |
| `decimal.js` | 10.x | Safe decimal math | Only if your tools do arithmetic on financial amounts (balances, totals, FX); Freedcamp amounts may be raw floats — avoid floating-point arithmetic |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest | Testing | `vitest` for unit tests of tool handlers and auth logic; standard in the accountant reference |
| ESLint | Linting | With `no-restricted-imports` rule on `src/modules/mcp/` to enforce the portable module boundary |
| `@typescript-eslint/eslint-plugin` | Type-aware linting | Catches dispatch loop and schema errors at lint time |

## Installation

```bash
# Core runtime
npm install @modelcontextprotocol/sdk zod dotenv decimal.js

# Dev dependencies
npm install -D typescript tsx vitest @types/node

# The MCP SDK includes a bundled server implementation; no separate @modelcontextprotocol/server package needed
```

## Architecture: Portable Module Pattern (from accountant reference)

The `src/modules/mcp/` pattern enforces a hard boundary between portable server logic and app-specific wiring. Copy `src/modules/mcp/` verbatim to the new project; reimplement the thin app-bridge layer per project.

```
src/modules/mcp/          ← PORTABLE — copy to any app
  types.ts                 Core types, DI contracts, result envelope (generic TDb)
  client.ts                Client-safe barrel (types only — no runtime Prisma)
  index.ts                 Server barrel
  registry/
    tool-registry.ts       ToolRegistry singleton (register + freeze)
  services/
    create-mcp-server.ts   Dispatch loop (permission → approval → handler → audit)
    stdio-transport.ts      JSON-RPC 2.0 stdio transport (process.stdin/stdout)
    http-transport.ts      JSON-RPC 2.0 HTTP transport (for Express/Fastify)
  utils/
    serialize.ts           serializeDeep + dataResult / errorResult helpers
  models/
    response-types.ts      App-specific serializable response shapes (recreate per app)

src/lib/mcp/              ← APP-SPECIFIC — implement per app
  types.ts                 Constrained type aliases: McpToolDefinition<PrismaClient>
  callbacks.ts             App implementations: apiKeyValidator, permissionChecker,
                           approvalRouter, auditWriter
  register-tools.ts        Single place calling toolRegistry.register()
  tools/
    {domain}.ts            Domain tool families — one file per domain

scripts/
  mcp-server.ts            ← SUBPROCESS ENTRY — implement per app
```

**Rule:** `src/modules/mcp/**` must never import from `src/lib/`, `src/app/`, `next/*`, or `server-only`. An ESLint `no-restricted-imports` rule enforces this at build time.

### Key Architectural Decisions from Reference

1. **stdio transport is hand-rolled** (not from SDK). The reference uses `src/modules/mcp/services/stdio-transport.ts` — reads newline-delimited JSON-RPC from `process.stdin`, writes to `process.stdout`. This gives full control over the protocol without SDK overhead.

2. **Dispatch loop is injectable** (`create-mcp-server.ts`). Permission checks, approval routing, and audit writing are all callback-injected — no app imports in the portable module.

3. **Zod schemas are shared** — the same schema used for server actions is used as the MCP tool's `inputSchema`. Never define a second schema for MCP.

4. **`TDb` is generic** — the portable module defaults `TDb = unknown`. App-side `src/lib/mcp/types.ts` constrains it to `PrismaClient`. Tool handlers get full autocomplete.

5. **Result helpers enforce structure** — `dataResult()`, `errorResult()`, `commitResult()`, etc. from `serialize.ts` ensure every handler response has the `McpToolResult` envelope (`ok`, `kind`, `payload`/`error`).

## HMAC-SHA1 Auth Implementation

Freedcamp uses HMAC-SHA1 for request signing. Use Node's built-in `crypto`:

```ts
import { createHmac } from "crypto";

function signRequest(body: string, secret: string): string {
  return createHmac("sha1", secret).update(body).digest("hex");
}

// Per-request: attach to Authorization header or as query param
const timestamp = Math.floor(Date.now() / 1000);
const body = JSON.stringify(payload);
const signature = signRequest(body, apiSecret);
```

Do **not** use an external HMAC library — the built-in `crypto` module is sufficient.

## Tool Definition Pattern

```ts
import { z } from "zod";
import type { McpToolDefinition } from "@/lib/mcp/types";
import { dataResult } from "@/modules/mcp/utils/serialize";

// Reuse the same schema as the server action
const taskListSchema = z.object({
  projectId: z.number().int().positive().optional(),
  status: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
});

export const taskListTool: McpToolDefinition = {
  name: "task.list",
  description: "List tasks from Freedcamp, optionally filtered by project.",
  inputSchema: taskListSchema,
  requiredPageKey: "tasks",       // page registry key for RBAC
  accessLevel: "READ",            // "READ" = requirePageAccess; "WRITE" = requireWriteGate

  async handler(toolCtx, input) {
    // input is already Zod-parsed — safe to use directly
    const { projectId, status, page, pageSize } = taskListSchema.parse(input);

    // Make signed REST call to Freedcamp
    const response = await freedcampRequest("/tasks", {
      project_id: projectId,
      status,
      page,
      per_page: pageSize,
    }, toolCtx);

    return dataResult({ tasks: response.data, pagination: response.pagination });
  },
};
```

## Output Field Limiting

To prevent context burn on large result sets:

- Always include `page` / `pageSize` params with sensible defaults (20) and maximums (100–200)
- Tool response payloads should select only needed fields — avoid returning full raw API responses
- Use `serializeDeep()` (from `serialize.ts`) on all handler outputs to normalize `Date`, `BigInt`, and `Decimal.js` values before crossing the stdio boundary
- Consider a `fields` param on list tools to allow the caller to request only specific fields

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Custom stdio transport (hand-rolled) | `@modelcontextprotocol/sdk`'s built-in `StdioServerTransport` | Use SDK transport for quick prototypes; use hand-rolled for full protocol control and no SDK bundle overhead |
| `zod` v4 | `valibot` | Valibot is smaller (~2KB vs ~30KB); Zod is better documented and more widely adopted in the MCP ecosystem; prefer Zod for consistency |
| `tsx` for subprocess | `ts-node` | tsx is 5–10x faster cold start than ts-node; required for subprocess hot path |
| Hand-rolled HTTP transport | Express/Fastify integration | Only needed if you want HTTP transport (for web-accessible MCP); stdio-only servers don't need this |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@modelcontextprotocol/sdk` v2 (pre-alpha) | Unstable; breaking changes expected; v1.29.0 is production stable | `@modelcontextprotocol/sdk@1.29.0` |
| `any` as tool handler input type | Bypasses Zod validation; defeats the purpose of schema-driven dispatch | Use `inputSchema.safeParse()` in the dispatch loop; handler receives already-validated `input` |
| Separate Zod schemas for MCP vs server actions | Drift between them causes runtime validation failures | Single Zod schema shared across both |
| `axios` or `got` | Unnecessary for a simple REST API wrapper; Node `fetch` is built-in | Node `fetch` (Node 18+) |
| Class-based tool definitions | Verbose; doesn't work well with the registry pattern | Plain object tool definitions (`const tool: McpToolDefinition = {...}`) |
| Next.js / any app framework in portable module | Breaks portability; creates framework coupling | Standalone Node.js subprocess only |

## Stack Patterns by Variant

**If you want stdio-only (simplest):**
- Use hand-rolled stdio transport from reference
- Single subprocess entry: `scripts/mcp-server.ts`
- Run with: `npx tsx scripts/mcp-server.ts`
- Claude Desktop config: `{ "command": "npx", "args": ["tsx", "scripts/mcp-server.ts"] }`

**If you want HTTP + stdio (web-accessible):**
- Add `src/modules/mcp/services/http-transport.ts` from reference
- Wire to Express/Fastify POST handler
- Keep stdio for Claude Desktop; HTTP for programmatic clients

**If you need async tool calls (slow operations):**
- Use the `asyncResultStore` pattern from `src/lib/mcp/async-result-store.ts` (accountant reference)
- Return `{ status: "pending", toolCallId }` immediately; poll for result
- Not needed for simple REST API calls (those are fast enough to return inline)

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@modelcontextprotocol/sdk@1.29.0` | `zod@^4.x` | SDK uses Standard Schema interface; Zod v4 implements this natively |
| `@modelcontextprotocol/sdk@1.29.0` | `typescript@^5.x` | No special type requirements |
| `tsx@4.x` | `typescript@^5.x` | Native ESM + CJS support |
| `zod@4.3.6` | `typescript@^5.x` | Full type inference |
| `decimal.js@10.x` | `zod@4.x` | Decimal fields in schemas using `z.instanceof(Decimal)` |

## Sources

- [npm: @modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — v1.29.0, verified via `npm view`
- [GitHub: modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) — v1.x production stable, v2 pre-alpha
- [accountant reference: `src/modules/mcp/`](file:///home/mahrukh/coding/accountant/src/modules/mcp/) — portable module pattern, stdio transport, dispatch loop
- [accountant reference: `src/lib/mcp/`](file:///home/mahrukh/coding/accountant/src/lib/mcp/) — app-bridge implementation pattern

---
*Stack research for: Freedcamp MCP Server*
*Researched: 2026-04-23*