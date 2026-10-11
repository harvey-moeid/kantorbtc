import type { Env } from "./env";
import { credential } from "./data";
export async function enqueue(env: Env, id: string, content: string) {
  const now = Date.now();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO alert_outbox(id,content,retry_at,created_at) VALUES(?,?,?,?)",
  )
    .bind(id, content.slice(0, 1900), now, now)
    .run();
}
export function safeWebhook(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.hostname === "discord.com" &&
      !u.username &&
      !u.password &&
      !u.port &&
      /^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(u.pathname) &&
      !u.search &&
      !u.hash
    );
  } catch {
    return false;
  }
}
export async function flushOutbox(env: Env) {
  if (env.APP_MODE !== "live") return;
  const url = await credential(env, "Discord");
  if (!url || !safeWebhook(url)) return;
  const { results } = await env.DB.prepare(
    "SELECT id,content,attempts FROM alert_outbox WHERE status='pending' AND retry_at<=? ORDER BY created_at LIMIT 5",
  )
    .bind(Date.now())
    .all<{ id: string; content: string; attempts: number }>();
  for (const row of results) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: row.content,
          allowed_mentions: { parse: [] },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Webhook failure");
      await env.DB.prepare(
        "UPDATE alert_outbox SET status='sent',sent_at=? WHERE id=?",
      )
        .bind(Date.now(), row.id)
        .run();
    } catch {
      const attempts = row.attempts + 1;
      await env.DB.prepare(
        "UPDATE alert_outbox SET attempts=?,retry_at=?,status=? WHERE id=?",
      )
        .bind(
          attempts,
          Date.now() + Math.min(3600000, 5000 * 2 ** attempts),
          attempts >= 8 ? "failed" : "pending",
          row.id,
        )
        .run();
    }
  }
}
