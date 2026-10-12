import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { MarketHub } from "./hub";
import type { Env } from "./env";
import type { Quote } from "../../../packages/shared/src/domain";
import { demoSignals } from "../../../packages/shared/src/demo";
const feeds = vi.hoisted(() => ({
  btc: (_q: Quote) => {},
  gold: (_q: Quote) => {},
}));
vi.mock("./btc-feed", () => ({
  BtcFeed: class {
    latest = null;
    constructor(cb: typeof feeds.btc) {
      feeds.btc = cb;
    }
    async maintain() {}
  },
}));
vi.mock("./gold-feed", () => ({
  GoldFeed: class {
    latest = null;
    constructor(_env: Env, cb: typeof feeds.gold) {
      feeds.gold = cb;
    }
    async maintain() {}
  },
}));
let db: DatabaseSync;
let pending: Promise<unknown>[];
let messages: unknown[];
const now = 1791792000000;
const quote = (price: number, extra: Partial<Quote> = {}): Quote => ({
  symbol: "BTCUSDT",
  source: "OKX",
  status: "live",
  price,
  change: 0,
  at: Date.now(),
  ...extra,
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  pending = [];
  messages = [];
  db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  const env = {
    DB: {
      prepare(sql: string) {
        const statement = db.prepare(sql);
        let args: (string | number | null)[] = [];
        return {
          bind(...values: typeof args) {
            args = values;
            return this;
          },
          async first() {
            return statement.get(...args) ?? null;
          },
          async all() {
            return { results: statement.all(...args) };
          },
          async run() {
            const result = statement.run(...args);
            return { meta: { changes: Number(result.changes) } };
          },
        };
      },
      async batch(statements: { run(): Promise<unknown> }[]) {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        return results;
      },
    },
  } as unknown as Env;
  const hub = new MarketHub(
    {
      waitUntil(value: Promise<unknown>) {
        pending.push(value);
      },
    } as unknown as DurableObjectState,
    env,
  );
  vi.spyOn(hub, "broadcast").mockImplementation(
    async (_public, privateEvent) => {
      if (privateEvent) messages.push(privateEvent);
    },
  );
});
afterEach(() => {
  db.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function emit(value: Quote) {
  (value.symbol === "BTCUSDT" ? feeds.btc : feeds.gold)(value);
  await Promise.all(pending);
}
function stored(symbol = "BTCUSDT"): Quote {
  return JSON.parse(
    db.prepare("SELECT value_json FROM quotes WHERE symbol=?").get(symbol)!
      .value_json as string,
  );
}
describe("serialized MarketHub quote processing", () => {
  it("persists both asset streams independently and drops out-of-order data", async () => {
    await emit(quote(100));
    await emit(quote(4000, { symbol: "XAUUSD", source: "OANDA" }));
    await emit(quote(99, { at: now - 1000 }));
    expect(stored().price).toBe(100);
    expect(stored("XAUUSD").price).toBe(4000);
    expect(messages).toHaveLength(2);
  });
  it("records stream source switches without treating the source gap as a price alert crossing", async () => {
    db.prepare(
      "INSERT INTO alerts(id,symbol,price,created_at) VALUES('level','BTCUSDT',105,0)",
    ).run();
    await emit(quote(100));
    vi.setSystemTime(now + 1000);
    await emit(quote(110, { source: "Binance", status: "fallback" }));
    expect(
      db.prepare("SELECT from_source,to_source FROM source_events").get(),
    ).toMatchObject({ from_source: "OKX", to_source: "Binance" });
    expect(db.prepare("SELECT fired FROM alerts").get()?.fired).toBe(0);
    expect(stored().source).toBe("Binance");
    vi.setSystemTime(now + 2000);
    await emit(quote(104, { source: "Binance", status: "fallback" }));
    expect(db.prepare("SELECT fired FROM alerts").get()?.fired).toBe(1);
  });
  it("persists a status change immediately even at the same price timestamp", async () => {
    await emit(quote(100));
    await emit(quote(100, { status: "closed" }));
    expect(stored().status).toBe("closed");
    expect(messages).toHaveLength(2);
  });
  it("does not replace a newer price with an older closed snapshot", async () => {
    await emit(quote(100));
    await emit(quote(90, { at: now - 3600000, status: "closed" }));
    expect(stored()).toMatchObject({ price: 100, at: now, status: "closed" });
  });
  it("rejects invalid quotes and never touches entry on a closed/stale price", async () => {
    const signal = {
      ...demoSignals[0],
      id: "signal",
      symbol: "BTCUSDT",
      status: "menunggu_entry",
      levels: { entry: [100, 100], sl: 90, tp: [120] },
      expiresAt: now + 1000000,
    };
    db.prepare(
      "INSERT INTO signals(id,symbol,tf,status,created_at,value_json) VALUES('signal','BTCUSDT','H1','menunggu_entry',0,?)",
    ).run(JSON.stringify(signal));
    await emit(quote(100, { status: "closed" }));
    vi.setSystemTime(now + 1000);
    await emit(quote(100, { status: "stale" }));
    await emit(quote(Infinity));
    await emit(quote(-1));
    await emit(quote(100, { at: now + 100000 }));
    expect(messages).toHaveLength(2);
    expect(db.prepare("SELECT status FROM signals").get()?.status).toBe(
      "menunggu_entry",
    );
    vi.setSystemTime(now + 2000);
    await emit(quote(100));
    expect(db.prepare("SELECT status FROM signals").get()?.status).toBe(
      "aktif",
    );
  });
  it("does not claim a price alert from a closed-to-open gap", async () => {
    db.prepare(
      "INSERT INTO alerts(id,symbol,price,created_at) VALUES('level','BTCUSDT',105,0)",
    ).run();
    await emit(quote(100, { status: "closed" }));
    vi.setSystemTime(now + 1000);
    await emit(quote(110));
    expect(db.prepare("SELECT fired FROM alerts").get()?.fired).toBe(0);
  });
});
