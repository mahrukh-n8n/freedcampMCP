# Freedcamp API Quick Reference (from n8n AI Agent prompt)

This is the complete API reference embedded in the n8n AI agent's system prompt.

## USERS

### GET
- `/users` — List visible users. Filter: `{ project_id }`
- `/users/current` — Current user profile
- `/users/{id}` — Specific user profile (email may be null due to privacy)

### POST
- `/users` — Create user. Required: `email*`, `password*`, `first_name*`. Optional: `last_name`, `oauth_provider`, `oauth_access_token`, `mobile_app_version`. Avatar via multipart `avatar` field.
- `/users/current` — Update profile. Required: `first_name*`. Optional: `email`, `password`, `confirmation_password`, `last_name`, `timezone`

### DELETE
- `/users/{id}` — Not supported. Use: `POST /wipe/current { "password" }`

Search: No. Filters: project_id. Sort: No.

## PROJECTS

### GET
- `/projects` — List accessible projects. Filter: `{ f_recent_projects_ids=1 }`
- `/projects/{id}` — Single project detail. Option: `?f_for_overview_app=1`

### POST
- `/projects` — Create project. Required: `project_name*`. Optional: `project_description`, `project_color`, `todo_view_type`, `group_id`/`group_name`, `f_first`, `changed_users`
- `/projects/{id}` — Update project. Required: `project_name*`. Optional: all POST fields + `changed_users`

### DELETE
- `/projects/{id}` — Not publicly supported

Search: No. Filters: f_recent_projects_ids. Sort: No.

## TASKS

### GET
- `/tasks` — List tasks
- `/tasks/{id}` — Single task with full metadata

Filters: `search`, `project_id`, `task_group_id`, `milestone_id`, `status[]`, `assigned_to_id[]`, `created_by_id[]`, `due_date[from|to]`, `created_date[from|to]`, `f_with_archived`, `lists_status`, `f_cf`: 1

Sort Keys: `priority`, `due_date`

### POST
- `/tasks` — Create task. Required: `title*`, `project_id*`. Optional: `task_group_id`, `description`, `priority`, `assigned_to_id`, `start_date`, `due_date`, `r_rule`, `attached_ids`, `h_parent_id`, `cf_tpl_id`, `custom_fields[]`
- `/tasks/{id}` — Update task (same fields)

### DELETE
- `/tasks/{id}` — Delete task

### Important Notes
- Tags are a separate array in `/tasks` (not in `/tasks/{id}`). Shows only tag IDs.
- `f_include_tags=1` is mandatory for all GET under `/tasks` endpoint (not `/tasks/{id}`)
- `f_include_tr_data=1` gets tag details (only works with `/tasks/{id}`) — returns tags array with `{ id, title, owner_id, usages_count }`
- Comments only available via `GET /tasks/{id}` in the `comments` array
- Task status codes: 0=Not Started, 1=Completed, 2=In Progress

## COMMENTS

### POST
- `/comments` — Add comment. Required: `item_id*`, `app_id*`, `description*`. Optional: `attached_ids[]`
- `/comments/{id}` — Update comment. Required: `description*`

### DELETE
- `/comments/{id}` — Delete comment

### GET
- Not a standalone endpoint. Use: `GET /tasks/{id}` → returns `comments` array

## APP ID REFERENCE (for /comments)
- 2 = Tasks
- 3 = Milestones
- 5 = Discussions
- 6 = Files
- 8 = Time
- 9 = Issue Tracker

## MULTI-VALUE PARAMETER RULES
These fields REQUIRE array notation even for single values:
- `assigned_to_id[]`
- `status[]`
- `created_by_id[]`

Regular fields that DO NOT use array notation:
- `project_id`, `task_group_id`, `milestone_id`, `search`, `f_include_tags`
- `due_date[from]`, `due_date[to]`, `created_date[from]`, `created_date[to]`

## PAGINATION
- `limit` (default 200, max 200)
- `offset` (start index)
- `order[field]=asc|desc`
- meta includes `has_more`, `total_count`

## ERROR STATUS CODES
- 200 OK
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 422 Validation Error
- 5xx Server Error (retry after delay)