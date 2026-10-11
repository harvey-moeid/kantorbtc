import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BtcFeed } from "./btc-feed";
class Socket extends EventTarget {
  sent: string[] = [];
  accept() {}
  send(m: string) {
    this.sent.push(m);
  }
  close() {
    this.dispatchEvent(new Event("close"));
  }
  message(data: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  }
}
describe("BTC upstream lifecycle", () => {
  let sockets: Socket[], requests: string[];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 11));
    sockets = [];
    requests = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        requests.push(url);
        if ((options?.headers as Record<string, string>)?.Upgrade) {
          const socket = new Socket();
          sockets.push(socket);
          return { status: 101, webSocket: socket };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: "0", data: [{ last: "67000" }] }),
        };
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it("subscribes to OKX with one active upstream", async () => {
    const feed = new BtcFeed(() => {});
    await feed.maintain();
    await feed.maintain();
    expect(sockets).toHaveLength(1);
    expect(sockets[0].sent.join()).toContain("BTC-USDT");
  });
  it("normalizes ticker values and preserves observed timestamp", async () => {
    const listener = vi.fn(),
      feed = new BtcFeed(listener);
    await feed.maintain();
    sockets[0].message({
      data: [{ last: "67000", open24h: "65000", ts: String(Date.now()) }],
    });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "BTCUSDT",
        price: 67000,
        source: "OKX",
        status: "live",
        at: Date.now(),
      }),
    );
  });
  it("ignores malformed or stale values", async () => {
    const listener = vi.fn(),
      feed = new BtcFeed(listener);
    await feed.maintain();
    sockets[0].message({
      data: [{ last: "NaN", open24h: "65000", ts: String(Date.now()) }],
    });
    sockets[0].message({
      data: [
        { last: "67000", open24h: "65000", ts: String(Date.now() - 16000) },
      ],
    });
    expect(listener).not.toHaveBeenCalled();
  });
  it("switches to Binance after primary disconnect", async () => {
    const feed = new BtcFeed(() => {});
    await feed.maintain();
    sockets[0].close();
    await feed.maintain();
    expect(requests.at(-1)).toContain("stream.binance.com");
  });
  it("switches away from a silent socket after 15 seconds", async () => {
    const feed = new BtcFeed(() => {});
    await feed.maintain();
    vi.advanceTimersByTime(16000);
    await feed.maintain();
    expect(requests.at(-1)).toContain("stream.binance.com");
  });
  it("labels normalized fallback data honestly", async () => {
    const listener = vi.fn(),
      feed = new BtcFeed(listener);
    await feed.maintain();
    sockets[0].close();
    await feed.maintain();
    sockets[1].message({
      e: "24hrTicker",
      c: "67100",
      P: "1.5",
      E: Date.now(),
    });
    expect(feed.latest).toMatchObject({
      source: "Binance",
      status: "fallback",
      price: 67100,
    });
  });
  it("requires two stable minutes before primary recovery", async () => {
    const feed = new BtcFeed(() => {});
    await feed.maintain();
    sockets[0].close();
    await feed.maintain();
    for (let i = 0; i < 10; i++) {
      sockets[1].message({
        e: "24hrTicker",
        c: "67100",
        P: "1",
        E: Date.now(),
      });
      await feed.maintain();
      vi.advanceTimersByTime(14000);
    }
    expect(requests.filter((r) => r.includes("ws.okx.com"))).toHaveLength(2);
  });
});
