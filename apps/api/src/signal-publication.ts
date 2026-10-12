import type { Quote, Signal } from "../../../packages/shared/src/domain";
import { cancelForOpposingSignal } from "../../../packages/shared/src/lifecycle";
import type { Env } from "./env";

// Called through the same MarketHub queue as ticks and expiry. Publishing and
// cancelling older waiting signals commits in one atomic D1 batch.
export async function publishSignal(
  env: Env,
  signal: Signal,
  observed?: Quote,
): Promise<void> {
  if (signal.status !== "menunggu_entry")
    throw new Error("Only approved waiting signals can be published");
  if (
    await env.DB.prepare("SELECT id FROM signals WHERE id=?")
      .bind(signal.id)
      .first()
  )
    return;
  const { results } = await env.DB.prepare(
    "SELECT value_json FROM signals WHERE symbol=? AND tf=? AND status='menunggu_entry' AND id<>? AND created_at<=?",
  )
    .bind(signal.symbol, signal.tf, signal.id, signal.createdAt)
    .all<{ value_json: string }>();
  const cancellations = results
    .map((row) => JSON.parse(row.value_json) as Signal)
    .map((old) => ({ old, next: cancelForOpposingSignal(old, signal) }))
    .filter(({ old, next }) => old !== next);
  const price =
    observed &&
    observed.symbol === signal.symbol &&
    ["live", "fallback"].includes(observed.status) &&
    Math.abs(signal.createdAt - observed.at) <= 30000
      ? observed.price
      : null;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO signals(id,symbol,tf,status,created_at,value_json) VALUES(?,?,?,?,?,?)",
    ).bind(
      signal.id,
      signal.symbol,
      signal.tf,
      signal.status,
      signal.createdAt,
      JSON.stringify(signal),
    ),
    env.DB.prepare(
      "INSERT INTO signal_events(id,signal_id,kind,price,at,value_json) VALUES(?,?,?,?,?,?)",
    ).bind(
      `publish-${signal.id}`,
      signal.id,
      "menunggu_entry",
      price,
      signal.createdAt,
      JSON.stringify({
        settingsVersion: signal.settingsVersion,
        direction: signal.direction,
      }),
    ),
    ...cancellations.flatMap(({ old, next }) => [
      env.DB.prepare(
        "UPDATE signals SET status='dibatalkan',value_json=? WHERE id=? AND status='menunggu_entry'",
      ).bind(JSON.stringify(next), old.id),
      env.DB.prepare(
        "INSERT INTO signal_events(id,signal_id,kind,price,at,value_json) SELECT ?,?,'dibatalkan',?,?,? WHERE EXISTS(SELECT 1 FROM signals WHERE id=? AND status='dibatalkan' AND json_extract(value_json,'$.cancelledBySignalId')=?)",
      ).bind(
        `cancel-${old.id}-${signal.id}`,
        old.id,
        price,
        signal.createdAt,
        JSON.stringify({
          reason: next.cancellationReason,
          cancelledBySignalId: signal.id,
          settingsVersion: signal.settingsVersion,
          observedAt: price !== null ? observed!.at : null,
        }),
        old.id,
        signal.id,
      ),
    ]),
  ]);
}
