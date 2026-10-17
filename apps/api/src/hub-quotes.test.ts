import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Quote } from "../../../packages/shared/src/domain";
import type { Env } from "./env";
const feed = vi.hoisted(() => ({
  onQuote: null as null | ((quote: Quote) => void),
}));
vi.mock("./btc-feed", () => ({
  BtcFeed: class {
    constructor(callback: (quote: Quote) => void) {
      feed.onQuote = callback;
    }
  },
}));
import { MarketHub } from "./hub";

const quote: Quote = {
  symbol: "BTCUSDT",
  price: 100,
  change: 0,
  source: "OKX",
  status: "live",
  at: 0,
};
const dbs: DatabaseSync[] = [];
function setup(fail = false, existingDb?: DatabaseSync) {
  const db = existingDb || new DatabaseSync(":memory:");
  if (!existingDb) {
    dbs.push(db);
    db.exec(
      readFileSync(
        new URL("../migrations/0001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
  }
  const writes = vi.fn();
  const pending: Promise<unknown>[] = [];
  const env = {
    DB: {
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
          async first() {
            return stmt.get(...values) || null;
          },
          async run() {
            writes(sql);
            if (fail) throw new Error("quota");
            return stmt.run(...values);
          },
        };
      },
    },
  } as unknown as Env;
  const hub = new MarketHub(
    {
      getWebSockets: () => [],
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    } as unknown as DurableObjectState,
    env,
  );
  return {
    hub,
    db,
    writes,
    async tick(price: number, symbol = quote.symbol) {
      feed.onQuote!({ ...quote, symbol, price, at: Date.now() });
      await Promise.all(pending.splice(0));
    },
  };
}
afterEach(() => {
  dbs.splice(0).forEach((db) => db.close());
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("quote D1 budget", () => {
  it("writes once per five minutes while serving every fresh tick from memory", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
    const s = setup();
    await s.tick(100);
    for (let i = 1; i < 300; i++) {
      vi.advanceTimersByTime(1000);
      await s.tick(100 + i);
    }
    expect(s.writes).toHaveBeenCalledTimes(1);
    const response = await s.hub.fetch(new Request("https://hub/quotes"));
    expect(
      ((await response.json()) as { quotes: Quote[] }).quotes[0],
    ).toMatchObject({ price: 399, status: "live" });
    const health = await s.hub.fetch(new Request("https://hub/health"));
    expect(await health.json()).toEqual({
      markets: [
        { symbol: "BTCUSDT", status: "fresh" },
        { symbol: "XAUUSD", status: "missing" },
      ],
    });
    vi.advanceTimersByTime(1000);
    await s.tick(400);
    expect(s.writes).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(
        s.db.prepare("SELECT value_json FROM quotes").get()!
          .value_json as string,
      ).price,
    ).toBe(400);
  });
  it("SQL guard preserves the write interval after hub recreation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
    const s = setup();
    await s.tick(100);
    vi.advanceTimersByTime(1000);
    const restarted = setup(false, s.db);
    await restarted.tick(101);
    expect(
      JSON.parse(
        s.db.prepare("SELECT value_json FROM quotes").get()!
          .value_json as string,
      ).price,
    ).toBe(100);
  });
  it("does not retry exhausted D1 on each tick or lose realtime quotes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = setup(true);
    await s.tick(100);
    await s.tick(101);
    expect(s.writes).toHaveBeenCalledTimes(1);
    const response = await s.hub.fetch(new Request("https://hub/quotes"));
    expect(
      ((await response.json()) as { quotes: Quote[] }).quotes[0].price,
    ).toBe(101);
  });
  it("budgets each symbol separately and marks old snapshots stale", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
    const s = setup();
    await s.tick(100);
    await s.tick(200, "XAUUSD");
    expect(s.writes).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(46000);
    const response = await s.hub.fetch(new Request("https://hub/quotes"));
    expect(
      ((await response.json()) as { quotes: Quote[] }).quotes.every(
        (q) => q.status === "stale",
      ),
    ).toBe(true);
  });
});
