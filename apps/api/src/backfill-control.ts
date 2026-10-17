import { symbols, type Symbol } from "../../../packages/shared/src/domain";
import type { Env } from "./env";
import { saveSettings } from "./data";

export type BackfillFlags = Record<Symbol, boolean>;
export const defaultBackfillFlags: BackfillFlags = {
  BTCUSDT: true,
  XAUUSD: false,
};

const settingKey = (symbol: Symbol) => `backfill_enabled_${symbol}`;

export async function backfillFlags(env: Env): Promise<BackfillFlags> {
  const flags = { ...defaultBackfillFlags };
  const { results } = await env.DB.prepare(
    "SELECT id,value_json FROM settings WHERE id IN (?,?)",
  )
    .bind(...symbols.map(settingKey))
    .all<{ id: string; value_json: string }>();
  for (const row of results) {
    const symbol = symbols.find((s) => settingKey(s) === row.id);
    if (symbol) flags[symbol] = row.value_json === "true";
  }
  return flags;
}

export async function isBackfillEnabled(
  env: Env,
  symbol: Symbol,
): Promise<boolean> {
  const row = await env.DB.prepare("SELECT value_json FROM settings WHERE id=?")
    .bind(settingKey(symbol))
    .first<{ value_json: string }>();
  return row ? row.value_json === "true" : defaultBackfillFlags[symbol];
}

export async function setBackfillEnabled(
  env: Env,
  symbol: Symbol,
  enabled: boolean,
): Promise<void> {
  if ((await isBackfillEnabled(env, symbol)) === enabled) return;
  await saveSettings(env, settingKey(symbol), enabled);
}
