# Freedcamp MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) server that wraps the [Freedcamp](https://freedcamp.com) REST API. It lets any MCP-compatible LLM client (Claude Code, Claude Desktop, etc.) manage Freedcamp projects, tasks, users, and comments through natural language.

## Features

- **17 tools** covering projects, tasks, users, comments, and health checks
- **HMAC-SHA1 authentication** — the API secret never leaves the server; only a signed hash is sent per request
- **Name resolution** — pass user names, emails, or project names instead of raw numeric IDs; the server resolves them automatically with TTL-based caching
- **Field limiting** — request only the fields you need with dot-notation (`id,title,comments.created_ts`) to reduce response size
- **Status label mapping** — accept human-readable strings like `"in progress"` instead of numeric codes
- **Response filtering** — internal API fields are automatically stripped from responses
- **Graceful shutdown** — drains in-flight requests before exiting
- **Retry + backoff** — retries on 429 and 5xx with exponential backoff
- **No build step** — runs TypeScript directly via tsx

## Prerequisites

- Node.js >= 18
- A Freedcamp account with API credentials (Settings → API)

## Installation

```bash
git clone https://github.com/mahrukh-n8n/freedcampMCP.git
cd freedcampMCP
npm install
```

## Configuration

### Option A: .env file

```bash
cp .env.example .env
# Edit .env with your Freedcamp API key and secret
```

### Option B: Claude Code MCP settings

No `.env` file needed — pass credentials as environment variables:

```bash
claude mcp add freedcamp npx tsx /path/to/freedcampMCP/scripts/mcp-server.ts \
  -e FREEDCAMP_API_KEY=your_key \
  -e FREEDCAMP_API_SECRET=your_secret
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `FREEDCAMP_API_KEY` | Yes | — | Freedcamp API key |
| `FREEDCAMP_API_SECRET` | Yes | — | Freedcamp API secret |
| `FREEDCAMP_API_URL` | No | `https://freedcamp.com` | Base URL (for self-hosted) |
| `LOG_LEVEL` | No | `info` | Log level: debug, info, warn, error |
| `REQUEST_TIMEOUT_MS` | No | `30000` | HTTP request timeout (ms) |
| `CACHE_TTL_MS` | No | `60000` | Name resolution cache TTL (ms) |
| `MAX_CONCURRENT_REQUESTS` | No | `6` | Max concurrent API requests |

## Running

### With Claude Code (recommended)

After adding the MCP server with `claude mcp add`, just start a conversation. Claude will call tools automatically when needed.

### With MCP Inspector

```bash
npx @modelcontextprotocol/inspector npx tsx scripts/mcp-server.ts
```

Opens a browser UI where you can call each tool and inspect responses.

### Direct (stdio)

```bash
npx tsx scripts/mcp-server.ts
```

The server listens on stdin/stdout using the MCP stdio transport. The host process (Claude Code, Claude Desktop) manages its lifecycle.

## Tools

### Health

| Tool | Description |
|---|---|
| `health.check` | Verify API credentials and connection status |

### Projects

| Tool | Write | Description |
|---|---|---|
| `project.list` | | List projects (paginated, sortable, field-limitable) |
| `project.get` | | Get project by ID or name |
| `project.create` | Yes | Create a project (name, description, color, group, members) |
| `project.update` | Yes | Update project fields (partial update) |

### Tasks

| Tool | Write | Description |
|---|---|---|
| `task.list` | | List tasks with filters (assignee, status, date range, search, tags) |
| `task.get` | | Get task by ID with comments and tag detail; injects `task_url` |
| `task.create` | Yes | Create task (status labels accepted, file attachments) |
| `task.update` | Yes | Update task fields (partial update, file attachments) |
| `task.delete` | Yes | Delete a task |
| `task.assign` | Yes | Assign users to a task |

### Users

| Tool | Write | Description |
|---|---|---|
| `user.list` | | List users (optionally filter by project) |
| `user.get` | | Get user by ID, email, or name |
| `user.current` | | Get authenticated user's profile |
| `user.create` | Yes | Create user (email, password, first_name, OAuth) |
| `user.update_current` | Yes | Update authenticated user's profile |

