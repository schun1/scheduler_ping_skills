import { kv } from "@vercel/kv";

function isDue(task) {
  if (!task.last_run) return true;

  const now = new Date();
  const lastRun = new Date(task.last_run);
  const hoursSinceLastRun = (now - lastRun) / (1000 * 60 * 60);

  switch (task.schedule) {
    case "daily":
      return hoursSinceLastRun >= 24;
    case "weekly":
      return hoursSinceLastRun >= 168;
    case "hourly":
      return hoursSinceLastRun >= 1;
    default:
      return hoursSinceLastRun >= 24;
  }
}

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
  // Verify cron secret — only Vercel's scheduler or authorized callers
  const authHeader = req.headers["authorization"];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let tasks = (await kv.get("tasks")) || [];

  const results = [];

  for (const task of tasks) {
    if (task.status !== "active") continue;
    if (!isDue(task)) continue;

    if (task.type === "ping") {
      try {
        const success = await executePing(task.params);
        task.last_run = new Date().toISOString();
        task.last_status = success ? "success" : "failed";
        results.push({ id: task.id, type: task.type, success });
      } catch (error) {
        task.last_run = new Date().toISOString();
        task.last_status = "error";
        results.push({ id: task.id, type: task.type, success: false, error: error.message });
      }
    }
  }

  await kv.set("tasks", tasks);

  return res.status(200).json({ executed: results.length, results });
}
