# Scheduler + Ping Skills Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build two Claude Skills (Scheduler, Ping) backed by a Vercel app with KV storage and a daily cron that pings a webhook.

**Architecture:** Vercel serverless functions expose a tasks CRUD API. Vercel KV stores task definitions. A daily cron reads active tasks and executes them (POSTs to webhooks). Two SKILL.md files teach Claude.ai how to interact with the API and ping webhooks directly.

**Tech Stack:** Node.js, Vercel serverless functions, Vercel KV (@vercel/kv), vercel.json cron config

---

### Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `vercel.json`
- Create: `.gitignore`

**Step 1: Initialize package.json**

```json
{
  "name": "scheduler-ping-skills",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "@vercel/kv": "^2.0.0"
  }
}
```

**Step 2: Create vercel.json with daily cron**

```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "30 0 * * *"
    }
  ]
}
```

This runs `/api/cron` at 12:30 AM UTC (4:30 PM PST) every day.

**Step 3: Create .gitignore**

```
node_modules/
.vercel/
.env
.env.local
SETUP.md
```

**Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated

**Step 5: Commit**

```bash
git init
git add package.json package-lock.json vercel.json .gitignore
git commit -m "chore: project setup with vercel config and kv dependency"
```

---

### Task 2: Tasks API — Create and List

**Files:**
- Create: `api/tasks.js`

**Step 1: Write the tasks API**

`api/tasks.js` handles GET (list), POST (create), DELETE by query param. Uses Vercel KV.

```js
import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const tasks = (await kv.get("tasks")) || [];
    return res.status(200).json(tasks);
  }

  if (req.method === "POST") {
    const { type, params, schedule } = req.body;

    if (!type || !params || !schedule) {
      return res.status(400).json({ error: "Missing required fields: type, params, schedule" });
    }

    const task = {
      id: randomUUID(),
      type,
      params,
      schedule,
      status: "active",
      last_run: null,
      created_at: new Date().toISOString(),
    };

    const tasks = (await kv.get("tasks")) || [];
    tasks.push(task);
    await kv.set("tasks", tasks);

    return res.status(201).json(task);
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: "Missing task id" });
    }

    const tasks = (await kv.get("tasks")) || [];
    const filtered = tasks.filter((t) => t.id !== id);

    if (filtered.length === tasks.length) {
      return res.status(404).json({ error: "Task not found" });
    }

    await kv.set("tasks", filtered);
    return res.status(200).json({ deleted: id });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
```

**Step 2: Test locally with curl (after `vercel dev`)**

Run: `npx vercel dev`

Then in another terminal:

```bash
# Create a task
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"type":"ping","params":{"webhook_url":"https://webhook.site/test","name":"Fake Name"},"schedule":"daily"}'

# List tasks
curl http://localhost:3000/api/tasks
```

Expected: POST returns the created task with an id. GET returns an array with that task.

**Step 3: Test delete**

```bash
curl -X DELETE "http://localhost:3000/api/tasks?id=<id-from-previous-step>"
curl http://localhost:3000/api/tasks
```

Expected: DELETE returns `{ "deleted": "<id>" }`. GET returns empty array.

**Step 4: Commit**

```bash
git add api/tasks.js
git commit -m "feat: tasks CRUD API with Vercel KV storage"
```

---

### Task 3: Cron Endpoint

**Files:**
- Create: `api/cron.js`

**Step 1: Write the cron handler**

`api/cron.js` reads all active tasks from KV, executes ping tasks, updates last_run. Also seeds a default task if none exist.

```js
import { kv } from "@vercel/kv";

const SEED_TASK = {
  id: "seed-ping",
  type: "ping",
  params: {
    webhook_url: "WEBHOOK_URL_HERE",
    name: "Fake Name",
  },
  schedule: "daily",
  status: "active",
  last_run: null,
  created_at: "2026-03-27T00:00:00Z",
};

async function executePing(params) {
  const payload = {
    name: params.name,
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(params.webhook_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return response.ok;
}

export default async function handler(req, res) {
  // Verify cron secret in production (Vercel sends this header)
  // const authHeader = req.headers["authorization"];
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return res.status(401).json({ error: "Unauthorized" });
  // }

  let tasks = (await kv.get("tasks")) || [];

  // Seed default task if empty
  if (!tasks.find((t) => t.id === "seed-ping")) {
    tasks.push(SEED_TASK);
    await kv.set("tasks", tasks);
  }

  const results = [];

  for (const task of tasks) {
    if (task.status !== "active") continue;

    if (task.type === "ping") {
      const success = await executePing(task.params);
      task.last_run = new Date().toISOString();
      task.last_status = success ? "success" : "failed";
      results.push({ id: task.id, type: task.type, success });
    }
  }

  await kv.set("tasks", tasks);

  return res.status(200).json({ executed: results.length, results });
}
```

**Step 2: Test locally**

Run: `curl http://localhost:3000/api/cron`

