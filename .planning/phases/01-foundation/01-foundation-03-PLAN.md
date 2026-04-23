---
phase: 01-foundation
plan: 03
type: execute
wave: 1
depends_on: [01-foundation-02]
files_modified:
  - src/lib/freedcamp/auth/hmac.ts
  - src/lib/freedcamp/auth/hmac-validator.ts
  - src/lib/freedcamp/api-client.ts
  - src/lib/freedcamp/utils/field-limiter.ts
  - src/lib/freedcamp/callbacks.ts
autonomous: true
transition_safety:
  safe: true
requirements:
  - AUTH-01
  - AUTH-04
  - AUTH-05
  - AUTH-07
  - API-01
  - API-02
  - API-03
  - API-04
  - API-05
  - API-06

must_haves:
  truths:
    - "Every API request is HMAC-SHA1 signed with apiKey + timestamp order"
    - "GET requests put all params (including filters) in URL query string"
    - "POST requests put auth in query string + body as JSON"
    - "Multi-value fields (status, assigned_to_id, created_by_id) use [] suffix even for single values"
    - "Health check verifies credentials via GET /api_key/check before any other tool call"
    - "Response field limiting uses dot-notation to extract only requested fields"
  artifacts:
    - path: "src/lib/freedcamp/auth/hmac.ts"
      provides: "HMAC-SHA1 signing function with confirmed apiKey + timestamp order"
    - path: "src/lib/freedcamp/api-client.ts"
      provides: "Centralized HTTP client that signs every request and routes GET/POST correctly"
    - path: "src/lib/freedcamp/utils/field-limiter.ts"
      provides: "Dot-notation field extraction from raw API responses"
  key_links:
    - from: "src/lib/freedcamp/api-client.ts"
      to: "src/lib/freedcamp/auth/hmac.ts"
      via: "import and calls buildAuthParams"
      pattern: "buildAuthParams"
    - from: "src/lib/freedcamp/api-client.ts"
      to: "src/lib/freedcamp/utils/field-limiter.ts"
      via: "import and applies after API response"
      pattern: "applyFieldLimiting"
---

<objective>
Build the HMAC-SHA1 authentication system and centralized API client. All API calls MUST go through api-client.ts — no direct fetch() in tool handlers. This is the single most critical piece: wrong HMAC = all 401s, wrong routing = silent data loss.

Purpose: Working authenticated API access with correct parameter encoding.
Output: `src/lib/freedcamp/auth/hmac.ts`, `src/lib/freedcamp/api-client.ts`, `src/lib/freedcamp/utils/field-limiter.ts`, `src/lib/freedcamp/callbacks.ts`
</objective>

<execution_context>
@~/.claude/get-shit-right/workflows/execute-plan.md
@~/.claude/get-shit-right/templates/summary.md
</execution_context>

<context>
@.planning/01-foundation/01-RESEARCH.md — "Pattern 1: HMAC-SHA1", "Pattern 2: Multi-Value Encoding", "Pattern 3: Stdio Transport", "Pattern 4: Field Limiting"
@01-foundation/01-foundation-02-SUMMARY.md (will exist after Plan 02) — constrained types
</context>

<tasks>

<task type="auto">
  <name>T1: Implement HMAC-SHA1 signing function</name>
  <files>src/lib/freedcamp/auth/hmac.ts</files>
  <action>
Create `src/lib/freedcamp/auth/hmac.ts` — the HMAC-SHA1 signing utility:

```typescript
import { createHmac } from "crypto";

/**
 * Build HMAC-SHA1 auth params for Freedcamp API.
 *
 * Formula (confirmed from n8n io-auth-handler.json):
 *   hash = HMAC-SHA1(apiSecret, apiKey + timestamp).digest("hex")
 *   ORDER MATTERS: apiKey concatenated on LEFT of timestamp.
 */
export function buildAuthParams(apiKey: string, apiSecret: string): {
  api_key: string;
  timestamp: string;
  hash: string;
} {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hash = createHmac("sha1", apiSecret)
    .update(apiKey + timestamp) // apiKey on LEFT
    .digest("hex");
  return { api_key: apiKey, timestamp, hash };
}
```

