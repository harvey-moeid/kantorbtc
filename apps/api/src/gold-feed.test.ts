import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoldFeed } from "./gold-feed";
import { credential } from "./data";
import type { Env } from "./env";
import type { Quote } from "../../../packages/shared/src/domain";
vi.mock("./data", () => ({ credential: vi.fn() }));
let feed: GoldFeed;
let controller: ReadableStreamDefaultController<Uint8Array>;
let emitted: Quote[];
let request: ReturnType<typeof vi.fn>;
const now = 1791792000000;
const tick = (extra = {}) => ({
  type: "PRICE",
  instrument: "XAU_USD",
  closeoutBid: "4000",
  closeoutAsk: "4002",
  status: "tradeable",
  time: new Date(Date.now()).toISOString(),
  ...extra,
});
const send = (data: unknown) =>
  controller.enqueue(new TextEncoder().encode(JSON.stringify(data) + "\n"));
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  emitted = [];
  vi.mocked(credential).mockResolvedValue("test-oanda-key");
  request = vi.fn(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(value) {
            controller = value;
          },
        }),
      ),
  );
  vi.stubGlobal("fetch", request);
  feed = new GoldFeed(
    { OANDA_ACCOUNT_ID: "fixture-account", OANDA_ENV: "practice" } as Env,
    (quote) => emitted.push(quote),
  );
});
afterEach(async () => {
  feed.stop();
  await flush();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});