Expected: Returns `{ "executed": 1, "results": [{ "id": "seed-ping", "type": "ping", "success": true }] }` (will fail if webhook URL is placeholder — that's fine for now)

**Step 3: Commit**

```bash
git add api/cron.js
git commit -m "feat: cron endpoint with seed task and ping execution"
```

---

### Task 4: Ping SKILL.md

**Files:**
- Create: `ping/SKILL.md`

**Step 1: Write the Ping skill**

```markdown
# Ping Skill

## Purpose
Send a POST request to a webhook URL with a name and timestamp.

## When to use
- User asks to "ping" a webhook, URL, or endpoint
- User wants to send their name/info to a webhook
- Another skill needs to define parameters for a ping task

## Required Parameters
- **webhook_url**: The full URL to POST to (e.g. https://webhook.site/abc-123)
- **name**: The full name to include in the payload

## How to Execute

Send an HTTP POST request:

**URL:** The webhook_url provided by the user
**Method:** POST
**Headers:** Content-Type: application/json
**Body:**
\```json
{
  "name": "<name>",
  "timestamp": "<current ISO 8601 timestamp>"
}
\```

## Behavior
1. If the user does not provide a webhook URL, ask for it
2. If the user does not provide a name, ask for it
3. Execute the POST request
4. Report success or failure to the user

## Example Interactions

**User:** "Ping the webhook at https://webhook.site/abc-123 with my name John Doe"
→ POST to that URL with {"name": "John Doe", "timestamp": "2026-03-27T10:00:00Z"}
→ "Done! Pinged the webhook successfully."

**User:** "Ping the webhook"
→ "What webhook URL should I ping, and what name should I include?"
```

**Step 2: Commit**

```bash
git add ping/SKILL.md
git commit -m "feat: Ping skill definition"
```

---

### Task 5: Scheduler SKILL.md

**Files:**
- Create: `scheduler/SKILL.md`

**Step 1: Write the Scheduler skill**

```markdown
# Scheduler Skill

## Purpose
Create, list, and delete scheduled tasks that run automatically on the server.

## When to use
- User wants to schedule something to happen automatically (e.g. "schedule a ping every day")
- User wants to see what tasks are scheduled
- User wants to remove a scheduled task
- User asks about task status or history

## API Base URL
`https://<VERCEL_APP_URL>`

Replace <VERCEL_APP_URL> with the deployed app URL.

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
\```json
{
  "type": "<skill_type>",
  "params": { ... },
  "schedule": "daily"
}
\```

**Task types and their required params:**
- `ping`: requires `webhook_url` (string) and `name` (string). See Ping Skill for details.

**Behavior:**
1. Determine the task type from what the user wants to schedule
2. Gather required params for that task type (ask user if missing)
3. Create the task via POST
4. Confirm to the user what was scheduled

### Delete Task
**When:** User asks to remove/cancel/stop a scheduled task
**Request:** DELETE /api/tasks?id=<task_id>

**Behavior:**
1. If user doesn't specify which task, first list tasks (GET) and ask which to delete
2. Delete the task
3. Confirm deletion

## Example Interactions

**User:** "Schedule a ping to https://webhook.site/abc every day with my name Jane Doe"
→ POST /api/tasks with {"type": "ping", "params": {"webhook_url": "https://webhook.site/abc", "name": "Jane Doe"}, "schedule": "daily"}
→ "Done! Scheduled a daily ping to that webhook with your name."

**User:** "What tasks are running?"
→ GET /api/tasks
→ "You have 2 scheduled tasks:
   1. Ping to webhook.site/abc (daily) — last ran today at 4:30 PM PST, successful
   2. Ping to webhook.site/xyz (daily) — hasn't run yet"

**User:** "Stop the second ping"
→ DELETE /api/tasks?id=<id>
→ "Removed the ping to webhook.site/xyz."
```

**Step 2: Commit**

```bash
git add scheduler/SKILL.md
git commit -m "feat: Scheduler skill definition"
```

---

### Task 6: README.md

**Files:**
- Create: `README.md`

**Step 1: Write the README**

Include:
- Project overview (what this is)
- Vercel deployment URL (fill in after deploy)
- Design decisions (few sentences: why KV, why seed task, what was scoped in/out)
- Composability answer (2-3 automations with HubSpot/Slack, conventions for universal skills)

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with design decisions and composability answer"
```

---

### Task 7: SETUP.md (local only, gitignored)

**Files:**
- Create: `SETUP.md`

**Step 1: Write local setup instructions**

Include:
- How to create Vercel project and link KV store
- How to deploy
- How to upload skills to Claude.ai project
- How to verify cron is running

This file is already in `.gitignore` from Task 1.

---

### Task 8: Deploy and Verify

**Step 1: Push to GitHub**

```bash
git remote add origin <your-repo-url>
git push -u origin main
```

**Step 2: Deploy to Vercel**
- Connect repo in Vercel dashboard
- Create KV store, link to project
- Deploy

**Step 3: Verify seed task pings**

```bash
# Trigger cron manually
curl https://<your-app>.vercel.app/api/cron

# Check tasks
curl https://<your-app>.vercel.app/api/tasks
```

Expected: Cron returns executed results. Webhook.site shows the ping.

**Step 4: Test skill via Claude.ai**
- Upload both SKILL.md files to a Claude.ai project
- Ask: "Schedule a ping to [webhook URL] with my name [Real Name] every day"
- Verify task was created: `curl https://<your-app>.vercel.app/api/tasks`

**Step 5: Update README with Vercel URL**

**Step 6: Final commit and push**

```bash
git add README.md
git commit -m "docs: add Vercel deployment URL"
git push
```
