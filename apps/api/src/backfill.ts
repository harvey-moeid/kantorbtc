import {
  symbols,
  timeframes,
  type Symbol,
  type Timeframe,
} from "../../../packages/shared/src/domain";
import type { Env } from "./env";
import { marketCandles, persistCandles } from "./market";
export interface BackfillJob {
  id: string;
  symbol: Symbol;
  tf: Timeframe;
  from_time: number;
  to_time: number;
  cursor_time: number;
  status: "pending" | "complete" | "failed";
  rows_saved: number;
  error: string | null;
  updated_at: number;
}
// Historical backfill is opt-in per symbol. Normal live candle ingestion is unaffected.
export const backfillSettingId = (symbol: Symbol) => `backfill_enabled:${symbol}`;

export async function backfillEnabled(env: Env, symbol: Symbol): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT value_json FROM settings WHERE id=?",
  )
    .bind(backfillSettingId(symbol))
    .first<{ value_json: string }>();
  return row?.value_json === "true";
}

export async function backfillSwitches(env: Env): Promise<Record<Symbol, boolean>> {
  const { results } = await env.DB.prepare(
    "SELECT id,value_json FROM settings WHERE id IN (?,?)",
  )
    .bind(...symbols.map(backfillSettingId))
    .all<{ id: string; value_json: string }>();
  const enabledIds = new Set(
    results.filter((r) => r.value_json === "true").map((r) => r.id),
  );
  return Object.fromEntries(
    symbols.map((symbol) => [symbol, enabledIds.has(backfillSettingId(symbol))]),
  ) as Record<Symbol, boolean>;
}

export async function setBackfillEnabled(
  env: Env,
  symbol: Symbol,
  enabled: boolean,
) {
  await env.DB.prepare(
    "INSERT INTO settings(id,value_json,version,updated_at) VALUES(?,?,1,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,version=settings.version+1,updated_at=excluded.updated_at WHERE settings.value_json<>excluded.value_json",
  )
    .bind(backfillSettingId(symbol), JSON.stringify(enabled), Date.now())
    .run();
}

export async function createBackfill(
  env: Env,
  symbol: Symbol,
  from: number,
  to: number,
) {
  await env.DB.batch(
    timeframes.map((tf) =>
      env.DB.prepare(
        "INSERT INTO backfill_jobs(id,symbol,tf,from_time,to_time,cursor_time,updated_at) VALUES(?,?,?,?,?,?,?)",
      ).bind(crypto.randomUUID(), symbol, tf, from, to, to, Date.now()),
    ),
  );
}
export async function initialBackfill(env: Env) {
  const initialized = await env.DB.prepare(
    "SELECT id FROM settings WHERE id='backfill_initialized'",
  ).first();
  if (initialized) return;
  const now = Math.floor(Date.now() / 1000);
  for (const symbol of symbols)
    await createBackfill(env, symbol, now - 31536000, now);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO settings(id,value_json,version,updated_at) VALUES('backfill_initialized','true',1,?)",
  )
    .bind(Date.now())
    .run();
}
export async function backfillChunk(env: Env) {
  // One global historical page per 15 minutes, persisted across hub restarts.
  // Take the slot atomically before provider I/O, including failed attempts.
  const now = Date.now();
  const slot = await env.DB.prepare(
    "INSERT INTO settings(id,value_json,version,updated_at) SELECT 'backfill_last_attempt','true',1,? WHERE EXISTS(SELECT 1 FROM backfill_jobs j JOIN settings s ON s.id='backfill_enabled:' || j.symbol AND s.value_json='true' WHERE j.status='pending') ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at WHERE settings.updated_at<=excluded.updated_at-900000 RETURNING id",
  )
    .bind(now)
    .first<{ id: string }>();
  if (!slot) return;
  const job = await env.DB.prepare(
    "SELECT j.* FROM backfill_jobs j JOIN settings s ON s.id='backfill_enabled:' || j.symbol AND s.value_json='true' WHERE j.status='pending' ORDER BY j.updated_at LIMIT 1",
  ).first<BackfillJob>();
  if (!job) return;
  try {
    const data = await marketCandles(env, job.symbol, job.tf, job.cursor_time),
      oldest = data.candles[0]?.time;
    if (!oldest || oldest >= job.cursor_time)
      throw new Error("No backward progress");
    const filtered = data.candles.filter(
      (c) => c.time >= job.from_time && c.time < job.to_time,
    );
    // A symbol may be switched OFF while its provider request is in flight.
    // Re-check before any candle writes or cursor updates.
    if (!(await backfillEnabled(env, job.symbol))) return;
    if (filtered.length)
      await persistCandles(env, job.symbol, job.tf, {
        ...data,
        candles: filtered,
      });
    await env.DB.prepare(
      "UPDATE backfill_jobs SET cursor_time=?,rows_saved=rows_saved+?,status=?,error=NULL,updated_at=? WHERE id=?",
    )
      .bind(
        oldest,
        filtered.length,
        oldest <= job.from_time ? "complete" : "pending",
        Date.now(),
        job.id,
      )
      .run();
  } catch {
    if (!(await backfillEnabled(env, job.symbol))) return;
    await env.DB.prepare(
      "UPDATE backfill_jobs SET status='failed',error=?,updated_at=? WHERE id=?",
    )
      .bind(
        "Histori tidak tersedia atau akses provider gagal. Periksa key, kuota, dan cakupan historis lalu lanjutkan.",
        Date.now(),
        job.id,
      )
      .run();
  }
}
