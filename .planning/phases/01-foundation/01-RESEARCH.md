# Phase 01: Foundation - Research

**Researched:** 2026-04-23
**Domain:** MCP server architecture, HMAC-SHA1 REST API authentication, STDIO transport, Zod validation
**Confidence:** HIGH

## Summary

Phase 1 establishes the working foundation: a stdio subprocess with HMAC-authenticated Freedcamp API access and two first tools (list_projects, list_users). The reference architecture from `/home/mahrukh/coding/accountant/src/modules/mcp/` provides a production-proven portable module that is copied verbatim — the Freedcamp server adapts it by replacing the database-backed DI callbacks with API-key-only implementations. The n8n IO auth handler confirms the exact HMAC-SHA1 formula and parameter encoding rules needed.

**Primary recommendation:** Copy `src/modules/mcp/` from the accountant reference, adapt the four DI callbacks for API-key-only auth, implement `api-client.ts` with the n8n-confirmed HMAC formula, and wire two simple list tools to prove the full call path end-to-end before adding more tools.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | HMAC-SHA1 auth on every request (hash = HMAC-SHA1(secret, apiKey + timestamp)) | Confirmed via n8n IO handler JSON: `crypto.createHmac('sha1', apiSecret).update(apiKey + timestamp).digest('hex')` |
| AUTH-02 | STDIO transport (JSON-RPC 2.0) | Accountant `stdio-transport.ts` — production proven, copy verbatim |
| AUTH-03 | Zod schema validation before execution | `create-mcp-server.ts` dispatch calls `inputSchema.safeParse()` before handler |
| AUTH-04 | McpToolResult envelope (ok/kind/payload/error) | `serialize.ts` helpers confirmed: `dataResult()`, `errorResult()`, etc. |
| AUTH-05 | `fields` parameter for output limiting (dot notation) | Confirmed in n8n `filter for required outputs` node: `getValueByPath(obj, path)` supports dot notation |
| AUTH-06 | Env vars (FREEDCAMP_API_KEY, FREEDCAMP_API_SECRET) or CLI args | Subprocess entry pattern from accountant `scripts/mcp-server.ts` |
| AUTH-07 | Health check / connection verification tool | No DB ping needed; call `GET /api_key/check` as health probe |
| API-01 | HTTP client with HMAC-SHA1 on every request | `api-client.ts` wraps Node `fetch` with HMAC signing on each call |
| API-02 | Multi-value params with [] suffix | Confirmed n8n: `key.endsWith('[]') ? key : \`${key}[]\`` — even single values use [] |
| API-03 | GET = query string; POST = auth in query + body JSON | Confirmed n8n: GET attaches all params to URL; POST sends auth as query params, body as JSON |
| API-04 | Structured error handling | `serialize.ts` `errorResult()` with `McpErrorCode` enum |
| API-05 | Pagination with meta (has_more, total_count) | `paginate.ts` utility + API returns `has_more` + `total_count` in meta |
| API-06 | Sort via order[field]=asc\|desc | API supports `order[field]=asc\|desc` format |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x | Language | Required for MCP SDK and strict typing |
| Node.js | 22.x LTS | Runtime | Required for stdio subprocess; 18+ has built-in `fetch` |
| `tsx` | 4.21.0 | Script runner | Runs subprocess entry without build step; fast cold start |
| Zod | 4.3.6 | Input validation | MCP SDK Standard Schema compatible; same schema used in server actions |
| `dotenv` | 17.x | Env loading | Loads `FREEDCAMP_API_KEY`, `FREEDCAMP_API_SECRET` at boot |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `crypto` | built-in | HMAC-SHA1 signing | Every API request |
| Node.js `fetch` | built-in (18+) | REST API calls | Every API request |
| Node.js `assert` | built-in | Deep equal for test assertions | Test suite |

**No external HTTP client needed** — Node's built-in `fetch` is sufficient.

**Installation:**
```bash
npm install zod dotenv
npm install -D typescript tsx @types/node vitest
```

---

## Architecture Patterns

### Recommended Project Structure

```
freedcamp-mcp/
├── package.json
├── tsconfig.json
├── scripts/
│   └── mcp-server.ts          # Subprocess entry (boot → register → stdio loop)
├── src/
│   ├── modules/
│   │   └── mcp/               # PORTABLE — copied verbatim from accountant
│   │       ├── index.ts
│   │       ├── client.ts
│   │       ├── types.ts       # TDb = unknown (no DB)
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
│           ├── types.ts       # Constrained aliases (TDb = void)
│           ├── api-client.ts  # Freedcamp HTTP client + HMAC signing
│           ├── callbacks.ts   # DI callbacks (HMAC validator, no-op permission)
│           ├── register-tools.ts
│           └── tools/
│               ├── projects.ts
│               └── users.ts
└── .env.example
```

