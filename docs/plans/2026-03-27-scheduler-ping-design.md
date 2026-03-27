# Scheduler + Ping Skills Design

## Overview

Two Claude Skills (Scheduler and Ping) wired into a Vercel app with a daily cron job that pings a webhook.

## Architecture

```
your-project/
├── api/
│   ├── tasks.js       ← CRUD endpoints for scheduled tasks
│   └── cron.js        ← Runs daily, executes due tasks
├── vercel.json        ← Cron schedule config
├── package.json       ← Dependencies (@vercel/kv)
├── scheduler/
│   └── SKILL.md       ← Teaches Claude to manage tasks via API
├── ping/
│   └── SKILL.md       ← Teaches Claude to POST to webhooks
└── README.md          ← Design answers + composability
```

## Data Flow

### Path 1: Manual Ping
User in Claude.ai says "ping the webhook" → Claude follows Ping SKILL.md → POSTs directly to webhook.site

### Path 2: Scheduled Ping
User in Claude.ai says "schedule a ping every day" → Claude reads both skills → calls POST /api/tasks on Vercel app → task stored in KV → cron fires daily → finds due task → POSTs to webhook.site

### Path 3: Check Status
User asks "did my pings run?" → Claude calls GET /api/tasks → returns task list with last_run/status

## Storage

Vercel KV. Task schema:

```json
{
  "id": "abc123",
  "type": "ping",
  "params": { "webhook_url": "https://webhook.site/xxx", "name": "Joe Smith" },
  "schedule": "daily",
  "last_run": null,
  "status": "active"
}
```

## API Endpoints

- `POST /api/tasks` — Create a task
- `GET /api/tasks` — List all tasks with status/last_run
- `DELETE /api/tasks?id=abc123` — Delete a task

## Cron

- Fixed daily schedule in vercel.json
- Reads all active tasks from KV
- Executes each due task (POSTs to webhook with name + timestamp)
- Updates last_run and status

## Seed Task

On first cron run, if no seed task exists, create one with a fake name. Ensures the hiring team always gets pings.

## Skills

**Ping SKILL.md:** Teaches Claude what a ping is, what params are needed (webhook URL, name), how to execute directly.

**Scheduler SKILL.md:** Teaches Claude the Vercel API URL, how to CRUD tasks, what fields a task needs, to reference Ping skill for param requirements.

## Env Vars (Vercel)

- `KV_REST_API_URL` — auto-provided by Vercel KV
- `KV_REST_API_TOKEN` — auto-provided by Vercel KV

## README Answers

Written after code is working:
- Design decisions
- Composability answer (2-3 automations with HubSpot/Slack skills + conventions)
