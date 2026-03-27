# Scheduler Skill

## Purpose
Create, list, edit, and delete scheduled tasks that run automatically on the server.

## When to use
- User wants to schedule something to happen automatically (e.g. "schedule a ping every day")
- User wants to see what tasks are scheduled
- User wants to remove a scheduled task
- User asks about task status or history

## API Base URL
`https://scheduler-ping-skills.vercel.app`

## Guardrails

- **Confirmation on create/delete** — Before creating or deleting a task, show the user exactly what will happen and ask them to confirm before executing.
- **Minimum interval** — If the user requests a schedule more frequent than once per day, warn them: "Schedules more frequent than once per day are not supported. Would you like to use a daily schedule instead?"
- **Valid skill names only** — Only accept task types that have a corresponding SKILL.md file in the project. Known skills: `ping`. If the user requests an unknown type, ask them for the skill name, then look for a matching SKILL.md file (e.g. `<skill_name>/SKILL.md`). If the file exists, read its Required Parameters section and proceed. If it does not exist, reject the request and list the available skills.
- **Report errors honestly** — If an API call fails (network error, non-2xx status, timeout), report the exact error to the user. Never claim a task was created, edited, or deleted unless you received a successful response. Hallucinated successes are worse than reported failures.

## Methods

### List Tasks
**When:** User asks "what's scheduled?", "show my tasks", "did my ping run?"
**Request:** GET /api/tasks
**Response:** Array of task objects with id, type, params, schedule, status, last_run

Present results as a readable summary:
- Task name/type
- Schedule
- Last run time and status
- Parameters

### Create Task
**When:** User asks to schedule something (e.g. "schedule a ping every day")
**Request:** POST /api/tasks
**Headers:** Content-Type: application/json
**Body:**
```json
{
  "type": "<skill_type>",
  "params": { ... },
  "schedule": "daily"
}
```

**Task types:** Any skill with a `<skill_name>/SKILL.md` file can be scheduled. To find the required params for a task type, read the corresponding skill's `Required Parameters` section.

Known skills:
- `ping` — See `ping/SKILL.md`

If the user requests a type not listed above, look for `<skill_name>/SKILL.md`. If it exists, use it. If not, reject and list available skills.

**Behavior:**
1. Determine the task type from what the user wants to schedule
2. Read the corresponding skill's Required Parameters to know what to collect
3. Gather required params (ask user if missing)
4. Create the task via POST
5. Confirm to the user what was scheduled

### Edit Task
**When:** User asks to update/change/edit a scheduled task (e.g. "change the webhook URL", "update my name on that ping")
**Request:** PUT /api/tasks?id=<task_id>
**Headers:** Content-Type: application/json
**Body:** Only include the fields to update. Any combination of these is valid:
```json
{
  "params": { "<key>": "<value>" },
  "schedule": "<new_schedule>",
  "status": "active"
}
```
The `params` object is merged with the existing params — you only need to send the keys that are changing, not the full params object.

**Behavior:**
1. If user doesn't specify which task, first list tasks (GET) and ask which to edit
2. Ask the user what they want to change
3. Send only the changed fields via PUT
4. Confirm the update to the user

### Delete Task
**When:** User asks to remove/cancel/stop a scheduled task
**Request:** DELETE /api/tasks?id=<task_id>

**Behavior:**
1. If user doesn't specify which task, first list tasks (GET) and ask which to delete
2. Delete the task
3. Confirm deletion

## Structured Output

When executing in automated mode (via Claude API), responses must follow this schema:

```json
{
  "action": "create" | "list" | "edit" | "delete",
  "task_id": "<id, required for edit/delete>",
  "task": {
    "type": "<skill_type>",
    "params": { ... },
    "schedule": "daily" | "weekly" | "hourly"
  },
  "status": "success" | "failed" | "error" | "rejected",
  "error": "<error message, only if status is failed/error/rejected>"
}
```

Reject any response that does not match this schema before acting on it.

## Example Interactions

**User:** "Schedule a ping to https://webhook.site/abc every day with my name Jane Doe"
→ POST /api/tasks with {"type": "ping", "params": {"webhook_url": "https://webhook.site/abc", "name": "Jane Doe"}, "schedule": "daily"}
→ "Done! Scheduled a daily ping to that webhook with your name."

**User:** "What tasks are running?"
→ GET /api/tasks
→ "You have 2 scheduled tasks:
   1. Ping to webhook.site/abc (daily) — last ran today at 4:00 PM PST, successful
   2. Ping to webhook.site/xyz (daily) — hasn't run yet"

**User:** "Change my name on the daily ping to John Smith"
→ First, GET /api/tasks to find the ping task
→ PUT /api/tasks?id=<id> with {"params": {"name": "John Smith"}}
→ "Updated! The daily ping will now use the name John Smith."

**User:** "Stop the second ping"
→ DELETE /api/tasks?id=<id>
→ "Removed the ping to webhook.site/xyz."