**The portable module boundary:** `src/modules/mcp/` must NEVER import from `src/lib/freedcamp/` or any app code. ESLint `no-restricted-imports` enforces this.

### Pattern 1: HMAC-SHA1 Request Signing

**Source:** Confirmed from n8n `io-auth-handler.json` (the production auth workflow):

```typescript
import { createHmac } from "crypto";

function buildAuthParams(apiKey: string, apiSecret: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hash = createHmac("sha1", apiSecret)
    .update(apiKey + timestamp)  // apiKey concatenated with timestamp
    .digest("hex");
  return { api_key: apiKey, timestamp, hash };
}
```

**GET request format:**
```
GET https://freedcamp.com/api/v1{endpoint}?api_key=X&timestamp=Y&hash=Z&{url_params}
```

**POST request format:**
```
POST https://freedcamp.com/api/v1{endpoint}?api_key=X&timestamp=Y&hash=Z
Body: JSON { ... }
```

### Pattern 2: Multi-Value Parameter Encoding

**Source:** Confirmed from n8n `url params for get` node:

```typescript
function encodeParam(key: string, value: unknown): string[] {
  if (Array.isArray(value)) {
    const keyName = key.endsWith("[]") ? key : `${key}[]`;
    return value.map((item) =>
      `${encodeURIComponent(keyName)}=${encodeURIComponent(String(item))}`
    );
  }
  return [`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`];
}
```

Fields that ALWAYS use array notation: `status[]`, `assigned_to_id[]`, `created_by_id[]`

### Pattern 3: Stdio Transport Loop

**Source:** `accountant/src/modules/mcp/services/stdio-transport.ts` — production proven:

```typescript
// Handles: initialize, tools/list, tools/call, ping, notifications
// Every tools/call result wrapped in MCP content format:
sendResult(id, {
  content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
});
// Errors use isError: true flag so AI agent reads structured error
```

### Pattern 4: Response Field Limiting (Dot Notation)

**Source:** Confirmed from n8n `filter for required outputs` node:

```typescript
function getValueByPath(obj: unknown, path: string, keepArrays = true): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return null;
    if (Array.isArray(current)) {
      // Recurse into each array item
      const results = current.map((item) => getValueByPath(item, part, keepArrays));
      return keepArrays ? results : results.join(" | ");
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
```

**The `fields` parameter** on list/get tools accepts `string[]`. The API client applies this after fetching full response, using dot-notation path walking to extract only requested fields.

### Pattern 5: DI Callbacks Collapsed for API-Key-Only

Unlike the accountant (Prisma + Next.js), Freedcamp has no database and no per-user permission model. The four DI callbacks collapse:

| Callback | Accountant | Freedcamp |
|----------|-----------|-----------|
| `apiKeyValidator` | bcrypt-compare against DB | HMAC-SHA1 check against `GET /api_key/check` |
| `permissionChecker` | requirePageAccess + write toggle | No-op (Freedcamp API has no per-user permissions from this side) |
| `approvalRouter` | Creates PendingApproval | No-op (no approval flow) |
| `auditWriter` | Writes to AuditLog table | `console.error` to stderr (no persistent store) |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON-RPC 2.0 stdio transport | Custom parser and writer | `accountant/src/modules/mcp/services/stdio-transport.ts` | Production proven; JSON-RPC framing is subtle (notification handling, error codes, content wrapping) |
| Result envelope | Custom ok/kind/payload object | `serialize.ts` helpers | Consistent across all tools; handles Decimal/BigInt/Date normalization |
| HMAC-SHA1 signing | Ad-hoc crypto | Confirmed n8n formula | Real API key signature must be exact; this formula is proven working |
| Tool registration | ad-hoc Map | `ToolRegistry` singleton-freeze | Validates name format, prevents duplicates, freeze-before-use |
| Multi-value param encoding | String concatenation | Confirmed n8n `encodeParam()` pattern | Handles arrays, nulls, URL encoding correctly |

---

## Common Pitfalls

### Pitfall 1: HMAC Hash Formula Wrong
**What goes wrong:** All API requests return 401 Unauthorized.
**Why it happens:** `apiKey + timestamp` vs `timestamp + apiKey` — order matters. The n8n handler uses `apiKey + timestamp` (apiKey concatenated on the LEFT).
**How to avoid:** Use the exact formula confirmed from `io-auth-handler.json`: `createHmac('sha1', secret).update(apiKey + timestamp).digest('hex')`
**Warning signs:** 401 on every request during first boot test.

### Pitfall 2: Single Values Using Array Notation for Wrong Fields
**What goes wrong:** Some API calls succeed, others silently return empty results.
**Why it happens:** Only `status[]`, `assigned_to_id[]`, `created_by_id[]` require `[]` even for single values. Other fields like `project_id` must NOT use `[]`.
**How to avoid:** Explicit whitelist of array-notation fields. Check against `io-auth-handler.json` confirmed list.
**Warning signs:** Filtering by `project_id` returns nothing when using `project_id[]=[value]`.

