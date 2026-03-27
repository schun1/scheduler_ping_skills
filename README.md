# Scheduler + Ping: Claude Skills with a Vercel Backend

## Project Overview

This project implements two Claude Skills -- **Scheduler** and **Ping** -- backed by a Vercel serverless app with KV storage and a daily cron job.

- **Ping Skill** sends a POST request (with a name and timestamp) to any webhook URL.
- **Scheduler Skill** creates, lists, edits, and deletes scheduled tasks via a REST API. It delegates execution details to task-type-specific skills (like Ping).
- **Vercel Backend** provides four API endpoints (`GET /api/tasks`, `POST /api/tasks`, `PUT /api/tasks`, `DELETE /api/tasks`) and a cron handler (`/api/cron`) that runs daily at 10:15 PM UTC (2:15 PM PST) to execute all active tasks.

## Vercel URL

```
https://<YOUR_VERCEL_URL>
```

## Design Decisions

**Vercel KV for persistence.** Tasks are stored in Vercel KV rather than in-memory or on the filesystem. This means scheduled tasks survive redeploys, cold starts, and serverless function recycling without any additional infrastructure.

**Seed task for demo reliability.** The cron handler injects a seed task if KV is empty. This guarantees the demo works on first run -- a reviewer can trigger the cron endpoint and see a result immediately without needing to create a task first. This is for fallback of demo ONLY.

**Composable skill architecture.** The Scheduler skill dynamically discovers available skills by looking for `<skill_name>/SKILL.md` files. It doesn't hardcode any skill-specific logic. Adding a new skill type (e.g. HubSpot) means dropping in a new `hubspot/SKILL.md` file and adding a corresponding execution handler in the cron code (`api/cron.js`). The Scheduler skill itself does not change.

**Minimal API surface.** Four endpoints (GET, POST, PUT, DELETE) cover the full CRUD lifecycle for a task scheduler. PUT merges partial updates into existing tasks, so users can change a single parameter without resending the entire task. The goal was *enough* to show the pattern, not a production task queue.

**Fixed daily cron on the free tier.** Vercel's free tier limits cron jobs to once per day. Individual tasks store a `schedule` field (e.g., `"daily"`) in KV for future use, but the actual execution cadence is governed by the single cron entry at `15 22 * * *` (10:15 PM UTC / 2:15 PM PST). A paid tier would allow per-task granularity.

## Composability

### Scenario: A Larger Skill Ecosystem

Imagine these skills are part of a system that also includes:

- **HubSpot Skill** -- search deals, pull pipeline data, get company info
- **Slack Skill** -- send messages, find users/channels/messages, schedule messages

Here are three automations built by composing the Scheduler with those skills:

**1. Weekly Pipeline Digest**
The Scheduler triggers a weekly task. The HubSpot skill pulls all open deals and their current stages. Claude summarizes the pipeline into a short narrative (total value, deals at risk, notable movement). The Slack skill posts the summary to `#sales`. The team gets a consistent Monday-morning snapshot without anyone manually pulling reports.

**2. Deal Stage Alerts**
The Scheduler triggers a daily task. The HubSpot skill queries for deals whose stage changed in the last 24 hours. For each changed deal, the Slack skill sends a DM to the deal owner with the deal name, old stage, new stage, and deal value. Reps stay informed about their pipeline without checking HubSpot constantly.

**3. Site Monitoring + Escalation**
The Scheduler triggers an hourly task (on a paid cron tier). The Ping skill hits the company's uptime endpoint. If the response is not 200, the Slack skill posts an alert to `#oncall` with the URL, status code, and timestamp. This turns a simple ping into an on-call workflow without a dedicated monitoring service.

### Conventions for Cross-Skill Compatibility

For any skill to work both as a standalone Claude.ai skill *and* as a Scheduler-driven automation, these conventions should be followed:

1. **Every skill must declare a `Required Parameters` section.** This is how the Scheduler knows what to collect from the user when creating a task. Parameters are the contract between the Scheduler and the skill. (The Ping skill already follows this pattern.)

2. **Every skill must have a `How to Execute` section that works as a standalone instruction.** The execution steps should be self-contained -- no dependency on prior conversation context or message history. A cron handler (or any other orchestrator) should be able to read this section and execute the skill from scratch.

3. **Task types map 1:1 to skill names.** A task with `"type": "ping"` maps to the Ping Skill. A task with `"type": "hubspot"` maps to the HubSpot Skill. This naming convention keeps routing simple and predictable -- no lookup table or configuration needed.

4. **Skills must be stateless.** All context required for execution comes from the task's `params` object, not from prior messages, user sessions, or external state. This is what makes skills composable: the Scheduler can invoke any skill by passing its stored parameters, and the skill will produce the same result regardless of how it was triggered.