Add a simple test at the bottom (under `if (require.main === module)`) that verifies the function runs without throwing and produces a 40-char hex hash.
</action>
  <wiring_checks>
    - file: src/lib/freedcamp/auth/hmac.ts
      pattern: "apiKey \\+ timestamp"
      description: "HMAC uses apiKey + timestamp order (NOT timestamp + apiKey)"
  </wiring_checks>
  <verify>tsx src/lib/freedcamp/auth/hmac.ts</verify>
  <done>buildAuthParams produces 40-char hex hash with correct formula</done>
</task>

<task type="auto">
  <name>T2: Implement centralized API client with GET/POST routing</name>
  <files>src/lib/freedcamp/api-client.ts</files>
  <action>
Create `src/lib/freedcamp/api-client.ts` — the centralized HTTP client:

```typescript
import { buildAuthParams } from "./auth/hmac";

const BASE_URL = "https://freedcamp.com/api/v1";

// ── Multi-value param encoding ───────────────────────────────────────────────

const ARRAY_NOTATION_FIELDS = new Set(["status", "assigned_to_id", "created_by_id"]);

function encodeParams(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      const keyName = `${key}[]`;
      for (const item of value) {
        parts.push(`${encodeURIComponent(keyName)}=${encodeURIComponent(String(item))}`);
      }
    } else if (ARRAY_NOTATION_FIELDS.has(key)) {
      // Force [] suffix even for single values on whitelist fields
      parts.push(`${encodeURIComponent(key + "[]")}=${encodeURIComponent(String(value))}`);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.join("&");
}

// ── Sort encoding ────────────────────────────────────────────────────────────

function encodeSort(order?: Record<string, "asc" | "desc">): string {
  if (!order) return "";
  const parts = Object.entries(order).map(([field, dir]) =>
    `order[${field}]=${dir}`
  );
  return parts.join("&");
}

// ── Response handling ────────────────────────────────────────────────────────

async function handleResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Freedcamp API error ${response.status}: ${text}`);
  }
  return response.json();
}

// ── API Client ───────────────────────────────────────────────────────────────

export interface FreedcampApiClient {
  request(opts: {
    method?: "GET" | "POST";
    path: string;
    params?: Record<string, unknown>;
    body?: Record<string, unknown>;
  }): Promise<unknown>;
  healthCheck(): Promise<boolean>;
}

