import { kv } from "@vercel/kv";

const SEED_TASK = {
  id: "seed-ping",
  type: "ping",
  params: {
    webhook_url: "https://webhook.site/47cdccd9-78bb-420d-bce2-9f34d05df913",
    name: "Sydney Chun",
  },
  schedule: "daily",
  status: "active",
  last_run: null,
  created_at: "2026-03-27T21:15:00Z",
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
