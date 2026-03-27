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

  if (req.method === "PUT") {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: "Missing task id" });
    }

    const tasks = (await kv.get("tasks")) || [];
    const task = tasks.find((t) => t.id === id);

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const { params, schedule, status } = req.body;
    if (params) task.params = { ...task.params, ...params };
    if (schedule) task.schedule = schedule;
    if (status) task.status = status;
    task.updated_at = new Date().toISOString();

    await kv.set("tasks", tasks);
    return res.status(200).json(task);
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
