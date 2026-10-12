import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testDatabase } from "./test-database";
import { MarketHub } from "./hub";
import { makeSignal } from "../../../packages/shared/src/engine";
import {
  defaultSettings,
  type Quote,
  type Signal,
} from "../../../packages/shared/src/domain";
import { demoScanner, demoVotes } from "../../../packages/shared/src/demo";
const feeds = vi.hoisted(() => ({
  emit: (_quote: Quote) => {},
  latest: null as Quote | null,
}));
vi.mock("./btc-feed", () => ({
  BtcFeed: class {
    latest = null;
    async maintain() {}
  },
}));
vi.mock("./gold-feed", () => ({
  GoldFeed: class {
    constructor(_env: unknown, callback: typeof feeds.emit) {
      feeds.emit = callback;
    }
    get latest() {
      return feeds.latest;
    }
    async maintain() {}
    fallbackUsed() {}
  },
}));
vi.mock("./market", () => ({
  marketQuote: vi.fn().mockRejectedValue(new Error("fixture offline")),
}));
vi.mock("./backfill", () => ({
  backfillChunk: vi.fn(),
  initialBackfill: vi.fn(),
}));
vi.mock("./notifications", () => ({
  claimPriceAlert: vi.fn(),
  enqueue: vi.fn(),
  flushOutbox: vi.fn(),
}));
let fixture: ReturnType<typeof testDatabase>,
  hub: MarketHub,
  pending: Promise<unknown>[];
const now = 1791792000000;
function stored(): Signal {
  return JSON.parse(
    fixture.db.prepare("SELECT value_json FROM signals WHERE id='gold'").get()!
      .value_json as string,
  );
}
function seed(remainingMs = 900000) {
  const signal = makeSignal(
    "XAUUSD",
    "5m",
    demoVotes,
    demoScanner,
    defaultSettings,
    "OANDA",
    now,
  )!;
  Object.assign(signal, {
    id: "gold",
    levels: { entry: [4000, 4001], sl: 3990, tp: [4020, 4050] },
    entryClock: { remainingMs, at: now, state: "unknown", knownUntil: now },
  });
  fixture.db
    .prepare(
      "INSERT INTO signals VALUES('gold','XAUUSD','5m','menunggu_entry',?,?)",
    )
    .run(now, JSON.stringify(signal));
}
async function emit(status: Quote["status"], price = 3900) {
  const quote: Quote = {
    symbol: "XAUUSD",
    source: "OANDA",
    status,
    price,
    at: Date.now(),
    change: 0,
  };
  feeds.latest = status === "stale" ? null : quote;
  feeds.emit(quote);
  await Promise.all(pending);
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  pending = [];
  feeds.latest = null;
  fixture = testDatabase();
  fixture.env.APP_MODE = "live";
  hub = new MarketHub(
    {
      waitUntil(value: Promise<unknown>) {
        pending.push(value);
      },
      getWebSockets: () => [],
      storage: { setAlarm: vi.fn() },
    } as unknown as DurableObjectState,
    fixture.env,
  );
});
afterEach(() => {
  fixture.db.close();
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("persisted gold entry clocks in MarketHub", () => {
  it("counts open time then pauses for closed and unknown market status", async () => {
    seed();
    await emit("live");
    vi.setSystemTime(now + 15000);
    await emit("closed");
    expect(stored().entryClock).toMatchObject({
      remainingMs: 885000,
      state: "closed",
    });
    vi.setSystemTime(now + 86400000);
    feeds.latest = null;
    await hub.alarm();
    expect(stored().entryClock).toMatchObject({
      remainingMs: 885000,
      state: "unknown",
    });
    expect(stored().status).toBe("menunggu_entry");
    expect(
      fixture.db
        .prepare(
          "SELECT count(*) AS n FROM signal_events WHERE kind='entry_clock'",
        )
        .get()?.n,
    ).toBe(3);
  });
  it("expires only after the open-market budget is actually used", async () => {
    seed(2000);
    await emit("closed");
    vi.setSystemTime(now + 100000);
    await hub.alarm();
    expect(stored().status).toBe("menunggu_entry");
    await emit("live");
    vi.setSystemTime(now + 102000);
    await hub.alarm();
    expect(stored().status).toBe("kedaluwarsa");
  });
  it("stops the clock at entry and closes immediately at TP1 on a real observed tick", async () => {
    seed();
    await emit("live", 4000);
    expect(stored().status).toBe("aktif");
    const remaining = stored().entryClock!.remainingMs;
    vi.setSystemTime(now + 86400000);
    feeds.latest = null;
    await hub.alarm();
    expect(stored().status).toBe("aktif");
    expect(stored().entryClock!.remainingMs).toBe(remaining);
    await emit("live", 4021);
    expect(stored()).toMatchObject({
      status: "target_tercapai",
      hitTargets: [1],
      exitPrice: 4021,
      exitAt: now + 86400000,
    });
  });
  it("does not infer an entry from a quote timestamp preceding signal creation", async () => {
    seed();
    feeds.emit({
      symbol: "XAUUSD",
      source: "OANDA",
      status: "live",
      price: 4000,
      change: 0,
      at: now - 1000,
    });
    await Promise.all(pending);
    expect(stored().status).toBe("menunggu_entry");
  });
});
