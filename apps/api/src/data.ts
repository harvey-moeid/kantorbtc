import {
  defaultSettings,
  settingsSchema,
  type Settings,
} from "../../../packages/shared/src/domain";
import type { Env, Slot } from "./env";
import { defaultSlots } from "./env";
import { decrypt } from "./security";
export async function settings(
  env: Env,
): Promise<{ settings: Settings; version: number }> {
  const row = await env.DB.prepare(
    "SELECT value_json,version FROM settings WHERE id='scanner'",
  ).first<{ value_json: string; version: number }>();
  return row
    ? {
        settings: settingsSchema.parse(JSON.parse(row.value_json)),
        version: row.version,
      }
    : { settings: structuredClone(defaultSettings), version: 1 };
}
export async function slots(env: Env): Promise<Slot[]> {
  const row = await env.DB.prepare(
    "SELECT value_json FROM settings WHERE id='ai'",
  ).first<{ value_json: string }>();
  return row ? JSON.parse(row.value_json) : defaultSlots;
}
export async function credential(
  env: Env,
  provider: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT ciphertext FROM api_credentials WHERE provider=? AND enabled=1",
  )
    .bind(provider)
    .first<{ ciphertext: string }>();
  return row ? decrypt(row.ciphertext, env.ENCRYPTION_KEY) : null;
}
export async function saveSettings(
  env: Env,
  category: string,
  value: unknown,
): Promise<number> {
  const old = await env.DB.prepare(
    "SELECT value_json,version FROM settings WHERE id=?",
  )
    .bind(category)
    .first<{ value_json: string; version: number }>();
  const version = (old?.version || 0) + 1,
    json = JSON.stringify(value),
    now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO settings(id,value_json,version,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,version=excluded.version,updated_at=excluded.updated_at",
    ).bind(category, json, version, now),
    env.DB.prepare(
      "INSERT INTO settings_audit(id,category,old_json,new_json,version,at) VALUES(?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      category,
      old?.value_json || null,
      json,
      version,
      now,
    ),
  ]);
  return version;
}