### Pitfall 3: GET body sent as JSON instead of query string
**What goes wrong:** Requests succeed but return wrong/unexpected data.
**Why it happens:** Freedcamp GET requests expect all params (including non-auth) in the URL query string. POST requests put auth in query string and body params as JSON.
**How to avoid:** Separate `buildGetUrl()` and `buildPostRequest()` paths in `api-client.ts`.
**Warning signs:** GET requests with complex filter objects work in n8n but seem to have no effect.

### Pitfall 4: Portable module boundary violation
**What goes wrong:** `src/modules/mcp/` works in accountant but fails to port cleanly.
**Why it happens:** Accidentally importing `src/lib/freedcamp/` into the portable layer during early development.
**How to avoid:** ESLint `no-restricted-imports` rule on `src/modules/mcp/**`. Add this immediately in Phase 1 setup.
**Warning signs:** Circular dependency errors or the module can't be copied to a fresh directory.

### Pitfall 5: Output field limiting not applied — context burn
**What goes wrong:** Agent context burns fast on large Freedcamp payloads.
**Why it happens:** Returning raw API responses with all fields. Freedcamp returns massive objects by default.
**How to avoid:** `fields` parameter on every list/get tool; `response-filter.ts` utility that walks dot-notation paths.
**Warning signs:** First list_tools call returns responses > 50KB.

### Pitfall 6: Health check tool doesn't exist (AUTH-07)
**What goes wrong:** No way to verify credentials are valid before attempting real tool calls.
**Why it happens:** Skipped as "simple" in favor of more complex tools.
**How to avoid:** Call `GET /api_key/check` as the health check implementation — it validates the HMAC credentials directly.
**Warning signs:** First real tool call fails with cryptic 401 instead of a clear "credentials invalid" health response.

### Pitfall 7: Tool handlers call fetch() directly instead of api-client
**What goes wrong:** Duplicated HMAC signing, base URL, and error handling across every handler.
**Why it happens:** Fast to wire up one tool by calling fetch directly.
**How to avoid:** ALL API calls go through `api-client.ts`. Phase 1 must wire `api-client.ts` BEFORE any tool handlers.
**Warning signs:** `api_key` query param appears in more than one file.

---

## Code Examples

### API Client (HMAC-SHA1 confirmed pattern)

```typescript
// src/lib/freedcamp/api-client.ts
import { createHmac } from "crypto";

const BASE_URL = "https://freedcamp.com/api/v1";

export interface FreedcampRequestOptions {
  method?: "GET" | "POST";
  path: string;
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

function buildAuthParams(apiKey: string, apiSecret: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hash = createHmac("sha1", apiSecret)
    .update(apiKey + timestamp)
    .digest("hex");
  return { api_key: apiKey, timestamp, hash };
}

export async function freedcampRequest(
  options: FreedcampRequestOptions,
  credentials: { apiKey: string; apiSecret: string }
): Promise<unknown> {
  const { method = "GET", path, params = {}, body } = options;
  const auth = buildAuthParams(credentials.apiKey, credentials.apiSecret);

  let url = `${BASE_URL}${path}?api_key=${auth.api_key}&timestamp=${auth.timestamp}&hash=${auth.hash}`;

  if (method === "GET") {
    // Encode all params as query string with [] suffix for array fields
    const qs = encodeParams(params);
    url += qs ? `&${qs}` : "";
    const response = await fetch(url);
    return handleResponse(response);
  } else {
    // POST: auth in query string, body as JSON
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? params),
    });
    return handleResponse(response);
  }
}
```

### Multi-value param encoding (confirmed from n8n)

```typescript
const ARRAY_NOTATION_FIELDS = new Set(["status", "assigned_to_id", "created_by_id"]);

export function encodeParams(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      const keyName = `${key}[]`;
      for (const item of value) {
        parts.push(`${encodeURIComponent(keyName)}=${encodeURIComponent(String(item))}`);
      }
    } else if (ARRAY_NOTATION_FIELDS.has(key)) {
      // Force array notation even for single values
      parts.push(`${encodeURIComponent(key + "[]")}=${encodeURIComponent(String(value))}`);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.join("&");
}
```

### Subprocess Entry (boot pattern from accountant)