### Comments

| Tool | Write | Description |
|---|---|---|
| `comment.add` | Yes | Add a comment (requires item_id + app_id) |
| `comment.update` | Yes | Update comment text |
| `comment.delete` | Yes | Delete a comment |

## Name Resolution

Most ID parameters accept names, emails, or numeric IDs. Examples:

- `project_id: "Marketing"` — resolves to the project's numeric ID
- `assigned_to_id: "alice@example.com"` — resolves to the user's numeric ID
- `assigned_to_id: ["Alice", 42]` — mixed lists accepted

Resolution results are cached with a configurable TTL (`CACHE_TTL_MS`).

## Status Mapping

Task status accepts both numeric codes and string labels:

| Code | Label |
|---|---|
| 0 | not started |
| 1 | in progress |
| 2 | completed |

Example: `status: "in progress"` is equivalent to `status: 1`.

## Field Limiting

All list and get tools accept a `fields` parameter with dot-notation paths:

```
fields="id,title,priority,comments.created_ts"
```

This reduces response size and focuses the LLM on relevant data. Nested arrays are preserved — `comments.created_ts` on `[{created_ts: 1}]` yields `[{created_ts: 1}]`, not a flat list.

## App ID Constants (for comments)

| App | ID |
|---|---|
| tasks | 2 |
| milestones | 3 |
| discussions | 5 |
| files | 6 |
| time | 8 |
| issue_tracker | 9 |

## Authentication

The server uses **HMAC-SHA1** authentication. On every request:

1. A Unix timestamp is generated
2. A hash is computed: `HMAC-SHA1(secret, apiKey + timestamp)`
3. Auth params are sent as query string: `?api_key=...&timestamp=...&hash=...`

The **secret never goes over the wire**. At boot, the server validates credentials with `GET /api_key/check`.

## Error Codes

| Code | Meaning |
|---|---|
| `PERMISSION_DENIED` | Invalid API key/secret or insufficient access |
| `NOT_FOUND` | Requested resource or name resolution target does not exist |
| `VALIDATION_ERROR` | Invalid input parameters |
| `CONFLICT` | Resource already exists |
| `INTERNAL_ERROR` | Server error, rate limit, or network failure |

## Development

```bash
# Type check
npx tsc --noEmit

# Run tests
npx vitest run

# Watch mode
npx vitest

# Run server in dev mode
npm run dev
```

## Testing

The test suite uses Vitest with mocked API responses:

```bash
npx vitest run           # Single run
npx vitest               # Watch mode
npx vitest --coverage    # With coverage
```

## Project Structure

```
scripts/mcp-server.ts              Entry point
src/lib/freedcamp/
  api-client.ts                    HTTP client with HMAC auth, retry, filtering
  register-tools.ts                Wire all tools to the MCP registry
  auth/hmac.ts                     HMAC-SHA1 computation
  auth/hmac-validator.ts           Boot-time credential validation
  tools/
    health.ts                      health.check
    projects.ts                    project.list/get/create/update
    tasks.ts                       task.list/get/create/update/delete/assign
    users.ts                       user.list/get/current/create/update_current
    comments.ts                    comment.add/update/delete
  utils/
    name-resolver.ts               Name/email → ID resolution with caching
    response-filter.ts             Strip internal fields from API responses
    field-limiter.ts               Dot-notation field extraction
    date-utils.ts                  Date validation and formatting
    resolution-cache.ts            TTL-based LRU cache
    logger.ts                      Structured logging with verbose mode
    validation.ts                  Input validation helpers
src/modules/mcp/
  registry/tool-registry.ts        MCP tool registry
  services/create-mcp-server.ts    MCP server factory
  services/stdio-transport.ts      Stdio transport
  types.ts                         MCP result types
  utils/serialize.ts               Result envelope helpers (dataResult, commitResult, etc.)
```

## License

MIT