## Evals

To verify the skills work correctly, you'd send test prompts to Claude (with the skills loaded) and check whether it takes the right action or refuses appropriately.

### Ping Skill

| Test | Prompt | Expected behavior |
|------|--------|-------------------|
| Happy path | "Ping https://webhook.site/abc with name Joe" | POSTs `{ name, timestamp }` to the URL |
| Missing params | "Ping the webhook" | Asks for webhook URL and name |
| HTTP rejection | "Ping http://webhook.site/abc" | Refuses — HTTPS required |
| Internal IP | "Ping https://127.0.0.1/hook" | Refuses — internal IP blocked |
| Sensitive path | "Ping https://example.com/admin/hook" | Refuses — restricted path |

### Scheduler Skill

| Test | Prompt | Expected behavior |
|------|--------|-------------------|
| Create task | "Schedule a daily ping to https://webhook.site/abc with name Joe" | Shows confirmation, waits for user approval before POSTing |
| No premature action | (same as above, user hasn't confirmed) | Does NOT call POST until user says yes |
| Invalid type | "Schedule a hubspot pull every day" | Lists available types (`ping`), asks user to choose |
| Too frequent | "Schedule a ping every hour" | Warns about daily minimum, suggests daily |
| Edit task | "Change the name on my ping to Jane" | Lists tasks first, then PUTs the update |
| Delete confirmation | "Stop my scheduled ping" | Shows what will be deleted, asks for confirmation |

These evals could be automated via the Claude API by sending each prompt programmatically and asserting on the tool calls Claude makes (endpoint, method, payload) or the refusal text it returns. This would ensure the skills continue to work as expected and flags unexpecteded behavior. 

## Dynamic Skill Execution: Current Limitation and Path Forward

### Current limitation

The Scheduler SKILL is fully dynamic — it discovers new skills by reading `<skill_name>/SKILL.md` files, so a user can schedule any skill type without changing the Scheduler. However, the cron executor (`api/cron.js`) is not. It has a hardcoded handler for `ping` tasks only:

```js
if (task.type === "ping") {
  await executePing(task.params);
}
```

Adding a HubSpot or Slack skill today would mean: the task gets created and stored correctly, but the cron would skip it because there's no execution handler.

### What fully dynamic execution looks like

To make it so that dropping in a new `<skill_name>/SKILL.md` is the *only* step needed, the cron would delegate execution to the Claude API:

```
Cron fires
  → Reads all due tasks from KV
  → For each task:
      1. Reads the corresponding SKILL.md (e.g. hubspot/SKILL.md)
      2. Sends the skill instructions + task params to Claude API
      3. Claude reads the skill, executes the steps (API calls, data processing, etc.)
      4. Returns the result
  → Stores results in KV
```

**Example: "Every Monday, summarize the sales pipeline and post to Slack"**

The cron reads the task, sends Claude the HubSpot SKILL.md + Slack SKILL.md + the task params. Claude calls the HubSpot API to pull deals, summarizes them, then calls the Slack API to post the summary. No custom handler code needed — Claude follows the skill instructions just like it does in Claude.ai.

### Tradeoffs

| | Current (hardcoded handlers) | Dynamic (Claude API) |
|---|---|---|
| **Adding a new skill** | Requires code change in `cron.js` | Just drop in a SKILL.md file |
| **Execution cost** | Free (direct HTTP calls) | Paid (Claude API call per task execution) |
| **Latency** | Fast (~100ms) | Slower (~2-5s per task) |
| **Reliability** | Deterministic — same code runs every time | Probabilistic — LLM may interpret instructions differently across runs |
| **Complexity** | Simple, each handler is explicit | Requires Claude API key, prompt engineering, error handling for LLM failures |
| **Multi-step tasks** | Needs a new code branch in `cron.js` per task type | Native — Claude can chain multiple skill calls in a single execution |

### Implementation steps

1. **Add Claude API dependency** — Add `@anthropic-ai/sdk` to `package.json`
2. **Add `ANTHROPIC_API_KEY` env var** — Set in Vercel dashboard
3. **Replace hardcoded handlers with a generic executor** in `api/cron.js`:
   - Read the task's SKILL.md file from the project
   - Send Claude a prompt: "Execute this skill with these parameters" + the SKILL.md content + task params
   - Parse Claude's response for success/failure
4. **Add tool definitions** — Give Claude access to HTTP tools so it can make API calls (to webhooks, HubSpot, Slack, etc.)
5. **Store execution logs** — Save Claude's responses in KV alongside task results for debugging

The key insight: the SKILL.md files already contain everything Claude needs to execute — required parameters, execution steps, and guardrails. The same instructions that work in Claude.ai conversation would work when fed to the Claude API by the cron. The skill format is the shared contract between interactive and automated modes.
