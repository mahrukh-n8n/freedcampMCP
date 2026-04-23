# Developer Guide

## Architecture

```
src/
├── modules/mcp/          # Portable MCP framework (framework-agnostic)
│   ├── registry/         # Tool registry (freeze after registration)
│   ├── services/         # Server creation and stdio transport
│   ├── types.ts          # McpToolResult, McpToolResultKind, error codes
│   └── utils/serialize.ts # dataResult, errorResult, serializeDeep
├── lib/freedcamp/        # Freedcamp-specific application code
│   ├── auth/             # HMAC-SHA1 signing and key validation
│   ├── tools/            # Tool handlers (one file per domain)
│   ├── utils/            # Shared utilities
│   │   ├── field-limiter.ts  # Dot-notation field extraction
│   │   ├── response-filter.ts # Internal field stripping
│   │   ├── name-resolver.ts  # Name→ID resolution
│   │   ├── resolution-cache.ts # TTL-based name→ID cache
│   │   ├── logger.ts     # Structured logging (LOG_LEVEL env)
│   │   ├── date-utils.ts # Freedcamp date format parsing
│   │   └── validation.ts # Email validation
│   ├── api-client.ts     # HTTP client with HMAC auth, retry, pagination
│   ├── callbacks.ts      # DI callbacks for the MCP framework
│   ├── register-tools.ts # Wires all tools to the registry
│   └── types.ts          # Freedcamp-specific types (TDb = void)
scripts/
└── mcp-server.ts         # Entry point: boot → validate → register → stdio
```

## Adding a New Tool

1. **Create handler file**: `src/lib/freedcamp/tools/{domain}.ts`
   - Define Zod schema: `export const myToolSchema = z.object({...})`
   - Create handler factory: `export function createMyToolHandler(client) { ... }`
   - Handler signature: `(ctx: unknown, input: unknown) => Promise<McpToolResult>`

2. **Register**: Add to `src/lib/freedcamp/register-tools.ts`
   - Import schema and handler
   - Call `toolRegistry.register({ name, description, inputSchema, ... })`

3. **Test**: Add unit test in `src/__tests__/`

## Tool Handler Pattern

```typescript
export function createMyHandler(client: FreedcampApiClient) {
  return async (_ctx: unknown, rawInput: unknown): Promise<McpToolResult> => {
    const input = rawInput as MyInputType;

    return client.request("/endpoint", {
      method: "GET",  // or "POST", "PUT", "DELETE"
      params: { ... },    // query params (GET)
      body: { ... },      // body params (POST/PUT)
      pagination: { limit, offset },
      sort: { field: "asc" },
      fields: input.fields,
    });
  };
}
```

## Name Resolution

The name resolver allows tools to accept human-readable names instead of IDs:

- `resolveProjectId(client, "Project Alpha")` → `{ id: 123, ... }`
- `resolveUserId(client, "alice@example.com")` → `{ id: 456, ... }`
- `resolveStatus("in progress")` → `1`

Resolution is cached with configurable TTL (`CACHE_TTL_MS`).

## Extending the Name Resolver

1. Add a new resolver function to `src/lib/freedcamp/utils/name-resolver.ts`
2. Follow the pattern: numeric → direct return, string → API lookup + cache
3. Integrate into the tool handler before the API call

## Testing Strategy

- **Unit tests**: Mock the API client, test handler logic
- **Utility tests**: Test pure functions (HMAC, field limiter, date utils, etc.)
- **Integration tests**: Test the full dispatch loop with real tool definitions
- All tests run via `npx vitest run`

## Error Handling

All tool handlers return `McpToolResult` with structured error codes:

```typescript
return {
  ok: false,
  kind: "data",
  error: "Human-readable message",
  errorCode: "NOT_FOUND"  // one of the McpErrorCode union
};
```

## Portability

The `src/modules/mcp/` directory is **framework-agnostic**. It must never import from `src/lib/freedcamp/`. All app-specific behavior flows through injected callbacks.

## HMAC Authentication

Every API request is signed with HMAC-SHA1:
```
hash = HMAC-SHA1(secret, apiKey + timestamp)
```

The `buildAuthParams` function generates `api_key`, `timestamp`, and `hash` query parameters.