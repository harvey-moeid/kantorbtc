import { describe, expect, it } from "vitest";
import {
  advanceEntryClock,
  ambiguousCandle,
  cancelForOpposingSignal,
  conflictingSignals,
} from "./lifecycle";
import {
  advanceSignal,
  makeSignal,
  scannerWinner,
  signalExpired,
} from "./engine";
import { defaultSettings, type Signal } from "./domain";
import { demoScanner, demoSignals, demoVotes } from "./demo";
const waiting: Signal = {
  ...demoSignals[0],
  id: "old",
  createdAt: 0,
  expiresAt: 900000,
};
const opposite: Signal = {
  ...waiting,
  id: "new",
  createdAt: 1000,
  direction: "short",
};
const gold = (): Signal => ({
  ...waiting,
  symbol: "XAUUSD",
  expiresAt: null,
  entryClock: { remainingMs: 900000, at: 0, state: "unknown", knownUntil: 0 },
});
describe("confirmed opposing-signal policy", () => {
  it("cancels an older waiting signal and records its replacement", () =>
    expect(cancelForOpposingSignal(waiting, opposite)).toMatchObject({
      status: "dibatalkan",
      cancelledAt: 1000,
      cancellationReason: "opposing_signal_same_timeframe",
      cancelledBySignalId: "new",
    }));
  it.each([
    "aktif",
    "target_tercapai",
    "stop_loss",
    "kedaluwarsa",
    "dibatalkan",
    "ditolak",
  ] as const)("preserves %s signals", (status) => {
    const old = { ...waiting, status };
    expect(cancelForOpposingSignal(old, opposite)).toBe(old);
  });
  it("does not cancel other assets/timeframes, same direction, newer signals, or itself", () => {
    for (const replacement of [
      { ...opposite, symbol: "XAUUSD" as const },
      { ...opposite, tf: "H4" as const },
      { ...opposite, direction: "long" as const },
      { ...opposite, createdAt: -1 },
      waiting,
      { ...opposite, status: "ditolak" as const },
    ])
      expect(cancelForOpposingSignal(waiting, replacement)).toBe(waiting);
  });
  it("detects cross-timeframe conflicts without mutating either signal", () => {
    const h4 = { ...opposite, tf: "H4" as const };
    expect(
      conflictingSignals(waiting, [
        waiting,
        h4,
        opposite,
        { ...h4, symbol: "XAUUSD" },
      ]),
    ).toEqual([h4]);
    expect(waiting.status).toBe("menunggu_entry");
    expect(h4.status).toBe("menunggu_entry");
    expect(
      conflictingSignals({ ...waiting, status: "target_tercapai" }, [h4]),
    ).toEqual([]);
  });
});
describe("gold open-market entry budget", () => {
  it("starts new gold signals paused until provider status is known", () => {
    const signal = makeSignal(
      "XAUUSD",
      "5m",
      demoVotes,
      demoScanner,
      defaultSettings,
      "OANDA",
      0,
    )!;
    expect(signal.expiresAt).toBeNull();
    expect(signal.entryClock).toMatchObject({
      remainingMs: 900000,
      state: "unknown",
    });
  });
  it("does not count closed-market or unknown periods", () => {
    let signal = advanceEntryClock(gold(), 0, {
      state: "closed",
      knownUntil: 30000,
    });
    signal = advanceEntryClock(signal, 2 * 86400000, {
      state: "unknown",
      knownUntil: 2 * 86400000,
    });
    expect(signal.entryClock?.remainingMs).toBe(900000);
    expect(signal.expiresAt).toBeNull();
    expect(signalExpired(signal, 2 * 86400000)).toBe(false);
  });
  it("consumes only the confirmed open interval when the provider disappears", () => {
    const open = advanceEntryClock(gold(), 0, {
      state: "open",
      knownUntil: 30000,
    });
    const unknown = advanceEntryClock(open, 120000, {
      state: "unknown",
      knownUntil: 120000,
    });
    expect(unknown.entryClock).toMatchObject({
      remainingMs: 870000,
      state: "unknown",
      at: 120000,
    });
    expect(unknown.expiresAt).toBeNull();
  });
  it("resumes the remaining budget after a weekend and survives serialization/restart", () => {
    let signal = advanceEntryClock(gold(), 0, {
      state: "open",
      knownUntil: 30000,
    });
    signal = advanceEntryClock(signal, 15000, {
      state: "closed",
      knownUntil: 45000,
    });
    signal = JSON.parse(JSON.stringify(signal));
    signal = advanceEntryClock(signal, 2 * 86400000, {
      state: "open",
      knownUntil: 2 * 86400000 + 30000,
    });
    expect(signal.entryClock?.remainingMs).toBe(885000);
    expect(signal.expiresAt).toBe(2 * 86400000 + 885000);
  });
  it("expires when the open-time budget is exhausted and cannot enter at that boundary", () => {
    const base = {
      ...gold(),
      entryClock: {
        remainingMs: 1000,
        at: 0,
        state: "open" as const,
        knownUntil: 2000,
      },
    };
    const exhausted = advanceEntryClock(base, 1000, {
      state: "closed",
      knownUntil: 31000,
    });
    expect(signalExpired(exhausted, 1000)).toBe(true);
    expect(advanceSignal(exhausted, 67440, 1000).status).toBe("kedaluwarsa");
  });
  it("stops consuming time after entry and records TP1 closure on an observed tick", () => {
    const open = advanceEntryClock(gold(), 0, {
      state: "open",
      knownUntil: 30000,
    });
    const active = advanceSignal(open, 67440, 1000);
    expect(active.status).toBe("aktif");
    expect(
      advanceEntryClock(active, 9999999, {
        state: "unknown",
        knownUntil: 9999999,
      }),
    ).toBe(active);
    expect(advanceSignal(active, 68300, 9999999)).toMatchObject({
      status: "target_tercapai",
      hitTargets: [1],
      exitPrice: 68300,
      exitAt: 9999999,
    });
  });
  it("does not resurrect an old budget or consume time twice on a delayed/repeated update", () => {
    const open = advanceEntryClock(gold(), 0, {
      state: "open",
      knownUntil: 30000,
    });
    const later = advanceEntryClock(open, 10000, {
      state: "open",
      knownUntil: 40000,
    });
    expect(
      advanceEntryClock(later, 5000, { state: "closed", knownUntil: 35000 }),
    ).toBe(later);
    expect(
      advanceEntryClock(later, 10000, { state: "open", knownUntil: 40000 })
        .entryClock?.remainingMs,
    ).toBe(890000);
  });
  it("upgrades a legacy waiting signal using its remaining deadline, without inventing past market closures", () => {
    const legacy = { ...waiting, symbol: "XAUUSD" as const };
    expect(
      advanceEntryClock(legacy, 10000, { state: "closed", knownUntil: 40000 })
        .entryClock?.remainingMs,
    ).toBe(890000);
  });
  it("leaves BTC calendar deadlines unaffected", () =>
    expect(
      advanceEntryClock(waiting, 1000, { state: "closed", knownUntil: 31000 }),
    ).toBe(waiting));
});
describe("strict voting and ambiguous candle policy", () => {
  it("uses a 40-point advantage as the exact inclusive tie-breaker boundary", () => {
    const scans = demoScanner.map((scan, i) => ({
      ...scan,
      direction:
        i < 2
          ? ("long" as const)
          : i === 2
            ? ("short" as const)
            : ("abstain" as const),
      score: i < 2 ? 70 : 100,
    }));
    expect(scannerWinner(scans, defaultSettings, true)).toBe("long");
    scans[0].score = 69;
    expect(scannerWinner(scans, defaultSettings, true)).toBeNull();
  });
  it("records ambiguous OHLC without claiming any ordered tick outcome", () => {
    const signal = {
      ...waiting,
      status: "aktif" as const,
      entryTouchedAt: 1000,
    };
    const candle = {
      time: 3600,
      open: 67440,
      high: 69000,
      low: 66000,
      close: 67440,
      volume: 1,
    };
    expect(ambiguousCandle(signal, candle)).toBe(true);
    expect(signal.status).toBe("aktif");
    expect(signal.hitTargets).toEqual([]);
    expect(ambiguousCandle(waiting, candle)).toBe(false);
    expect(ambiguousCandle(signal, { ...candle, low: 67400 })).toBe(false);
  });
});
