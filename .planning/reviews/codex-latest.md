**Findings**

1. **CRITICAL: `task.create` and `task.update` still do not support `attached_ids`.**  
   The schemas and request bodies omit the field entirely, so `TASK-03` / `TASK-04` remain unimplemented. See [src/lib/freedcamp/tools/tasks.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/tasks.ts:202) and [src/lib/freedcamp/tools/tasks.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/tasks.ts:258).

2. **MAJOR: name resolution is still not wired into all user-ID inputs.**  
   Iteration 1 added resolver infrastructure, but task handlers still pass raw numeric arrays/values for `assigned_to_id`, `created_by_id`, and `user_id` without calling `resolveUserId()`. This leaves the previously reported gap unresolved for `task.list`, `task.create`, `task.update`, and `task.assign`. See [src/lib/freedcamp/tools/tasks.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/tasks.ts:30), [src/lib/freedcamp/tools/tasks.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/tasks.ts:208), [src/lib/freedcamp/tools/tasks.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/tasks.ts:265), [src/lib/freedcamp/tools/tasks.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/tasks.ts:343).

3. **MAJOR: `task.get` still requires `project_id`, so `TASK-02` is not met.**  
   The schema makes `project_id` mandatory and the handler refuses to proceed without resolving it first. That is still stricter than “get by ID only.” See [src/lib/freedcamp/tools/tasks.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/tasks.ts:137).

4. **MAJOR: `task.list` still makes `project_id` mandatory, so `TASK-01` is not met.**  
   The schema and handler require a project lookup up front instead of treating it as an optional filter. See [src/lib/freedcamp/tools/tasks.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/tasks.ts:26) and [src/lib/freedcamp/tools/tasks.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/tasks.ts:67).

5. **MAJOR: date filter encoding is still likely wrong for the Freedcamp API.**  
   The task API parameters are emitted as flat keys like `due_date_from` / `created_date_to`, while the transport only knows scalar keys and `[]` arrays. It cannot encode bracketed shapes like `due_date[from]` / `created_date[to]` at all because nested objects are skipped in `encodeAllParams()`. If Freedcamp expects bracket notation, these filters still do not work. See [src/lib/freedcamp/tools/tasks.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/tasks.ts:39), [src/lib/freedcamp/tools/tasks.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/tasks.ts:93), and [src/lib/freedcamp/api-client.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/api-client.ts:221).

6. **MAJOR: `project.list` still uses the wrong `f_recent_projects_ids` shape.**  
   The schema describes a comma-separated list of IDs and forwards it verbatim, which does not match the previously identified Freedcamp-style filter flag behavior. See [src/lib/freedcamp/tools/projects.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/projects.ts:12).

7. **MAJOR: `project.create` and `project.update` still miss `f_first` and `changed_users`.**  
   Those roadmap-required fields are absent from both schemas and request bodies. See [src/lib/freedcamp/tools/projects.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/projects.ts:82) and [src/lib/freedcamp/tools/projects.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/projects.ts:116).

8. **MAJOR: `user.create` still misses `oauth_provider` and `oauth_access_token`.**  
   The tool still exposes unrelated membership/admin fields instead of the required OAuth inputs. See [src/lib/freedcamp/tools/users.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/users.ts:92).

9. **MAJOR: `user.update_current` still does not require `first_name`.**  
   The schema leaves it optional, so `USER-05` is still not satisfied. See [src/lib/freedcamp/tools/users.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/users.ts:134).

10. **MAJOR: write tools still return read-style `kind: "data"` envelopes.**  
    `client.request()` always returns `dataResult()`, so successful POST/PUT/DELETE operations never use `commitResult()` or any other write-style envelope. See [src/lib/freedcamp/api-client.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/api-client.ts:193) and [src/modules/mcp/utils/serialize.ts](/home/mahrukh/coding/freedcampMCP/src/modules/mcp/utils/serialize.ts:88).

11. **MAJOR: `AUTH-06` CLI arg support is still missing.**  
    Boot only reads `FREEDCAMP_API_KEY` / `FREEDCAMP_API_SECRET` from env and never inspects `process.argv`. See [scripts/mcp-server.ts](/home/mahrukh/coding/freedcampMCP/scripts/mcp-server.ts:13).

12. **MAJOR: `task_url` injection now bypasses field limiting.**  
    `filterResponse()` applies field limiting inside `client.request()`, but `task.list` and `task.get` mutate the already-filtered payload afterward and always append `task_url`. A caller requesting a narrow field set still receives this extra field, so the fix for `TASK-10` introduced a field-limiting regression. See [src/lib/freedcamp/tools/tasks.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/tasks.ts:117) and [src/lib/freedcamp/tools/tasks.ts](/home/mahrukh/coding/freedcampMCP/src/lib/freedcamp/tools/tasks.ts:173).

**Resolved from iteration 1**

The following previously identified issues do appear resolved in the current source:

- `task.list` now injects `task_url`.
- `response-filter` strips internal fields recursively through nested objects/arrays.
- `field-limiter` reconstructs nested object structure from dot notation.
- `user.get` description now reflects name/email support.
- Status mapping is deduplicated into the resolver module.
- `ResolutionCache` is integrated into name resolution.
- `filterResponse` is wired into the API client.

So the codebase is improved, but it is **not clean yet**. The 12 issues above remain.