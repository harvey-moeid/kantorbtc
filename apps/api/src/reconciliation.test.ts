import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { btcCandlesReady, reconcileCandles } from "./reconciliation";
import { backfillChunk, initialBackfill } from "./backfill";
import * as market from "./market";
import type { Env } from "./env";
import {
  seconds,
  timeframes,
  type Candle,
} from "../../../packages/shared/src/domain";
const now = 1791792000000;
const candle = (time: number): Candle => ({
  time,
  open: 100,
  high: 110,
  low: 90,
  close: 105,
  volume: 10,
});
let db: DatabaseSync;
let env: Env;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  db = new DatabaseSync(":memory:");
  for (const name of [
    "0001_initial.sql",
    "0002_backfill.sql",
    "0007_backfill_recovery.sql",
  ])
    db.exec(
      readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"),
    );
  env = {
    DB: {
      prepare(sql: string) {
        const stmt = db.prepare(sql);
        let args: (number | string | null)[] = [];
        return {
          bind(...values: typeof args) {
            args = values;
            return this;
          },
          async first() {
            return stmt.get(...args) ?? null;
          },
          async run() {
            return stmt.run(...args);
          },
          async all() {
            return { results: stmt.all(...args) };
          },
        };
      },
      async batch(stmts: { run(): Promise<unknown> }[]) {
        const values = [];
        for (const stmt of stmts) values.push(await stmt.run());
        return values;
      },
    },
  } as unknown as Env;
});
afterEach(() => {
  db.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("closed-candle scanner readiness", () => {
  it.each(timeframes)("requires a fresh continuous history for %s", (tf) => {
    const size = seconds[tf],
      boundary = Math.floor(now / 1000 / size) * size;
    const data = Array.from({ length: 60 }, (_, i) =>
      candle(boundary - (60 - i) * size),
    );
    expect(btcCandlesReady(data, tf, now)).toBe(true);
    expect(btcCandlesReady(data.slice(0, -1), tf, now)).toBe(false);
    expect(btcCandlesReady([...data, candle(boundary)], tf, now)).toBe(false);
    expect(
      btcCandlesReady(
        data.filter((_, i) => i !== 30),
        tf,
        now,
      ),
    ).toBe(false);
    const gap = [...data];
    gap[30] = candle(gap[30].time - size);
    expect(btcCandlesReady(gap, tf, now)).toBe(false);
  });
});
describe("recovering history after an outage", () => {
  it("persists recent candles and schedules only the missing older range", async () => {
    await market.persistCandles(env, "BTCUSDT", "5m", {
      source: "OKX",
      candles: [candle(300)],
    });
    await reconcileCandles(env, "BTCUSDT", "5m", {
      source: "Binance",
      candles: [candle(1500), candle(1800)],
    });
    expect(db.prepare("SELECT * FROM backfill_jobs").get()).toMatchObject({
      symbol: "BTCUSDT",
      tf: "5m",
      from_time: 600,
      to_time: 1500,
      cursor_time: 1500,
      status: "pending",
      kind: "recovery",
    });
    expect(
      db.prepare("SELECT source FROM candles WHERE time=1500").get()?.source,
    ).toBe("Binance");
    expect(
      db
        .prepare("SELECT from_source,to_source,reason FROM source_events")
        .get(),
    ).toMatchObject({
      from_source: "OKX",
      to_source: "Binance",
      reason: "Candle reconciliation 5m",
    });
  });
  it("does not duplicate recovery jobs on repeated updates or reconstruct candles from price ticks", async () => {
    await market.persistCandles(env, "BTCUSDT", "5m", {
      source: "OKX",
      candles: [candle(300)],
    });
    const data = { source: "OKX", candles: [candle(1500), candle(1800)] };
    await reconcileCandles(env, "BTCUSDT", "5m", data);
    await reconcileCandles(env, "BTCUSDT", "5m", data);
    expect(db.prepare("SELECT count(*) AS n FROM backfill_jobs").get()?.n).toBe(
      1,
    );
    expect(db.prepare("SELECT count(*) AS n FROM candles").get()?.n).toBe(3);
  });
  it("does not create a gap for a fresh database or a continuous update", async () => {
    await reconcileCandles(env, "BTCUSDT", "5m", {
      source: "OKX",
      candles: [candle(300)],
    });
    await reconcileCandles(env, "BTCUSDT", "5m", {
      source: "OKX",
      candles: [candle(600)],
    });
    expect(db.prepare("SELECT count(*) AS n FROM backfill_jobs").get()?.n).toBe(
      0,
    );
  });
  it("prioritizes outage recovery over initial backfill and upserts the exact missing range", async () => {
    db.prepare(
      "INSERT INTO backfill_jobs(id,symbol,tf,from_time,to_time,cursor_time,updated_at,kind) VALUES('initial','BTCUSDT','5m',0,3000,3000,0,'initial')",
    ).run();
    await market.persistCandles(env, "BTCUSDT", "5m", {
      source: "OKX",
      candles: [candle(300)],
    });
    await reconcileCandles(env, "BTCUSDT", "5m", {
      source: "OKX",
      candles: [candle(1500)],
    });
    const load = vi.spyOn(market, "marketCandles").mockResolvedValue({
      source: "OKX",
      candles: [candle(300), candle(600), candle(900), candle(1200)],
    });
    await backfillChunk(env);
    expect(load).toHaveBeenCalledWith(env, "BTCUSDT", "5m", 1500);
    expect(
      db
        .prepare(
          "SELECT status,rows_saved FROM backfill_jobs WHERE kind='recovery'",
        )
        .get(),
    ).toMatchObject({ status: "complete", rows_saved: 3 });
    expect(
      db
        .prepare("SELECT cursor_time FROM backfill_jobs WHERE id='initial'")
        .get()?.cursor_time,
    ).toBe(3000);
    expect(db.prepare("SELECT count(*) AS n FROM candles").get()?.n).toBe(5);
  });
  it("schedules holes inside recent BTC candles while leaving gold session breaks alone", async () => {
    await reconcileCandles(env, "BTCUSDT", "5m", {
      source: "OKX",
      candles: [candle(300), candle(900)],
    });
    await reconcileCandles(env, "XAUUSD", "5m", {
      source: "OANDA",
      candles: [candle(300), candle(900)],
    });
    expect(
      db.prepare("SELECT symbol,from_time,to_time FROM backfill_jobs").all(),
    ).toEqual([{ symbol: "BTCUSDT", from_time: 600, to_time: 900 }]);
  });
  it("initializes all ten history jobs and their marker together, once", async () => {
    await initialBackfill(env);
    await initialBackfill(env);
    expect(
      db
        .prepare("SELECT count(*) AS n FROM backfill_jobs WHERE kind='initial'")
        .get()?.n,
    ).toBe(10);
    expect(
      db
        .prepare(
          "SELECT value_json FROM settings WHERE id='backfill_initialized'",
        )
        .get()?.value_json,
    ).toBe("true");
  });
  it("retains the cursor on a provider failure so an operator can resume", async () => {
    await market.persistCandles(env, "BTCUSDT", "5m", {
      source: "OKX",
      candles: [candle(300)],
    });
    await reconcileCandles(env, "BTCUSDT", "5m", {
      source: "OKX",
      candles: [candle(1500)],
    });
    vi.spyOn(market, "marketCandles").mockRejectedValue(
      new Error("provider-secret"),
    );
    await backfillChunk(env);
    expect(
      db.prepare("SELECT cursor_time,status,error FROM backfill_jobs").get(),
    ).toMatchObject({ cursor_time: 1500, status: "failed" });
    expect(
      db.prepare("SELECT error FROM backfill_jobs").get()?.error,
    ).not.toContain("provider-secret");
  });
});
