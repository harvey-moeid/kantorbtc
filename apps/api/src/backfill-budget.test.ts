import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Env } from "./env";
vi.mock("./market", () => ({
  marketCandles: vi.fn(async () => ({
    candles: [{ time: 100, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
    source: "OKX",
  })),
  persistCandles: vi.fn(),
}));
import { backfillChunk } from "./backfill";
import { marketCandles } from "./market";
let db: DatabaseSync;
function setup() {
  db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  db.exec(
    readFileSync(
      new URL("../migrations/0002_backfill.sql", import.meta.url),
      "utf8",
    ),
  );
  return {
    DB: {
      prepare(sql: string) {
        const stmt = db.prepare(sql);
        let values: (string | number | null)[] = [];
        return {
          bind(...args: (string | number | null)[]) {
            values = args;
            return this;
          },
          async first() {
            return stmt.get(...values) || null;
          },
          async run() {
            return stmt.run(...values);
          },
        };
      },
    },
  } as unknown as Env;
}
afterEach(() => {
  db.close();
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("global historical backfill budget", () => {
  it("takes one page across all jobs per 15 minutes, including after restart", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
    const env = setup();
    db.exec(
      "INSERT INTO backfill_jobs(id,symbol,tf,from_time,to_time,cursor_time,updated_at) VALUES('a','BTCUSDT','5m',0,1000,1000,0),('b','BTCUSDT','15m',0,1000,1000,1)",
    );
    await backfillChunk(env);
    vi.advanceTimersByTime(15000);
    await backfillChunk({ ...env });
    expect(marketCandles).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(885000);
    await backfillChunk(env);
    expect(marketCandles).toHaveBeenCalledTimes(2);
  });
  it("does not write a budget marker with no pending jobs", async () => {
    const env = setup();
    await backfillChunk(env);
    expect(db.prepare("SELECT COUNT(*) AS n FROM settings").get()?.n).toBe(0);
    expect(marketCandles).not.toHaveBeenCalled();
  });
});
