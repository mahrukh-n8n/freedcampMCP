# Freedcamp MCP Server

A Model Context Protocol (MCP) server for the Freedcamp project management API. Enables LLMs to manage tasks, projects, users, and comments through Freedcamp.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` from the example:
   ```bash
   cp .env.example .env
   # Edit .env with your Freedcamp API key and secret
   ```

3. Run the server:
   ```bash
   npm start
   ```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `FREEDCAMP_API_KEY` | Yes | — | Freedcamp API key |
| `FREEDCAMP_API_SECRET` | Yes | — | Freedcamp API secret |
| `FREEDCAMP_API_URL` | No | `https://freedcamp.com` | Base URL (for self-hosted) |
| `LOG_LEVEL` | No | `info` | Log level: debug, info, warn, error |
| `REQUEST_TIMEOUT_MS` | No | `30000` | HTTP request timeout (ms) |
| `CACHE_TTL_MS` | No | `60000` | Name resolution cache TTL (ms) |
| `MAX_CONCURRENT_REQUESTS` | No | `6` | Max concurrent API requests |

## Available Tools

### Health
- `health.check` — Verify API credentials and connection

### Projects
- `project.list` — List projects (paginated, sortable)
- `project.get` — Get project by ID or name, with field limiting
- `project.create` — Create a new project
- `project.update` — Update project fields (partial update)

### Tasks
- `task.list` — List tasks with full filters (status, assignee, date range, search, tags)
- `task.get` — Get task by ID with comments and tag detail, includes task_url
- `task.create` — Create task (accepts string status labels or numeric codes)
- `task.update` — Update task fields (partial update)
- `task.delete` — Delete a task
- `task.assign` — Assign users to a task

### Users
- `user.list` — List users (optionally filter by project_id)
- `user.get` — Get user by ID
- `user.current` — Get authenticated user's profile
- `user.create` — Create a new user
- `user.update_current` — Update authenticated user's profile

### Comments
- `comment.add` — Add a comment (requires item_id + app_id)
- `comment.update` — Update comment text
- `comment.delete` — Delete a comment

## Status Mapping

Task status accepts both numeric codes and string labels:

| Code | Label |
|---|---|
| 0 | not started |
| 1 | in progress |
| 2 | completed |

## App ID Constants (for comments)

| App | ID |
|---|---|
| tasks | 2 |
| milestones | 3 |
| discussions | 5 |
| files | 6 |
| time | 8 |
| issue_tracker | 9 |

## Field Limiting

All list and get tools accept a `fields` parameter with dot-notation paths:

```
fields="id,title,priority,comments.created_ts"
```

This reduces response size and focuses the LLM on relevant data.

## Error Codes

| Code | Meaning |
|---|---|
| `PERMISSION_DENIED` | Invalid API key/secret or insufficient access |
| `NOT_FOUND` | Requested resource does not exist |
| `VALIDATION_ERROR` | Invalid input parameters |
| `CONFLICT` | Resource already exists |
| `INTERNAL_ERROR` | Server error or rate limit exceeded |

## Development

```bash
# Type check
npx tsc --noEmit

# Run tests
npx vitest run

# Watch mode
npx vitest

# Run server in dev mode
npx tsx scripts/mcp-server.ts
```

## Testing

The test suite uses Vitest. All tests are unit tests that mock the API layer:

```bash
npx vitest run       # Single run
npx vitest           # Watch mode
npx vitest --coverage  # With coverage
```

## License

MIT