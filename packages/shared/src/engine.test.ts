import { describe, expect, it } from "vitest";
import { defaultSettings, type Scan } from "./domain";
import { demoCandles, demoScanner, demoSignals, demoVotes } from "./demo";
import {
  advanceSignal,
  decide,
  ema,
  makeSignal,
  rsi,
  scan,
  scannerCandidates,
  scannerWinner,
  validateLevels,
} from "./engine";
describe("deterministic risk and approval engine", () => {
  it("approves a three-vote majority with RR measured at worst long entry", () => {
    const d = decide(demoVotes, demoScanner);
    expect(d.approved).toBe(true);
    expect(d.rr).toBe(2);
    expect(d.confidence).toBe(84);
  });
  it("uses worst short entry", () => {
    expect(
      validateLevels({ entry: [100, 110], sl: 120, tp: [80] }, "short"),
    ).toMatchObject({ valid: true, rr: 1 });
  });
  it("uses worst long entry", () => {
    expect(
      validateLevels({ entry: [100, 110], sl: 90, tp: [130] }, "long"),
    ).toMatchObject({ valid: true, rr: 1 });
  });
  it.each([
    { entry: [110, 100], sl: 90, tp: [130] },
    { entry: [100, 110], sl: 105, tp: [130] },
    { entry: [100, 110], sl: 90, tp: [105] },
    { entry: [100, 110], sl: 90, tp: [130, 125] },
    { entry: [100, 110], sl: 90, tp: [] },
    { entry: [100, Infinity], sl: 90, tp: [130] },
  ])("rejects malformed or direction-inconsistent levels %#", (levels) =>
    expect(validateLevels(levels as never, "long").valid).toBe(false),
  );
  it("does not let a distant TP2 compensate for inadequate TP1", () => {
    const votes = demoVotes.map((v) =>
      v.levels ? { ...v, levels: { ...v.levels, tp: [67500, 69900] } } : v,
    );
    expect(decide(votes, demoScanner).approved).toBe(false);
  });
  it("rejects invalid level supplied by a majority participant", () => {
    const votes = structuredClone(demoVotes);
    votes[0].levels!.sl = 90000;
    expect(decide(votes, demoScanner).approved).toBe(false);
  });
  it("rejects insufficient quorum", () => {
    const votes = demoVotes.map((v, i) =>
      i < 2 ? { ...v, direction: "abstain" as const, levels: null } : v,
    );
    expect(decide(votes, demoScanner).reason).toContain("kuorum");
  });
  it("never uses a failed vote to manufacture a two-two tie-breaker", () => {
    const votes = structuredClone(demoVotes);
    votes[2] = {
      ...votes[2],
      direction: "short",
      levels: { entry: [67400, 67480], sl: 67800, tp: [66600] },
    };
    votes[3] = { ...votes[3], direction: "abstain", levels: null };
    expect(
      decide(votes, demoScanner, { ...defaultSettings, tieMargin: 40 })
        .approved,
    ).toBe(false);
  });
  it("accepts three directional votes even when the fourth slot abstains", () => {
    const votes = structuredClone(demoVotes);
    votes[3] = { ...votes[3], direction: "abstain", levels: null };
    expect(decide(votes, demoScanner)).toMatchObject({
      approved: true,
      tieBreaker: false,
      direction: "long",
    });
  });
  it("requires exactly four slots", () =>
    expect(decide(demoVotes.slice(0, 3), demoScanner).approved).toBe(false));
  it("does not silently choose an unset tie-breaker margin", () => {
    const votes = demoVotes.map((v, i) => ({
      ...v,
      direction: i < 2 ? ("long" as const) : ("short" as const),
      levels:
        i < 2
          ? demoVotes[0].levels
          : {
              entry: [67400, 67480] as [number, number],
              sl: 67800,
              tp: [66600],
            },
    }));
    expect(
      decide(votes, demoScanner, { ...defaultSettings, tieMargin: null })
        .approved,
    ).toBe(false);
    expect(
      decide(votes, demoScanner, { ...defaultSettings, tieMargin: 30 }),
    ).toMatchObject({ approved: true, tieBreaker: true, direction: "long" });
  });
  it("requires a greater supporting group count for tie-breaker", () => {
    const scans = demoScanner.map((s, i) => ({
      ...s,
      direction: i < 2 ? ("long" as const) : ("short" as const),
      score: 80,
    }));
    expect(
      scannerWinner(scans, { ...defaultSettings, tieMargin: 0 }, true),
    ).toBe(null);
  });
  it("opposing scanner voices do not cancel the AI trigger", () => {
    const scans = demoScanner.map((s, i) => ({
      ...s,
      direction: i < 2 ? ("long" as const) : ("short" as const),
      score: 80,
    }));
    expect(scannerCandidates(scans, defaultSettings)).toEqual([
      "long",
      "short",
    ]);
  });
  it("excludes abstain and disabled groups from trigger counts", () => {
    const scans: Scan[] = demoScanner.map((s, i) => ({
      ...s,
      direction: i < 2 ? "long" : "abstain",
    }));
    expect(
      scannerCandidates(scans, {
        ...defaultSettings,
        enabled: { ...defaultSettings.enabled, indicators: false },
      }),
    ).toEqual([]);
  });
  it("takes only targets shared by all majority votes", () => {
    const votes = structuredClone(demoVotes);
    votes[0].levels!.tp = [68280];
    expect(decide(votes, demoScanner).levels!.tp).toEqual([68280]);
  });
  it("does not publish when admin explicitly clears a lifetime", () => {
    expect(
      makeSignal(
        "BTCUSDT",
        "H1",
        demoVotes,
        demoScanner,
        { ...defaultSettings, ttl: { ...defaultSettings.ttl, H1: null } },
        "OKX",
        1000,
      ),
    ).toBe(null);
  });
  it("creates signal when timeframe lifetime is configured", () => {
    const s = makeSignal(
      "BTCUSDT",
      "H1",
      demoVotes,
      demoScanner,
      { ...defaultSettings, ttl: { ...defaultSettings.ttl, H1: 21600 } },
      "OKX",
      1000,
    );
    expect(s).toMatchObject({ status: "menunggu_entry", expiresAt: 21601000 });
  });
});
describe("observed tick lifecycle", () => {
  it("records entry touch time and price", () => {
    const signal = { ...demoSignals[0], expiresAt: 100000 };
    expect(advanceSignal(signal, 67440, 1000)).toMatchObject({
      status: "aktif",
      entryTouchedAt: 1000,
      entryTouchedPrice: 67440,
    });
  });
  it("does not claim an entry was touched by an unobserved tick", () =>
    expect(
      advanceSignal(demoSignals[0], 68000, demoSignals[0].createdAt).status,
    ).toBe("menunggu_entry"));
  it("closes immediately at TP1 while recording the observed target", () => {
    const s = { ...demoSignals[0], status: "aktif" as const, expiresAt: null };
    expect(advanceSignal(s, 68300, 1000)).toMatchObject({
      status: "target_tercapai",
      hitTargets: [1],
    });
  });
  it("closes at TP1 even when a tick jumps past additional targets", () =>
    expect(
      advanceSignal(
        { ...demoSignals[0], status: "aktif", expiresAt: null },
        70000,
        1000,
      ),
    ).toMatchObject({ status: "target_tercapai", hitTargets: [1] }));
  it("closes on stop loss", () =>
    expect(
      advanceSignal(
        { ...demoSignals[0], status: "aktif", expiresAt: null },
        67000,
        1000,
      ).status,
    ).toBe("stop_loss"));
  it("expires on the configured timestamp", () =>
    expect(
      advanceSignal({ ...demoSignals[0], expiresAt: 1000 }, 67440, 1000).status,
    ).toBe("kedaluwarsa"));
  it("stops the expiry countdown after entry while retaining the deadline for audit", () => {
    const waiting = { ...demoSignals[0], expiresAt: 2000 };
    const active = advanceSignal(waiting, 67440, 1000);
    expect(active).toMatchObject({
      status: "aktif",
      expiresAt: 2000,
      entryTouchedAt: 1000,
    });
    expect(advanceSignal(active, 68300, 5000)).toMatchObject({
      status: "target_tercapai",
      hitTargets: [1],
    });
    expect(advanceSignal(active, 70000, 6000).status).toBe("target_tercapai");
    expect(advanceSignal(active, 67000, 6000).status).toBe("stop_loss");
  });
  it("never changes a terminal signal", () =>
    expect(advanceSignal(demoSignals[2], 99999, 1000)).toBe(demoSignals[2]));
});
describe("scanner and indicators", () => {
  it("EMA retains constant input", () =>
    expect(ema([10, 10, 10], 20)).toEqual([10, 10, 10]));
  it("RSI is neutral on a flat market", () =>
    expect(rsi(Array(30).fill(10)).at(-1)).toBe(50));
  it("RSI distinguishes rising and falling data", () => {
    expect(rsi(Array.from({ length: 30 }, (_, i) => i)).at(-1)).toBe(100);
    expect(rsi(Array.from({ length: 30 }, (_, i) => 30 - i)).at(-1)).toBe(0);
  });
  it("abstains when candles are insufficient", () =>
    expect(
      scan(demoCandles("BTCUSDT", "H1", 10)).every(
        (s) => s.direction === "abstain",
      ),
    ).toBe(true));
  it("abstains from missing derivatives without inventing data", () =>
    expect(scan(demoCandles("BTCUSDT", "H1"))[3].direction).toBe("abstain"));
  it("abstains when volume is missing", () =>
    expect(
      scan(demoCandles("XAUUSD", "H1").map((c) => ({ ...c, volume: 0 })))[2]
        .direction,
    ).toBe("abstain"));
});
