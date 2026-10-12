import { seconds } from "../../../packages/shared/src/domain";
import type {
  Candle,
  Signal,
  Symbol,
  Timeframe,
} from "../../../packages/shared/src/domain";
import { ambiguousCandle } from "../../../packages/shared/src/lifecycle";
import type { Env } from "./env";

export async function recordCandleAmbiguities(
  env: Env,
  symbol: Symbol,
  tf: Timeframe,
  data: { candles: Candle[]; source: string },
): Promise<void> {
  if (!data.candles.length) return;
  const { results } = await env.DB.prepare(
    "SELECT value_json FROM signals WHERE symbol=? AND tf=? AND (status='aktif' OR (status IN ('target_tercapai','stop_loss') AND json_extract(value_json,'$.exitAt')>=?))",
  )
    .bind(symbol, tf, data.candles[0].time * 1000)
    .all<{ value_json: string }>();
  for (const row of results) {
    const signal = JSON.parse(row.value_json) as Signal;
    for (const candle of data.candles.filter((c) =>
      ambiguousCandle(signal, c),
    )) {
      // No future quote can resolve the missing order of earlier TP/SL touches.
      // Retain observed exit fields for audit, but mark the overall outcome
      // unknown when this closed candle preceded the observed exit.
      const next: Signal = {
        ...signal,
        status: "ambigu",
        ambiguousSince: candle.time * 1000,
      };
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE signals SET status='ambigu',value_json=? WHERE id=? AND value_json=?",
        ).bind(JSON.stringify(next), signal.id, row.value_json),
        env.DB.prepare(
          "INSERT OR IGNORE INTO signal_events(id,signal_id,kind,price,at,value_json) SELECT ?,?,'ambigu',NULL,?,? WHERE EXISTS(SELECT 1 FROM signals WHERE id=? AND status='ambigu')",
        ).bind(
          `ambigu-${signal.id}-${tf}-${candle.time}`,
          signal.id,
          Date.now(),
          JSON.stringify({
            reason: "tp_sl_same_candle",
            resolution: "unknown",
            candleTime: candle.time,
            source: data.source,
            candle,
            previousStatus: signal.status,
            observedExitAt: signal.exitAt ?? null,
            entryOccurredWithinCandle:
              signal.entryTouchedAt! > candle.time * 1000,
            candleClosedAt: (candle.time + seconds[tf]) * 1000,
          }),
          signal.id,
        ),
      ]);
      break;
    }
  }
}
