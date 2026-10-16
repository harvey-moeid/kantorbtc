import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { persistCandles } from "./market";
import type { Env } from "./env";
import type { Candle } from "../../../packages/shared/src/domain";

describe("candle persistence", () => {
  let db: DatabaseSync;
  let env: Env;
  const batch = vi.fn(async (statements: D1PreparedStatement[]) =>
    Promise.all(statements.map((s) => s.run())),
  );
  const candle: Candle = {
    time: 300,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 42,
  };
  const save = (
    candles = [candle],
    source = "OKX",
    symbol: "BTCUSDT" | "XAUUSD" = "BTCUSDT",
    tf: "5m" | "H1" = "5m",
  ) => persistCandles(env, symbol, tf, { candles, source });
  beforeEach(() => {
    batch.mockClear();
    db = new DatabaseSync(":memory:");
    db.exec(
      readFileSync(
        new URL("../migrations/0001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    env = {
      DB: {
        batch,
        prepare(sql: string) {
          const stmt = db.prepare(sql);
          let values: (string | number | null)[] = [];
          return {
            bind(...input: (string | number | null)[]) {
              values = input;
              return this;
            },
            async all() {
              return { results: stmt.all(...values) };
            },
            async run() {
              return stmt.run(...values);
            },
          };
        },
      } as unknown as D1Database,
    } as Env;
  });
  afterEach(() => db.close());
  it("sends no write batch for identical candles, including after another caller persisted them", async () => {
    await save();
    batch.mockClear();
    await save([{ ...candle }]);
    expect(batch).not.toHaveBeenCalled();
    expect(db.prepare("SELECT COUNT(*) AS n FROM candles").get()?.n).toBe(1);
  });
  it.each(["open", "high", "low", "close", "volume"] as const)(
    "preserves corrections to %s",
    async (field) => {
      await save();
      batch.mockClear();
      await save([{ ...candle, [field]: candle[field] + 1 }]);
      expect(batch.mock.calls[0][0]).toHaveLength(1);
      expect(
        db.prepare(`SELECT ${field} AS value FROM candles`).get()?.value,
      ).toBe(candle[field] + 1);
    },
  );
  it("updates source and keeps symbol/timeframe keys separate", async () => {
    await save();
    await save([candle], "Binance");
    expect(db.prepare("SELECT source FROM candles").get()?.source).toBe(
      "Binance",
    );
    await save([candle], "OKX", "XAUUSD");
    await save([candle], "OKX", "BTCUSDT", "H1");
    expect(db.prepare("SELECT COUNT(*) AS n FROM candles").get()?.n).toBe(3);
  });
  it("writes only a new candle in an overlapping history batch", async () => {
    await save();
    batch.mockClear();
    await save([candle, { ...candle, time: 600 }]);
    expect(batch.mock.calls[0][0]).toHaveLength(1);
  });
  it("handles empty input and batches over 50 candles", async () => {
    await save([]);
    expect(batch).not.toHaveBeenCalled();
    const candles = Array.from({ length: 121 }, (_, i) => ({
      ...candle,
      time: i * 300,
    }));
    await save(candles);
    expect(batch.mock.calls.map(([s]) => s.length)).toEqual([50, 50, 21]);
    batch.mockClear();
    await save(candles);
    expect(batch).not.toHaveBeenCalled();
  });
  it("SQL guard avoids an identical update if a concurrent writer fills the row after the read", async () => {
    await save();
    const upsert = batch.mock.calls[0][0][0];
    const result = await upsert.run();
    expect(result).toMatchObject({ changes: 0 });
  });
});
