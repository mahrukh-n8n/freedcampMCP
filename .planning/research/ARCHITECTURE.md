# Architecture Research: Freedcamp MCP Server

**Domain:** MCP server wrapping a REST API (standalone TypeScript)
**Researched:** 2026-04-23
**Confidence:** MEDIUM — MCP SDK docs are current; Freedcamp API specifics confirmed from project context

---

## Recommended Architecture

The Freedcamp MCP server follows a **two-layer standalone architecture**: a portable core borrowed from the accountant project, adapted for a no-database, API-key-only server.

```
┌──────────────────────────────────────────────────────────────────┐
│                    subprocess entry (main.ts)                    │
│  Boot: validate HMAC key → register tools → freeze → stdio loop  │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│               portable layer (src/modules/mcp/)                  │
│  ToolRegistry (singleton-register-freeze)                         │
│  createMcpServer() — dispatch: permission check → handler → result │
│  stdio-transport.ts — JSON-RPC 2.0 over stdin/stdout              │
│  serialize.ts — result helpers (dataResult, errorResult, etc.)    │
│  types.ts — generic contract (TDb = unknown, no DB assumptions)    │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│              app-specific layer (src/lib/freedcamp/)              │
│  auth/hmac-validator.ts     HMAC-SHA1 API key validation          │
│  api-client.ts              Freedcamp REST HTTP client           │
│  types.ts                   Constrained aliases (TDb = void)      │
│  register-tools.ts           Register all tool families            │
│  tools/{domain}.ts          Per-entity tool definitions          │
│  utils/name-resolver.ts      Name-to-ID resolution                 │
│  utils/response-filter.ts    Output field limiting                 │
└──────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Talks To |
|-----------|----------------|----------|
| `main.ts` | Boot sequence: load env vars, validate HMAC key, register tools, connect transport | `modules/mcp/`, `lib/freedcamp/` |
| `src/modules/mcp/registry/tool-registry.ts` | Tool registry: register, freeze, list, lookup | Tool definitions from `lib/freedcamp/tools/` |
| `src/modules/mcp/services/create-mcp-server.ts` | Dispatch loop: calls `permissionChecker` → handler → serialize result | Tool handlers, callbacks |
| `src/modules/mcp/services/stdio-transport.ts` | JSON-RPC 2.0 over stdio: parse incoming requests, emit responses | MCP SDK, Node.js `process.stdin/stdout` |
| `src/modules/mcp/utils/serialize.ts` | Shape responses into MCP `content` envelopes | Tool handlers |
| `src/lib/freedcamp/auth/hmac-validator.ts` | Validate HMAC-SHA1 API key against Freedcamp API key | Reads `FREEDCAMP_API_KEY` env var |
| `src/lib/freedcamp/api-client.ts` | Typed HTTP client for Freedcamp REST API | Freedcamp API (https://freedcamp.com/api/v2/) |
| `src/lib/freedcamp/tools/{domain}.ts` | Tool families per entity (projects, tasks, events, files, etc.) | API client, name-resolver, response-filter |
| `src/lib/freedcamp/utils/name-resolver.ts` | Resolve human names to Freedcamp IDs (e.g. project title → project_id) | API client, Zod schema field annotation |
| `src/lib/freedcamp/utils/response-filter.ts` | Strip or limit response fields before returning to client | Tool handler output |

**Rule:** `src/modules/mcp/**` must never import from `src/lib/freedcamp/`, `src/app/`, or any app code. ESLint enforces this boundary.

---

## Data Flow

### Tool Call Flow

```
MCP Host (stdin)
    │
    ▼
stdio-transport.ts — parse JSON-RPC request
    │
    ▼
createMcpServer.handleCallTool(name, args)
    │
    ├── HMAC permission check (freedcamp-specific, not generic)
    │
    ▼
Tool handler (from src/lib/freedcamp/tools/{domain}.ts)
    │
    ├── name-resolver.ts — resolve name args to IDs (if needed)
    ├── api-client.ts — call Freedcamp REST API
    └── response-filter.ts — limit output fields
    │
    ▼
serialize.dataResult() → stdio-transport.ts — emit JSON-RPC response
    │
    ▼
MCP Host (stdout)
```

### Init Flow

```
main.ts boot
    │
    ├── Read FREEDCAMP_API_KEY, FREEDCAMP_USER_ID from env
    ├── HMAC-SHA1 validate key against Freedcamp endpoint
    ├── registerMcpTools() — registers all tool families
    ├── toolRegistry.freeze()
    ├── createMcpServer(session, toolRegistry, callbacks)
    └── startStdioTransport(server)
```

---

## Project Structure

```
freedcamp-mcp/
├── package.json
├── tsconfig.json
├── .eslintrc.json
├── src/
│   ├── main.ts                      # Subprocess entry point
│   ├── modules/
│   │   └── mcp/                     # Portable MCP module
│   │       ├── index.ts             # Barrel (client-safe exports)
│   │       ├── client.ts           # Client-safe barrel (types only)
│   │       ├── types.ts            # Generic contract (TDb = unknown)
│   │       ├── models/
│   │       │   └── response-types.ts
│   │       ├── registry/
│   │       │   └── tool-registry.ts
│   │       ├── services/
│   │       │   ├── create-mcp-server.ts
│   │       │   └── stdio-transport.ts
│   │       └── utils/
│   │           └── serialize.ts
│   └── lib/
│       └── freedcamp/
│           ├── types.ts             # Constrained aliases (TDb = void)
│           ├── auth/
│           │   └── hmac-validator.ts
│           ├── api-client.ts        # Freedcamp HTTP client
│           ├── register-tools.ts    # ONLY file that calls toolRegistry.register()
│           ├── tools/
│           │   ├── projects.ts      # project.list, project.get, project.create, ...
│           │   ├── tasks.ts         # task.list, task.get, task.create, task.update, task.assign, ...
│           │   ├── events.ts        # event.list, event.get, event.create, event.update, ...
│           │   ├── files.ts         # file.list, file.get, file.upload, ...
│           │   └── discussions.ts   # discussion.list, discussion.get, discussion.create, ...
│           └── utils/
│               ├── name-resolver.ts  # Named fields → ID resolution
│               └── response-filter.ts # Output field limiting
└── .env.example
```

### Structure Rationale

- **`src/modules/mcp/`:** Copied verbatim from the accountant project. This layer is database-agnostic and transport-agnostic (except for stdio). It never touches Freedcamp-specific code.
- **`src/lib/freedcamp/`:** All Freedcamp-specific logic lives here. `types.ts` constrains `TDb` to `void` (since there's no DB), keeping the generic contract intact while preventing accidental DB access.
- **`src/main.ts`:** The subprocess entry. Runs outside any framework runtime. Reads env vars, validates auth, registers tools, connects the stdio transport.
- **`tools/` split by entity:** Each entity (projects, tasks, events, files, discussions) gets its own file. This mirrors the accountant's domain file pattern and keeps tool families easy to audit.

---

## Key Design Decisions

### 1. No Database Layer

Unlike the accountant (Prisma + Next.js), Freedcamp MCP is a pure API wrapper. There is no persistent session store, no audit table, no user/company resolution beyond the API key. `TDb` is constrained to `void`.

**Consequence:** The four DI callbacks (`apiKeyValidator`, `permissionChecker`, `approvalRouter`, `auditWriter`) collapse significantly:
- `apiKeyValidator` → calls HMAC-SHA1 check against Freedcamp endpoint
- `permissionChecker` → no-op (Freedcamp has no per-user permission model from the API side)
- `approvalRouter` → no-op (no approval flow)
- `auditWriter` → optionally logs to stderr (no persistent store)

### 2. HMAC-SHA1 Auth Only

Freedcamp uses API keys with HMAC-SHA1 signing. The server validates the key at boot via the Freedcamp API, not against a local database.

**Implementation:** `hmac-validator.ts` takes `FREEDCAMP_API_KEY` from env, calls `GET /api_key/check` or equivalent, and returns a session object `{ userId, apiKey }`.

### 3. STDIO Transport Only

No HTTP endpoint, no SSE keepalive. The server is a subprocess spawned by Claude Code's MCP client via stdio. This simplifies everything — one transport, one connection model.

The stdio transport from `src/modules/mcp/` is used verbatim.

### 4. Name-to-ID Resolution as a First-Class Concern

Freedcamp APIs use numeric IDs internally but users interact via names (project title, task name, user full name). Tool handlers that accept a `project` or `task` argument need to resolve these before making API calls.

**Approach:** `name-resolver.ts` reads a Zod schema field annotation convention (e.g. `z.string().meta({ resolveToId: 'project' })`) and runs resolution queries before dispatching to the handler. Handlers receive already-resolved IDs.

This is simpler than the accountant's staged workflow pattern since Freedcamp doesn't have entity dependencies as complex (no PO → shipment → GRN chain).

### 5. Response Field Limiting

Freedcamp API responses can be large and include fields the MCP client doesn't need. `response-filter.ts` uses a per-tool allowlist to strip fields before returning.

**Approach:** Each tool definition includes a `outputFields` allowlist. The response-filter utility post-processes the API response against this list.

---

## Build Order (Dependencies)

```
1. src/modules/mcp/           ← copy from accountant; verify stdio transport works
   ↑
2. src/lib/freedcamp/
   ├── types.ts               ← constrain TDb to void
   ├── auth/hmac-validator.ts ← verify HMAC auth works with real Freedcamp key
   ├── api-client.ts          ← verify REST calls work
   │
   ├── register-tools.ts      ← wire up the registry
   └── tools/projects.ts      ← simplest entity first
        ↑
   └── tools/tasks.ts         ← depends on name-resolver
        ↑
   └── tools/{events,files,discussions}.ts
        ↑
2b. src/lib/freedcamp/utils/
   ├── name-resolver.ts       ← after at least one tool with named args exists
   └── response-filter.ts     ← after at least one tool returns full API response
        ↑
3. src/main.ts               ← wire everything together; full boot + tool call test
```

**Rationale:** Build the foundation (portable module + API client) before any tool definitions. Tools depend on the API client working. Utilities (name-resolver, response-filter) are refactor targets once at least one tool exists.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user / 1 API key | No changes needed. Single subprocess, single HMAC session. |
| 2–10 users / multiple API keys | Spawn one subprocess per API key. Each subprocess is independent. No shared state. |
| Multi-tenant (many companies) | Each subprocess per company is still independent. No DB coordination needed. Rate limit at API client level. |

**First bottleneck:** Freedcamp API rate limits. Mitigate with per-request backoff in `api-client.ts`, not in tool definitions.

**Second bottleneck:** Name resolution adds N+1 API calls. Mitigate by batching resolution queries or caching resolved IDs in a module-level Map (TTL: 5 minutes).

---

## Anti-Patterns

### Anti-Pattern 1: Mixing App Logic Into `src/modules/mcp/`

**What people do:** Adding Freedcamp-specific imports into `src/modules/mcp/` because "it's just one small thing."

**Why it's wrong:** Breaks the portability boundary. The module can no longer be used in other projects without dragging Freedcamp code along.

**Do this instead:** Keep all app-specific logic in `src/lib/freedcamp/`. If the logic is generic (e.g. a Zod schema, a result helper), add it to `src/modules/mcp/` first.

### Anti-Pattern 2: Tool Handlers Calling the Freedcamp API Directly

**What people do:** Each tool handler making raw `fetch()` calls directly.

**Why it's wrong:** Duplicated base URL, auth headers, error handling, and retry logic across every handler.

**Do this instead:** All API calls go through `api-client.ts`. Tool handlers pass method + path + params; the client handles auth, errors, and serialization.

### Anti-Pattern 3: No Response Filtering

**What people do:** Returning the raw Freedcamp API response directly to the MCP client.

**Why it's wrong:** Freedcamp API responses are verbose. Returning everything wastes bandwidth, exposes internal field names, and can include fields that confuse the LLM.

**Do this instead:** Every tool defines an `outputFields` allowlist. `response-filter.ts` post-processes the response. This also gives you a single place to update when Freedcamp changes their API field names.

### Anti-Pattern 4: Skipping Name Resolution Tests

**What people do:** Implementing name resolution but testing only with known IDs.

**Why it's wrong:** Real users will pass project titles, task names, user names. If the resolver has a bug, every tool call that uses named arguments will silently return the wrong entity.

**Do this instead:** Write integration tests that pass a name string and verify the correct ID is resolved. Mock the API at the resolution step.

---

## Integration Points

### External: Freedcamp REST API

| Endpoint | Auth | Usage |
|----------|------|-------|
| `GET /api_key/check` | HMAC-SHA1 | Boot-time API key validation |
| `GET /projects` | HMAC-SHA1 | List projects |
| `GET /projects/{id}` | HMAC-SHA1 | Get project detail |
| `POST /projects` | HMAC-SHA1 | Create project |
| `GET /tasks` | HMAC-SHA1 | List tasks (filter by project_id, user_id) |
| `POST /tasks` | HMAC-SHA1 | Create task |
| `PATCH /tasks/{id}` | HMAC-SHA1 | Update task |
| `POST /tasks/{id}/assign` | HMAC-SHA1 | Assign task |
| `GET /events` | HMAC-SHA1 | List events |
| `POST /events` | HMAC-SHA1 | Create event |
| `GET /files` | HMAC-SHA1 | List files |
| `POST /files` | HMAC-SHA1 | Upload file (multipart) |
| `GET /discussions` | HMAC-SHA1 | List discussions |

**Gotcha:** Freedcamp API field names use underscores (`project_id`, `task_id`). Confirm the exact field names before building the response-filter allowlist.

### Internal: Name Resolver ↔ API Client

The name resolver makes API calls to find entity IDs by name. This is a tight coupling — the resolver calls `api-client.ts` methods specifically for lookup. No shared state between the two.

---

## Sources

- [MCP Protocol Documentation](https://modelcontextprotocol.io/docs) — official MCP docs, server architecture, stdio transport
- [MCP SDK `@modelcontextprotocol/sdk`](https://modelcontextprotocol.io/docs/sdk.md) — TypeScript server initialization, tool definitions, transport setup
- [Accountant MCP Module — Developer Guide](/home/mahrukh/coding/accountant/src/modules/mcp/DEVELOPER-GUIDE.md) — portable module architecture, tool registry, dispatcher pattern
- [Accountant MCP Module — Porting Guide](/home/mahrukh/coding/accountant/src/modules/mcp/PORTING.md) — module boundary rules, two-layer architecture, subprocess entry
