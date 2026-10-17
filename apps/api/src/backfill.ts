import {
  symbols,
  timeframes,
  type Symbol,
  type Timeframe,
} from "../../../packages/shared/src/domain";
import type { Env } from "./env";
import { marketCandles, persistCandles } from "./market";
import { isBackfillEnabled } from "./backfill-control";
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
  for (const symbol of symbols) {
    if (!(await isBackfillEnabled(env, symbol))) continue;
    const existing = await env.DB.prepare(
      "SELECT id FROM backfill_jobs WHERE symbol=? LIMIT 1",
    ).bind(symbol).first();
    if (!existing) await createBackfill(env, symbol, now - 31536000, now);
  }
  await env.DB.prepare(
    "INSERT OR IGNORE INTO settings(id,value_json,version,updated_at) VALUES('backfill_initialized','true',1,?)",
  )
    .bind(Date.now())
    .run();
}
// Only pending jobs whose symbol is ON consume the global historical quota.
// Keep pending jobs and cursors intact while their symbol is OFF.
const eligibleJob = `status='pending' AND COALESCE((SELECT value_json FROM settings WHERE id='backfill_enabled_'||backfill_jobs.symbol), CASE WHEN symbol='BTCUSDT' THEN 'true' ELSE 'false' END)='true'`;

export async function backfillChunk(env: Env) {
  // One global historical page per 15 minutes, persisted across hub restarts.
  // Take the slot atomically before provider I/O, including failed attempts.
  const now = Date.now();
  const slot = await env.DB.prepare(
    `INSERT INTO settings(id,value_json,version,updated_at) SELECT 'backfill_last_attempt','true',1,? WHERE EXISTS(SELECT 1 FROM backfill_jobs WHERE ${eligibleJob}) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at WHERE settings.updated_at<=excluded.updated_at-900000 RETURNING id`,
  )
    .bind(now)
    .first<{ id: string }>();
  if (!slot) return;
  const job = await env.DB.prepare(
    `SELECT * FROM backfill_jobs WHERE ${eligibleJob} ORDER BY updated_at LIMIT 1`,
  ).first<BackfillJob>();
  if (!job || !(await isBackfillEnabled(env, job.symbol))) return;
  try {
    const data = await marketCandles(env, job.symbol, job.tf, job.cursor_time),
      oldest = data.candles[0]?.time;
    if (!oldest || oldest >= job.cursor_time)
      throw new Error("No backward progress");
    // Recheck after provider I/O so disabling an asset stops its next write.
    if (!(await isBackfillEnabled(env, job.symbol))) return;
    const filtered = data.candles.filter(
      (c) => c.time >= job.from_time && c.time < job.to_time,
    );
    if (filtered.length)
      await persistCandles(env, job.symbol, job.tf, {
        ...data,
        candles: filtered,
      });
    if (!(await isBackfillEnabled(env, job.symbol))) return;
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
    if (!(await isBackfillEnabled(env, job.symbol))) return;
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
