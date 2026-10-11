import type { Quote } from "../../../packages/shared/src/domain";
import { fetchJson } from "./market";
// One active upstream. REST probes verify primary recovery before switching back.
const sources = [
  { name: "OKX", url: "https://ws.okx.com:8443/ws/v5/public" },
  { name: "Binance", url: "https://stream.binance.com:443/ws/btcusdt@ticker" },
  { name: "Bybit", url: "https://stream.bybit.com/v5/public/spot" },
];
export class BtcFeed {
  private socket: WebSocket | null = null;
  private connecting = false;
  private index = 0;
  private lastTick = 0;
  private connectedAt = 0;
  private primaryStableSince = 0;
  private last: Quote | null = null;
  constructor(private onQuote: (quote: Quote) => void) {}
  get latest() {
    return this.last && Date.now() - this.last.at < 15000 ? this.last : null;
  }
  async maintain() {
    if (
      this.socket &&
      Date.now() - (this.lastTick || this.connectedAt) > 15000
    ) {
      const old = this.socket;
      this.socket = null;
      old.close(1000, "Stale feed");
      this.index = (this.index + 1) % sources.length;
    }
    if (this.socket && this.index > 0) {
      try {
        const result = await fetchJson<{
          code: string;
          data: { last: string }[];
        }>("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT");
        if (result.code !== "0" || !(+result.data[0].last > 0))
          throw new Error("Primary unavailable");
        if (!this.primaryStableSince) this.primaryStableSince = Date.now();
        if (Date.now() - this.primaryStableSince >= 120000) {
          const old = this.socket;
          this.socket = null;
          this.index = 0;
          this.primaryStableSince = 0;
          old.close(1000, "Primary recovered");
        }
      } catch {
        this.primaryStableSince = 0;
      }
    }
    if (!this.socket && !this.connecting) await this.connect();
    if (this.socket)
      try {
        this.socket.send(
          this.index === 0
            ? "ping"
            : this.index === 2
              ? JSON.stringify({ op: "ping" })
              : JSON.stringify({ method: "LIST_SUBSCRIPTIONS", id: 1 }),
        );
      } catch {
        this.socket = null;
      }
  }
  private async connect() {
    this.connecting = true;
    const index = this.index;
    try {
      const response = await fetch(sources[index].url, {
        headers: { Upgrade: "websocket" },
        signal: AbortSignal.timeout(10000),
      });
      const socket = response.webSocket;
      if (response.status !== 101 || !socket)
        throw new Error("Upstream unavailable");
      socket.accept();
      this.socket = socket;
      this.connectedAt = Date.now();
      this.lastTick = 0;
      if (index === 0)
        socket.send(
          JSON.stringify({
            op: "subscribe",
            args: [{ channel: "tickers", instId: "BTC-USDT" }],
          }),
        );
      if (index === 2)
        socket.send(
          JSON.stringify({ op: "subscribe", args: ["tickers.BTCUSDT"] }),
        );
      socket.addEventListener("message", (event) => {
        if (
          this.socket !== socket ||
          typeof event.data !== "string" ||
          event.data === "pong"
        )
          return;
        try {
          const message = JSON.parse(event.data);
          let price = 0,
            change = this.last?.change || 0,
            at = Date.now();
          if (index === 0 && message.data?.[0]) {
            const q = message.data[0];
            price = +q.last;
            change = +q.open24h > 0 ? (price / +q.open24h - 1) * 100 : change;
            at = +q.ts;
          } else if (index === 1 && message.e === "24hrTicker") {
            price = +message.c;
            change = +message.P;
            at = +message.E;
          } else if (index === 2 && message.data?.lastPrice) {
            price = +message.data.lastPrice;
            change =
              message.data.price24hPcnt === undefined
                ? change
                : +message.data.price24hPcnt * 100;
            at = +message.ts;
          }
          if (
            !Number.isFinite(price) ||
            price <= 0 ||
            !Number.isFinite(at) ||
            Date.now() - at > 15000
          )
            return;
          this.lastTick = Date.now();
          this.last = {
            symbol: "BTCUSDT",
            price,
            change: Number.isFinite(change) ? change : 0,
            source: sources[index].name,
            status: index ? "fallback" : "live",
            at,
          };
          this.onQuote(this.last);
        } catch {
          /* Ignore control and malformed frames. */
        }
      });
      const closed = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.index = (index + 1) % sources.length;
        this.primaryStableSince = 0;
      };
      socket.addEventListener("close", closed);
      socket.addEventListener("error", closed);
    } catch {
      this.index = (index + 1) % sources.length;
    } finally {
      this.connecting = false;
    }
  }
}
