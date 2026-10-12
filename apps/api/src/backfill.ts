import { recordCandleAmbiguities } from "./signal-ambiguity";
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
  kind: "initial" | "manual" | "recovery";
}
export async function createBackfill(
  env: Env,
  symbol: Symbol,
  from: number,
  to: number,
  kind: BackfillJob["kind"] = "manual",
) {
  await env.DB.batch(
    timeframes.map((tf) =>
      env.DB.prepare(
        "INSERT INTO backfill_jobs(id,symbol,tf,from_time,to_time,cursor_time,updated_at,kind) VALUES(?,?,?,?,?,?,?,?)",
      ).bind(crypto.randomUUID(), symbol, tf, from, to, to, Date.now(), kind),
    ),
  );
}
export async function initialBackfill(env: Env) {
  const initialized = await env.DB.prepare(
    "SELECT id FROM settings WHERE id='backfill_initialized'",
  ).first();
  if (initialized) return;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    ...symbols.flatMap((symbol) =>
      timeframes.map((tf) =>
        env.DB.prepare(
          "INSERT INTO backfill_jobs(id,symbol,tf,from_time,to_time,cursor_time,updated_at,kind) SELECT ?,?,?,?,?,?,?,'initial' WHERE NOT EXISTS(SELECT 1 FROM settings WHERE id='backfill_initialized')",
        ).bind(
          crypto.randomUUID(),
          symbol,
          tf,
          now - 31536000,
          now,
          now,
          Date.now(),
        ),
      ),
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO settings(id,value_json,version,updated_at) VALUES('backfill_initialized','true',1,?)",
    ).bind(Date.now()),
  ]);
}
export async function backfillChunk(env: Env) {
  const job = await env.DB.prepare(
    "SELECT * FROM backfill_jobs WHERE status='pending' ORDER BY CASE WHEN kind='recovery' THEN 0 ELSE 1 END,updated_at LIMIT 1",
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
    if (filtered.length)
      await persistCandles(env, job.symbol, job.tf, {
        ...data,
        candles: filtered,
      });
    await recordCandleAmbiguities(env, job.symbol, job.tf, {
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