describe("OANDA pricing stream", () => {
  it("opens exactly one practice stream and normalizes mid-prices", async () => {
    await feed.maintain();
    await feed.maintain();
    send(tick());
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toContain("stream-fxpractice.oanda.com");
    expect(emitted[0]).toEqual({
      symbol: "XAUUSD",
      price: 4001,
      change: 0,
      source: "OANDA",
      status: "live",
      at: now,
    });
    expect(feed.latest).toEqual(emitted[0]);
    expect(JSON.stringify(emitted)).not.toContain("test-oanda-key");
  });
  it("handles messages split across chunks and several frames in one chunk", async () => {
    await feed.maintain();
    const line = JSON.stringify(tick());
    controller.enqueue(new TextEncoder().encode(line.slice(0, 31)));
    await flush();
    expect(emitted).toHaveLength(0);
    controller.enqueue(
      new TextEncoder().encode(
        line.slice(31) +
          "\n" +
          JSON.stringify({
            type: "HEARTBEAT",
            time: new Date(now).toISOString(),
          }) +
          "\n",
      ),
    );
    await flush();
    expect(emitted).toHaveLength(1);
    expect(feed.latest?.price).toBe(4001);
  });
  it("ignores malformed, stale, future, wrong-instrument and invalid prices", async () => {
    await feed.maintain();
    controller.enqueue(new TextEncoder().encode("not-json\nnull\n"));
    for (const value of [
      tick({ instrument: "EUR_USD" }),
      tick({ closeoutBid: "NaN" }),
      tick({ closeoutBid: "-1" }),
      tick({ closeoutAsk: "3999" }),
      tick({ time: new Date(now - 31000).toISOString() }),
      tick({ time: new Date(now + 6000).toISOString() }),
    ])
      send(value);
    await flush();
    expect(emitted).toHaveLength(0);
    send(tick());
    send(tick());
    await flush();
    expect(emitted).toHaveLength(1);
  });
  it("heartbeat alone does not fabricate quotes or keep a stale market price live", async () => {
    await feed.maintain();
    send({ type: "HEARTBEAT", time: new Date(now).toISOString() });
    await flush();
    expect(feed.latest).toBeNull();
    send(tick());
    await flush();
    vi.setSystemTime(now + 31000);
    send({ type: "HEARTBEAT", time: new Date(Date.now()).toISOString() });
    await flush();
    expect(feed.latest).toBeNull();
    await feed.maintain();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("keeps an explicitly closed market closed while heartbeats remain healthy", async () => {
    await feed.maintain();
    send(tick({ status: "non-tradeable" }));
    await flush();
    vi.setSystemTime(now + 60000);
    send({ type: "HEARTBEAT", time: new Date(Date.now()).toISOString() });
    await flush();
    await feed.maintain();
    expect(request).toHaveBeenCalledTimes(1);
    expect(feed.latest?.status).toBe("closed");
  });
  it("cancels a silent stream and reconnects without retaining old quotes", async () => {
    await feed.maintain();
    send(tick());
    await flush();
    const firstSignal = request.mock.calls[0][1].signal;
    vi.setSystemTime(now + 16000);
    expect(feed.latest).toBeNull();
    await feed.maintain();
    expect(firstSignal.aborted).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(feed.latest).toBeNull();
    send(tick());
    await flush();
    expect(feed.latest?.at).toBe(now + 16000);
  });
  it("reconnects after EOF with a bounded backoff", async () => {
    await feed.maintain();
    controller.close();
    await flush();
    await feed.maintain();
    expect(request).toHaveBeenCalledTimes(1);
    vi.setSystemTime(now + 15001);
    await feed.maintain();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("never fetches without an account and an enabled credential", async () => {
    vi.mocked(credential).mockResolvedValue(null);
    await feed.maintain();
    expect(request).not.toHaveBeenCalled();
    vi.mocked(credential).mockResolvedValue("test-oanda-key");
    vi.setSystemTime(now + 60001);
    const missing = new GoldFeed({} as Env, () => {});
    await missing.maintain();
    expect(request).not.toHaveBeenCalled();
  });
  it("cancels oversized frames and recovers on the next session", async () => {
    await feed.maintain();
    controller.enqueue(new TextEncoder().encode("x".repeat(65537)));
    await flush();
    expect(feed.latest).toBeNull();
    expect(request.mock.calls[0][1].signal.aborted).toBe(true);
    vi.setSystemTime(now + 15001);
    await feed.maintain();
    send(tick());
    await flush();
    expect(emitted).toHaveLength(1);
  });
  it("times out response headers without blocking the alarm indefinitely", async () => {
    request.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener("abort", () =>
            reject(new Error("test-oanda-key")),
          ),
        ),
    );
    const connecting = feed.maintain();
    await flush();
    await vi.advanceTimersByTimeAsync(10001);
    await connecting;
    expect(feed.latest).toBeNull();
    expect(emitted).toHaveLength(0);
  });
  it("uses the live endpoint only for an explicitly live account", async () => {
    feed = new GoldFeed(
      { OANDA_ACCOUNT_ID: "fixture", OANDA_ENV: "live" } as Env,
      () => {},
    );
    await feed.maintain();
    expect(request.mock.calls[0][0]).toContain("stream-fxtrade.oanda.com");
  });
  it("requires two minutes of continuous primary health before leaving fallback", async () => {
    await feed.maintain();
    feed.fallbackUsed();
    for (let elapsed = 0; elapsed < 120000; elapsed += 15000) {
      vi.setSystemTime(now + elapsed);
      send(tick());
      await flush();
      feed.fallbackUsed();
      expect(emitted).toHaveLength(0);
      expect(feed.latest).toBeNull();
    }
    vi.setSystemTime(now + 120000);
    send(tick());
    await flush();
    expect(emitted).toHaveLength(1);
    expect(feed.latest?.status).toBe("live");
  });
  it("restarts primary recovery after interrupted REST probes", () => {
    feed.fallbackUsed();
    const probe = (): Quote => ({
      symbol: "XAUUSD",
      price: 4001,
      change: 0,
      source: "OANDA",
      status: "live",
      at: Date.now(),
    });
    expect(feed.acceptPrimary(probe())).toBe(false);
    vi.setSystemTime(now + 119000);
    expect(feed.acceptPrimary(probe())).toBe(false);
    for (let elapsed = 134000; elapsed < 239000; elapsed += 15000) {
      vi.setSystemTime(now + elapsed);
      expect(feed.acceptPrimary(probe())).toBe(false);
    }
    vi.setSystemTime(now + 239000);
    expect(feed.acceptPrimary(probe())).toBe(true);
  });
  it("accepts a closed-market snapshot at the last trade timestamp without fabricating a fresh price", async () => {
    await feed.maintain();
    feed.fallbackUsed();
    send(
      tick({
        status: "non-tradeable",
        time: new Date(now - 86400000).toISOString(),
      }),
    );
    await flush();
    expect(feed.latest?.status).toBe("closed");
    expect(feed.latest?.at).toBe(now - 86400000);
    expect(emitted).toHaveLength(1);
  });
  it("accepts a status change at the same price timestamp", async () => {
    await feed.maintain();
    send(tick());
    await flush();
    send(tick({ status: "non-tradeable" }));
    await flush();
    expect(emitted.map((q) => q.status)).toEqual(["live", "closed"]);
  });
});