export function createFreedcampApiClient(credentials: { apiKey: string; apiSecret: string }): FreedcampApiClient {
  const auth = () => buildAuthParams(credentials.apiKey, credentials.apiSecret);

  async function request(opts: {
    method?: "GET" | "POST";
    path: string;
    params?: Record<string, unknown>;
    body?: Record<string, unknown>;
  }): Promise<unknown> {
    const { method = "GET", path, params = {}, body } = opts;
    const authParams = auth();

    if (method === "GET") {
      // GET: all params (auth + filters) in URL query string
      const qsParts: string[] = [
        `api_key=${authParams.api_key}`,
        `timestamp=${authParams.timestamp}`,
        `hash=${authParams.hash}`,
      ];
      // Add sort params
      if (params.order) {
        qsParts.push(encodeSort(params.order as Record<string, "asc" | "desc">));
        const { order: _order, ...rest } = params;
        qsParts.push(encodeParams(rest));
      } else {
        qsParts.push(encodeParams(params));
      }
      const url = `${BASE_URL}${path}?${qsParts.join("&")}`;
      const response = await fetch(url);
      return handleResponse(response);
    } else {
      // POST: auth in query string, body as JSON
      const url = `${BASE_URL}${path}?api_key=${authParams.api_key}&timestamp=${authParams.timestamp}&hash=${authParams.hash}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? params),
      });
      return handleResponse(response);
    }
  }

  async function healthCheck(): Promise<boolean> {
    try {
      const result = await request({ path: "/api_key/check" });
      return result !== null && result !== undefined;
    } catch {
      return false;
    }
  }

  return { request, healthCheck };
}
```

Key behaviors:
- ALL fetch calls go through here — no direct fetch() in tool handlers
- GET: auth params + filter params all in query string
- POST: auth params in query string, body as JSON
- Multi-value: `status[]`, `assigned_to_id[]`, `created_by_id[]` use `[]` even for single values
- Sort: `order[field]=asc|desc` encoding
</action>
  <wiring_checks>
    - file: src/lib/freedcamp/api-client.ts
      pattern: "ARRAY_NOTATION_FIELDS"
      description: "Multi-value encoding with [] suffix for status/assigned_to_id/created_by_id"
    - file: src/lib/freedcamp/api-client.ts
      pattern: "api_key.*timestamp.*hash"
      description: "Auth params in query string for both GET and POST"
  </wiring_checks>
  <verify>npm run typecheck 2>&1 | grep -c "error"</verify>
  <done>api-client.ts is the single entry point for all Freedcamp API calls</done>
</task>

<task type="auto">
  <name>T3: Implement dot-notation field limiter and DI callbacks</name>
  <files>
    src/lib/freedcamp/utils/field-limiter.ts,
    src/lib/freedcamp/callbacks.ts
  </files>
  <action>
Create `src/lib/freedcamp/utils/field-limiter.ts`:

```typescript
/**
 * Extract specific fields from API response using dot-notation path walking.
 * e.g. fields=["id", "name", "projects.id"] returns only those fields per item.
 */

function getValueByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return null;
    if (Array.isArray(current)) {
      current = current.map((item) => getValueByPath(item, part));
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }
  return current;
}

export function applyFieldLimiting<T extends Record<string, unknown>>(
  items: T[],
  fields?: string[]
): Partial<T>[] {
  if (!fields || fields.length === 0) return items;
  return items.map((item) => {
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      (result as Record<string, unknown>)[field] = getValueByPath(item, field);
    }
    return result as Partial<T>;
  });
}
```

Create `src/lib/freedcamp/callbacks.ts` — the DI callbacks adapted for API-key-only:

```typescript
import type {
  McpServerCallbacks,
  McpPermissionChecker,
  McpApprovalRouter,
  McpAuditWriter,
  McpWriteGateResult,
} from "../../modules/mcp/types";
import type { FreedcampApiClient } from "./api-client";

/**
 * Permission checker — no-op for Phase 1.
 * Freedcamp API has no per-user permission model from the API key side.
 */
const noopPermissionChecker: McpPermissionChecker = async () => {
  return { needsApproval: false };
};

/**
 * Approval router — no-op (no approval flow in Freedcamp MCP).
 */
const noopApprovalRouter: McpApprovalRouter = async () => {
  return { pendingApprovalId: -1 };
};

/**
 * Audit writer — logs to stderr (no persistent store).
 */
const noopAuditWriter: McpAuditWriter = async (entry) => {
  process.stderr.write(`[audit] ${entry.tool} → ${entry.status} (${entry.durationMs}ms)\n`);
};

export function createFreedcampCallbacks(
  _apiClient: FreedcampApiClient
): McpServerCallbacks<void> {
  return {
    db: undefined, // TDb = void
    apiKeyValidator: async (rawKey, _companyId) => {
      // API key validated at boot via healthCheck() — no per-key resolution needed
      return { userId: 1, companyId: 1 };
    },
    permissionChecker: noopPermissionChecker,
    approvalRouter: noopApprovalRouter,
    auditWriter: noopAuditWriter,
  };
}
```

Note: `apiKeyValidator` is a no-op here since we validated at boot. The real validation happens in `scripts/mcp-server.ts` at startup via `apiClient.healthCheck()`.
</action>
  <wiring_checks>
    - file: src/lib/freedcamp/utils/field-limiter.ts
      pattern: "getValueByPath"
      description: "Dot-notation path walking implemented"
    - file: src/lib/freedcamp/callbacks.ts
      pattern: "permissionChecker.*noop|noopPermissionChecker"
      description: "No-op permission checker for Freedcamp"
  </wiring_checks>
  <verify>npm run typecheck 2>&1 | grep -c "error"</verify>
  <done>Field limiter and DI callbacks compile without TypeScript errors</done>
</task>

</tasks>

<verification>
- `npm run typecheck` passes with zero errors
- `buildAuthParams` from hmac.ts produces consistent 40-char hex hashes
- API client encodes multi-value params correctly (status[] even for single values)
- `applyFieldLimiting` correctly extracts nested fields with dot notation
</verification>

<success_criteria>
Centralized API client with correct HMAC-SHA1 auth, GET/POST routing, multi-value param encoding, and dot-notation field limiting. Health check verifies credentials. No direct fetch() anywhere.
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation/01-foundation-03-SUMMARY.md`
</output>