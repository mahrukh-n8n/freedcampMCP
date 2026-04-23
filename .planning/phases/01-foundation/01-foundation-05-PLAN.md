---
phase: 01-foundation
plan: 05
type: execute
wave: 1
depends_on: [01-foundation-04]
files_modified:
  - src/__tests__/api-client.test.ts
  - src/__tests__/hmac.test.ts
  - src/__tests__/field-limiter.test.ts
  - src/__tests__/tools.test.ts
  - vitest.config.ts
autonomous: true
transition_safety:
  safe: true
requirements:
  - AUTH-01
  - AUTH-03
  - AUTH-04
  - AUTH-07
  - API-01
  - API-02
  - API-03
  - API-04
  - API-05
  - API-06

must_haves:
  truths:
    - "HMAC signing produces consistent results (deterministic given same inputs)"
    - "Multi-value param encoding produces correct URL strings"
    - "Dot-notation field limiting extracts correct nested values"
    - "McpToolResult envelope is always returned, never thrown"
    - "Tool registration rejects duplicate tool names"
  artifacts:
    - path: "src/__tests__/hmac.test.ts"
      provides: "Unit tests for HMAC-SHA1 formula correctness"
    - path: "src/__tests__/api-client.test.ts"
      provides: "Unit tests for GET/POST routing and param encoding"
    - path: "src/__tests__/field-limiter.test.ts"
      provides: "Unit tests for dot-notation field extraction"
  key_links:
    - from: "src/__tests__/hmac.test.ts"
      to: "src/lib/freedcamp/auth/hmac.ts"
      via: "import and test buildAuthParams"
      pattern: "buildAuthParams"
    - from: "src/__tests__/api-client.test.ts"
      to: "src/lib/freedcamp/api-client.ts"
      via: "import and test encodeParams"
      pattern: "encodeParams"
---

<objective>
End-to-end integration test proving the full call path: HMAC signing → API client → tool handlers → stdio response. The test suite covers the critical paths identified in research (HMAC formula, multi-value encoding, field limiting, result envelope).

Purpose: Verify all foundation pieces work together before adding more tools.
Output: Vitest test suite in `src/__tests__/` covering hmac, api-client, field-limiter, and tool registration.
</objective>

<execution_context>
@~/.claude/get-shit-right/workflows/execute-plan.md
@~/.claude/get-shit-right/templates/summary.md
</execution_context>

<context>
@01-foundation/01-foundation-04-SUMMARY.md (will exist after Plan 04) — wired tools, full boot sequence
@.planning/01-foundation/01-RESEARCH.md — critical pitfalls to test against
</context>

<tasks>

<task type="auto">
  <name>T1: Set up Vitest test configuration</name>
  <files>vitest.config.ts</files>
  <action>
Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/lib/freedcamp/**/*.ts", "src/modules/mcp/**/*.ts"],
      exclude: ["src/__tests__/**"],
    },
  },
});
```

Add to `package.json` scripts:
- `"test": "vitest run"`
- `"test:watch": "vitest"`
- `"coverage": "vitest run --coverage"`

Run `npm install -D vitest @vitest/coverage-v8`.
</action>
  <verify>npm run test -- --run 2>&1 | head -5</verify>
  <done>Vitest installed and configured; test runner works without erroring</done>
</task>

<task type="auto">
  <name>T2: Write unit tests for HMAC and param encoding</name>
  <files>
    src/__tests__/hmac.test.ts,
    src/__tests__/api-client.test.ts
  </files>
  <action>
Create `src/__tests__/hmac.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildAuthParams } from "../lib/freedcamp/auth/hmac";
import { createHmac } from "crypto";

describe("HMAC-SHA1 signing", () => {
  it("produces a 40-character hex hash", () => {
    const params = buildAuthParams("test-key", "test-secret");
    expect(params.hash).toMatch(/^[a-f0-9]{40}$/);
  });

  it("uses apiKey + timestamp order (not timestamp + apiKey)", () => {
    const params = buildAuthParams("test-key", "test-secret");
    // Manually compute expected hash using confirmed formula
    const expected = createHmac("sha1", "test-secret")
      .update("test-key" + params.timestamp)
      .digest("hex");
    expect(params.hash).toBe(expected);
  });

  it("includes api_key, timestamp, and hash in result", () => {
    const params = buildAuthParams("key", "secret");
    expect(params).toHaveProperty("api_key", "key");
    expect(params).toHaveProperty("timestamp");
    expect(params).toHaveProperty("hash");
  });

  it("produces different hashes for different timestamps", async () => {
    const params1 = buildAuthParams("key", "secret");
    await new Promise((r) => setTimeout(r, 1100)); // wait > 1 second
    const params2 = buildAuthParams("key", "secret");
    expect(params1.hash).not.toBe(params2.hash);
    expect(params1.timestamp).not.toBe(params2.timestamp);
  });
});
```

Create `src/__tests__/api-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
// Test encodeParams and sort encoding by testing the client's behavior
// Since we can't call real API, mock fetch and test request construction

