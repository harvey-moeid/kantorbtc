import { recordCandleAmbiguities } from "./signal-ambiguity";
import {
  seconds,
  type Candle,
  type Symbol,
  type Timeframe,
} from "../../../packages/shared/src/domain";
import type { Env } from "./env";
import { persistCandles } from "./market";

export function btcCandlesReady(
  candles: Candle[],
  tf: Timeframe,
  now = Date.now(),
  minimum = 60,
): boolean {
  const closedAt =
    Math.floor(now / 1000 / seconds[tf]) * seconds[tf] - seconds[tf];
  const count = Math.max(60, minimum);
  const tail = candles.slice(-count);
  return (
    tail.length >= count &&
    tail.at(-1)!.time === closedAt &&
    tail.every((c, i) => !i || c.time - tail[i - 1].time === seconds[tf])
  );
}

export async function reconcileCandles(
  env: Env,
  symbol: Symbol,
  tf: Timeframe,
  data: { candles: Candle[]; source: string },
): Promise<void> {
  const first = data.candles[0]?.time;
  const last = await env.DB.prepare(
    "SELECT time,source FROM candles WHERE symbol=? AND tf=? ORDER BY time DESC LIMIT 1",
  )
    .bind(symbol, tf)
    .first<{ time: number; source: string }>();
  if (last && last.source !== data.source && data.candles.length)
    await env.DB.prepare(
      "INSERT INTO source_events(id,symbol,from_source,to_source,reason,at) VALUES(?,?,?,?,?,?)",
    )
      .bind(
        crypto.randomUUID(),
        symbol,
        last.source,
        data.source,
        `Candle reconciliation ${tf}`,
        Date.now(),
      )
      .run();
  const gaps: { from: number; to: number }[] = [];
  if (
    first !== undefined &&
    last?.time != null &&
    first > last.time + seconds[tf]
  )
    gaps.push({ from: last.time + seconds[tf], to: first });
  // Crypto trades continuously. Gold session breaks are not treated as missing
  // candles until the provider's exchange calendar is configured.
  if (symbol === "BTCUSDT")
    for (let i = 1; i < data.candles.length; i++) {
      const from = data.candles[i - 1].time + seconds[tf],
        to = data.candles[i].time;
      if (to > from) gaps.push({ from, to });
    }
  // Persist recovery jobs first. A crash while saving recent candles must not
  // hide gaps. Deterministic IDs deduplicate repeated updates and restarts.
  for (let i = 0; i < gaps.length; i += 50)
    await env.DB.batch(
      gaps
        .slice(i, i + 50)
        .map(({ from, to }) =>
          env.DB.prepare(
            "INSERT OR IGNORE INTO backfill_jobs(id,symbol,tf,from_time,to_time,cursor_time,status,updated_at,kind) VALUES(?,?,?,?,?,?,'pending',?,'recovery')",
          ).bind(
            `gap-${symbol}-${tf}-${from}-${to}`,
            symbol,
            tf,
            from,
            to,
            to,
            Date.now(),
          ),
        ),
    );
  await persistCandles(env, symbol, tf, data);
  await recordCandleAmbiguities(env, symbol, tf, data);
}