```typescript
// scripts/mcp-server.ts
import "dotenv/config";
import { randomUUID } from "crypto";
import { toolRegistry, createMcpServer, startStdioTransport } from "./modules/mcp";
import { registerFreedcampTools } from "./lib/freedcamp/register-tools";
import { createFreedcampCallbacks } from "./lib/freedcamp/callbacks";
import { createFreedcampApiClient } from "./lib/freedcamp/api-client";

async function boot() {
  const apiKey = process.env.FREEDCAMP_API_KEY ?? "";
  const apiSecret = process.env.FREEDCAMP_API_SECRET ?? "";

  // Health check: verify credentials
  const apiClient = createFreedcampApiClient({ apiKey, apiSecret });
  const health = await apiClient.request({ path: "/api_key/check" });
  if (!health) throw new Error("Invalid Freedcamp API credentials");

  // Register tools
  registerFreedcampTools();
  toolRegistry.freeze();

  // Build session (no userId/companyId from DB — use a fixed session)
  const session = { userId: 1, companyId: 1, requestId: randomUUID() };

  // Create callbacks (no-op permission, no-op approval, stderr audit)
  const callbacks = createFreedcampCallbacks(apiClient);

  const server = createMcpServer(session, toolRegistry, callbacks);
  await startStdioTransport(server);
}

boot().catch((err) => {
  process.stderr.write(`[mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});
```

### Tool Definition Pattern

```typescript
// src/lib/freedcamp/tools/projects.ts
import { z } from "zod";
import type { McpToolDefinition } from "../types";
import { dataResult } from "../../modules/mcp/utils/serialize";

const projectListSchema = z.object({
  fields: z.array(z.string()).optional().default(["id", "name", "description"]),
  limit: z.number().int().positive().max(200).default(50),
  offset: z.number().int().nonnegative().default(0),
});

export const projectListTool: McpToolDefinition = {
  name: "project.list",
  description: "List all accessible Freedcamp projects.",
  inputSchema: projectListSchema,
  requiredPageKey: "projects",
  accessLevel: "READ",
  async handler(ctx, input) {
    const { fields, limit, offset } = projectListSchema.parse(input);
    const response = await ctx.apiClient.request({
      path: "/projects",
      params: { limit, offset, order: { name: "asc" } },
    });
    const filtered = applyFieldLimiting(response.data, fields);
    return dataResult({ projects: filtered, meta: response.meta });
  },
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| HTTP transport + Next.js | STDIO-only standalone | Freedcamp v1: no web UI needed | Simpler subprocess, no framework dependency |
| Raw fetch without field limiting | Dot-notation field selector | Project context | Agent context conservation is critical for large payloads |
| Tool handlers call fetch directly | Centralized api-client.ts | Phase 1 requirement | Consistent HMAC signing, base URL, error handling in one place |

**No deprecation concerns** — this project is greenfield.

---

## Open Questions

1. **What is the exact `/api_key/check` response shape?**
   - What we know: HMAC-signed GET endpoint for credential verification; used in the n8n auth workflow boot
   - What's unclear: exact JSON response structure; whether it returns user info or just { success: true }
   - Recommendation: test with a real key or check Freedcamp API docs; if 401, credentials are invalid

2. **Does Freedcamp API support a `fields` query param natively?**
   - What we know: The n8n workflow filters fields client-side after fetching full response
   - What's unclear: whether Freedcamp supports server-side field limiting
   - Recommendation: always do client-side filtering (safer, works regardless); server-side is an optimization for later

3. **What is the `requiredPageKey` for a tool with no RBAC equivalent?**
   - What we know: Freedcamp API has no per-user permission model from the API key side
   - What's unclear: The MCP dispatch loop checks `requiredPageKey` — what to pass when there's no equivalent page in Freedcamp
   - Recommendation: Use a fixed string like `"freedcamp"` as the pageKey; make the permissionChecker a no-op for Phase 1

---

## Sources

### Primary (HIGH confidence)
- `accountant/src/modules/mcp/` — portable module copied verbatim; stdio transport, dispatch loop, serialize helpers
- `accountant/src/lib/mcp/types.ts` — constrained alias pattern for TDb
- `accountant/src/modules/mcp/PORTING.md` — module boundary rules, subprocess entry pattern
- `accountant/src/modules/mcp/DEVELOPER-GUIDE.md` — tool definition pattern, result helpers
- `freedcampMCP/.planning/n8n-workflow-reference/io-auth-handler.json` — HMAC-SHA1 formula confirmed, GET/POST routing confirmed, multi-value param encoding confirmed, dot-notation field filtering confirmed

### Secondary (MEDIUM confidence)
- `freedcampMCP/.planning/research/STACK.md` — Node.js 22.x LTS, TypeScript 5.x, zod 4.3.6, tsx 4.21.0 recommendations

### Tertiary (LOW confidence)
- Freedcamp API v1 `/api_key/check` endpoint — exact response shape not confirmed; plan for it but test during Phase 1 execution

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions confirmed from existing project configs
- Architecture: HIGH — accountant reference is production proven; n8n workflow confirms exact auth/encoding patterns
- Pitfalls: HIGH — all pitfalls are either confirmed from n8n workflow or derivable from portable module inspection

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (30 days — no fast-moving dependencies in this stack)
