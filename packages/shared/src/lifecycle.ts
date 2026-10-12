import { seconds, type Signal } from "./domain";

export function cancelForOpposingSignal(
  signal: Signal,
  replacement: Signal,
): Signal {
  if (
    signal.id === replacement.id ||
    signal.status !== "menunggu_entry" ||
    replacement.status !== "menunggu_entry" ||
    signal.symbol !== replacement.symbol ||
    signal.tf !== replacement.tf ||
    signal.direction === replacement.direction ||
    signal.createdAt > replacement.createdAt
  )
    return signal;
  return {
    ...signal,
    status: "dibatalkan",
    cancelledAt: replacement.createdAt,
    cancellationReason: "opposing_signal_same_timeframe",
    cancelledBySignalId: replacement.id,
  };
}

export type MarketObservation = {
  state: "open" | "closed" | "unknown";
  knownUntil: number;
};
export function advanceEntryClock(
  signal: Signal,
  now: number,
  observation: MarketObservation,
): Signal {
  if (signal.symbol !== "XAUUSD" || signal.status !== "menunggu_entry")
    return signal;
  const clock = signal.entryClock ?? {
    remainingMs: Math.max(0, (signal.expiresAt ?? now) - now),
    at: now,
    state: "unknown" as const,
    knownUntil: now,
  };
  if (now < clock.at) return signal;
  const elapsed =
    clock.state === "open"
      ? Math.max(0, Math.min(now, clock.knownUntil) - clock.at)
      : 0;
  const remainingMs = Math.max(0, clock.remainingMs - elapsed);
  const state = observation.knownUntil > now ? observation.state : "unknown";
  return {
    ...signal,
    entryClock: {
      remainingMs,
      at: now,
      state,
      knownUntil: observation.knownUntil,
    },
    expiresAt: state === "open" ? now + remainingMs : null,
  };
}

export function conflictingSignals(
  signal: Signal,
  signals: Signal[],
): Signal[] {
  const running = (value: Signal) =>
    ["menunggu_entry", "aktif"].includes(value.status);
  if (!running(signal)) return [];
  return signals.filter(
    (other) =>
      other.id !== signal.id &&
      running(other) &&
      other.symbol === signal.symbol &&
      other.tf !== signal.tf &&
      other.direction !== signal.direction,
  );
}

export function ambiguousCandle(
  signal: Signal,
  candle: import("./domain").Candle,
): boolean {
  return (
    (signal.status === "aktif" ||
      (["target_tercapai", "stop_loss"].includes(signal.status) &&
        signal.exitAt !== undefined &&
        signal.exitAt >= (candle.time + seconds[signal.tf]) * 1000)) &&
    signal.entryTouchedAt !== undefined &&
    (candle.time + seconds[signal.tf]) * 1000 > signal.entryTouchedAt &&
    (signal.direction === "long"
      ? candle.high >= signal.levels.tp[0] && candle.low <= signal.levels.sl
      : candle.low <= signal.levels.tp[0] && candle.high >= signal.levels.sl)
  );
}
