import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "./test-database";
import { publishSignal } from "./signal-publication";
import { advanceSignal } from "../../../packages/shared/src/engine";
import { recordCandleAmbiguities } from "./signal-ambiguity";
import { demoSignals } from "../../../packages/shared/src/demo";
import type { Signal } from "../../../packages/shared/src/domain";
let fixture: ReturnType<typeof testDatabase>;
const waiting: Signal = {
  ...demoSignals[0],
  id: "old",
  createdAt: 0,
  expiresAt: 900000,
};
const replacement: Signal = {
  ...waiting,
  id: "new",
  createdAt: 1000,
  direction: "short",
};
beforeEach(() => {
  fixture = testDatabase();
});
afterEach(() => fixture.db.close());
function insert(signal: Signal) {
  fixture.db
    .prepare("INSERT INTO signals VALUES(?,?,?,?,?,?)")
    .run(
      signal.id,
      signal.symbol,
      signal.tf,
      signal.status,
      signal.createdAt,
      JSON.stringify(signal),
    );
}
function stored(id: string): Signal {
  return JSON.parse(
    fixture.db.prepare("SELECT value_json FROM signals WHERE id=?").get(id)!
      .value_json as string,
  );
}
describe("atomic signal publication and cancellation", () => {
  it("publishes the replacement and cancels only waiting opponents on the same asset/timeframe", async () => {
    insert(waiting);
    insert({ ...waiting, id: "active", status: "aktif" });
    insert({ ...waiting, id: "h4", tf: "H4" });
    insert({ ...waiting, id: "gold", symbol: "XAUUSD" });
    insert({ ...replacement, id: "same", createdAt: 0 });
    await publishSignal(fixture.env, replacement, {
      symbol: "BTCUSDT",
      price: 67500,
      at: 1000,
      source: "OKX",
      status: "live",
      change: 0,
    });
    expect(stored("old")).toMatchObject({
      status: "dibatalkan",
      cancelledBySignalId: "new",
      cancelledAt: 1000,
    });
    for (const id of ["h4", "gold", "same", "new"])
      expect(stored(id).status).toBe("menunggu_entry");
    expect(stored("active").status).toBe("aktif");
    const audit = fixture.db
      .prepare(
        "SELECT price,value_json FROM signal_events WHERE kind='dibatalkan'",
      )
      .get()!;
    expect(audit.price).toBe(67500);
    expect(JSON.parse(audit.value_json as string)).toMatchObject({
      reason: "opposing_signal_same_timeframe",
      cancelledBySignalId: "new",
    });
  });
  it("does not invent an observed cancellation price when none is available", async () => {
    insert(waiting);
    await publishSignal(fixture.env, replacement);
    expect(
      fixture.db
        .prepare("SELECT price FROM signal_events WHERE kind='dibatalkan'")
        .get()?.price,
    ).toBeNull();
  });
  it("deduplicates repeated publication and audit events", async () => {
    insert(waiting);
    await publishSignal(fixture.env, replacement);
    await publishSignal(fixture.env, replacement);
    expect(
      fixture.db.prepare("SELECT count(*) AS n FROM signals").get()?.n,
    ).toBe(2);
    expect(
      fixture.db.prepare("SELECT count(*) AS n FROM signal_events").get()?.n,
    ).toBe(2);
  });
  it("rolls back publication and cancellation together if audit insertion fails", async () => {
    insert(waiting);
    fixture.db.exec(
      "CREATE TRIGGER fail_audit BEFORE INSERT ON signal_events WHEN NEW.kind='dibatalkan' BEGIN SELECT RAISE(ABORT,'fixture failure'); END",
    );
    await expect(publishSignal(fixture.env, replacement)).rejects.toThrow(
      "fixture failure",
    );
    expect(stored("old").status).toBe("menunggu_entry");
    expect(
      fixture.db.prepare("SELECT id FROM signals WHERE id='new'").get(),
    ).toBeUndefined();
    expect(
      fixture.db.prepare("SELECT count(*) AS n FROM signal_events").get()?.n,
    ).toBe(0);
  });
  it("does not publish rejected meetings or mutate older signals for them", async () => {
    insert(waiting);
    await expect(
      publishSignal(fixture.env, { ...replacement, status: "ditolak" }),
    ).rejects.toThrow();
    expect(stored("old").status).toBe("menunggu_entry");
  });
});
describe("OHLC ambiguity auditing", () => {
  it("marks the overall outcome unknown without assigning TP or SL", async () => {
    insert({ ...waiting, status: "aktif", entryTouchedAt: 1000 });
    const data = {
      source: "OKX",
      candles: [
        {
          time: 3600,
          open: 67440,
          high: 69000,
          low: 66000,
          close: 67440,
          volume: 1,
        },
      ],
    };
    await recordCandleAmbiguities(fixture.env, "BTCUSDT", "H1", data);
    await recordCandleAmbiguities(fixture.env, "BTCUSDT", "H1", data);
    expect(stored("old").status).toBe("ambigu");
    expect(stored("old").hitTargets).toEqual([]);
    const events = fixture.db
      .prepare("SELECT kind,price,value_json FROM signal_events")
      .all();
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("ambigu");
    expect(events[0].price).toBeNull();
    expect(JSON.parse(events[0].value_json as string)).toMatchObject({
      resolution: "unknown",
      reason: "tp_sl_same_candle",
    });
  });
  it("does not apply old candles, other timeframes, or terminal signals", async () => {
    insert({ ...waiting, status: "target_tercapai", entryTouchedAt: 1000 });
    const data = {
      source: "OKX",
      candles: [
        {
          time: 3600,
          open: 67440,
          high: 69000,
          low: 66000,
          close: 67440,
          volume: 1,
        },
      ],
    };
    await recordCandleAmbiguities(fixture.env, "BTCUSDT", "H1", data);
    expect(
      fixture.db.prepare("SELECT count(*) AS n FROM signal_events").get()?.n,
    ).toBe(0);
  });
  it("does not assign a later tick outcome after earlier touches became ambiguous", async () => {
    insert({ ...waiting, status: "aktif", entryTouchedAt: 1000 });
    await recordCandleAmbiguities(fixture.env, "BTCUSDT", "H1", {
      source: "OKX",
      candles: [
        {
          time: 3600,
          open: 67440,
          high: 69000,
          low: 66000,
          close: 67440,
          volume: 1,
        },
      ],
    });
    const unknown = stored("old");
    expect(advanceSignal(unknown, 70000, 9999999)).toBe(unknown);
    expect(advanceSignal(unknown, 60000, 9999999)).toBe(unknown);
  });
  it("downgrades an exit observed after an earlier ambiguous closed candle, while retaining its observed price", async () => {
    insert({
      ...waiting,
      status: "target_tercapai",
      entryTouchedAt: 1000,
      exitAt: 8000000,
      exitPrice: 68300,
    });
    await recordCandleAmbiguities(fixture.env, "BTCUSDT", "H1", {
      source: "OKX",
      candles: [
        {
          time: 3600,
          open: 67440,
          high: 69000,
          low: 66000,
          close: 67440,
          volume: 1,
        },
      ],
    });
    expect(stored("old")).toMatchObject({
      status: "ambigu",
      exitAt: 8000000,
      exitPrice: 68300,
    });
  });
  it("preserves a known tick exit inside a candle even if its later OHLC touches both levels", async () => {
    insert({
      ...waiting,
      status: "stop_loss",
      entryTouchedAt: 1000,
      exitAt: 4000000,
      exitPrice: 67000,
    });
    await recordCandleAmbiguities(fixture.env, "BTCUSDT", "H1", {
      source: "OKX",
      candles: [
        {
          time: 3600,
          open: 67440,
          high: 69000,
          low: 66000,
          close: 67440,
          volume: 1,
        },
      ],
    });
    expect(stored("old").status).toBe("stop_loss");
    expect(
      fixture.db.prepare("SELECT count(*) AS n FROM signal_events").get()?.n,
    ).toBe(0);
  });
});