describe("API client request construction", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [], has_more: false, total_count: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("GET request includes all params in URL query string", async () => {
    const { createFreedcampApiClient } = await import("../lib/freedcamp/api-client");
    const client = createFreedcampApiClient({ apiKey: "k", apiSecret: "s" });
    await client.request({ path: "/projects", params: { limit: 10, offset: 0 } });
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("api_key=");
    expect(url).toContain("timestamp=");
    expect(url).toContain("hash=");
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=0");
  });

  it("multi-value status params use [] suffix", async () => {
    const { createFreedcampApiClient } = await import("../lib/freedcamp/api-client");
    const client = createFreedcampApiClient({ apiKey: "k", apiSecret: "s" });
    await client.request({ path: "/tasks", params: { "status[]": [0, 2] } });
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("status%5B%5D=0");
    expect(url).toContain("status%5B%5D=2");
  });

  it("sort params encode as order[field]=asc|desc", async () => {
    const { createFreedcampApiClient } = await import("../lib/freedcamp/api-client");
    const client = createFreedcampApiClient({ apiKey: "k", apiSecret: "s" });
    await client.request({ path: "/projects", params: { order: { name: "asc" } } });
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("order%5Bname%5D=asc");
  });
});
```
</action>
  <verify>npm run test -- --run 2>&1 | tail -20</verify>
  <done>HMAC and API client tests pass; fetch mock validates URL construction</done>
</task>

<task type="auto">
  <name>T3: Write unit tests for field limiting and tool registration</name>
  <files>
    src/__tests__/field-limiter.test.ts,
    src/__tests__/tools.test.ts
  </files>
  <action>
Create `src/__tests__/field-limiter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { applyFieldLimiting } from "../lib/freedcamp/utils/field-limiter";

describe("applyFieldLimiting", () => {
  it("returns all items when fields is empty", () => {
    const items = [{ id: 1, name: "A" }, { id: 2, name: "B" }];
    const result = applyFieldLimiting(items as Record<string, unknown>[], []);
    expect(result).toHaveLength(2);
  });

  it("extracts only requested fields", () => {
    const items = [{ id: 1, name: "Test", extra: "data" }];
    const result = applyFieldLimiting(items as Record<string, unknown>[], ["id", "name"]);
    expect(result[0]).toHaveProperty("id", 1);
    expect(result[0]).toHaveProperty("name", "Test");
    expect(result[0]).not.toHaveProperty("extra");
  });

  it("handles dot-notation for nested fields", () => {
    const items = [{ id: 1, projects: { id: 10, name: "Proj" } }];
    const result = applyFieldLimiting(items as Record<string, unknown>[], ["id", "projects.id", "projects.name"]);
    expect(result[0]).toHaveProperty("id", 1);
    expect(result[0]).toHaveProperty("projects");
    expect((result[0] as Record<string, unknown>).projects).toHaveProperty("id", 10);
    expect((result[0] as Record<string, unknown>).projects).toHaveProperty("name", "Proj");
  });

  it("handles arrays in response data", () => {
    const items = [
      { id: 1, tags: ["a", "b"] },
      { id: 2, tags: ["c", "d"] },
    ];
    const result = applyFieldLimiting(items as Record<string, unknown>[], ["id", "tags"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("tags", ["a", "b"]);
    expect(result[1]).toHaveProperty("tags", ["c", "d"]);
  });

  it("returns null for missing nested paths", () => {
    const items = [{ id: 1 }];
    const result = applyFieldLimiting(items as Record<string, unknown>[], ["id", "nonexistent.deep.field"]);
    expect(result[0]).toHaveProperty("id", 1);
    expect((result[0] as Record<string, unknown>)["nonexistent.deep.field"]).toBeNull();
  });
});
```

Create `src/__tests__/tools.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { toolRegistry } from "../modules/mcp/index";
import { registerFreedcampTools } from "../lib/freedcamp/register-tools";

describe("Tool registration", () => {
  beforeEach(() => {
    // Reset registry for each test (in case frozen)
    // Note: toolRegistry.freeze() is called at boot; tests run before that
  });

  it("registers all four tools without crashing", () => {
    registerFreedcampTools();
    const tools = toolRegistry.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("health_check");
    expect(names).toContain("project.list");
    expect(names).toContain("user.list");
    expect(names).toContain("user.current");
  });

  it("tool schemas validate with Zod", () => {
    registerFreedcampTools();
    const tools = toolRegistry.listTools();
    for (const tool of tools) {
      expect(() => tool.inputSchema.parse({})).not.toThrow();
    }
  });

  it("duplicate tool name throws", () => {
    registerFreedcampTools();
    expect(() => registerFreedcampTools()).toThrow();
  });
});
```

Note: The duplicate registration test should be last (or the registry reset between tests). Since toolRegistry.freeze() is only called at boot (not in tests), re-registering should throw.
</action>
  <verify>npm run test -- --run 2>&1 | tail -20</verify>
  <done>Field limiter and tool registration tests pass</done>
</task>

</tasks>

<verification>
- `npm run test -- --run` exits with code 0 (all tests pass)
- `npm run typecheck` passes with zero errors
- Coverage report generated (even if minimal at this stage)
</verification>

<success_criteria>
Test suite runs cleanly with all tests passing. HMAC formula, param encoding, field limiting, and tool registration are verified by unit tests. No TypeScript errors.
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation/01-foundation-05-SUMMARY.md`
</output>