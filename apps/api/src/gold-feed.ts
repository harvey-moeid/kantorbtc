import type { Quote } from "../../../packages/shared/src/domain";
import type { Env } from "./env";
import { credential } from "./data";

type Session = {
  controller: AbortController;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  started: number;
  heartbeat: number;
};

// One account pricing stream, read incrementally. No credential or provider
// response text is copied into logs, client events, or exception messages.
export class GoldFeed {
  private session: Session | null = null;
  private connecting = false;
  private retryAt = 0;
  private last: Quote | null = null;
  private fallbackActive = false;
  private primaryStableSince: number | null = null;
  private primarySeenAt = 0;
  constructor(
    private env: Env,
    private onQuote: (quote: Quote) => void,
  ) {}

  get latest(): Quote | null {
    if (
      this.fallbackActive ||
      !this.session ||
      Date.now() - this.session.heartbeat > 15000
    )
      return null;
    return this.last &&
      (this.last.status === "closed" || Date.now() - this.last.at <= 30000)
      ? this.last
      : null;
  }

  fallbackUsed(): void {
    if (!this.fallbackActive) this.primaryStableSince = null;
    this.fallbackActive = true;
  }

  // Both stream ticks and REST probes participate in primary recovery. Missing
  // probes for over 30s restart the two-minute stability window.
  acceptPrimary(quote: Quote): boolean {
    if (quote.source !== "OANDA") return false;
    if (quote.status !== "closed" && Date.now() - quote.at > 30000)
      return false;
    if (Date.now() - this.primarySeenAt > 30000) this.primaryStableSince = null;
    this.primarySeenAt = Date.now();
    if (!this.fallbackActive) return true;
    if (quote.status === "closed") {
      this.fallbackActive = false;
      this.primaryStableSince = null;
      return true;
    }
    this.primaryStableSince ??= Date.now();
    if (Date.now() - this.primaryStableSince < 120000) return false;
    this.fallbackActive = false;
    this.primaryStableSince = null;
    return true;
  }

  async maintain(): Promise<void> {
    const current = this.session;
    if (
      current &&
      (Date.now() - current.heartbeat > 15000 ||
        Date.now() - current.started >= 600000 ||
        (this.last?.status !== "closed" &&
          Date.now() - (this.last?.at ?? current.started) > 30000))
    ) {
      this.stop();
    }
    if (!this.session && !this.connecting && Date.now() >= this.retryAt)
      await this.connect();
  }

  stop(): void {
    const current = this.session;
    this.session = null;
    this.last = null;
    if (current) {
      current.controller.abort();
      void current.reader.cancel().catch(() => {});
    }
  }

  private async connect(): Promise<void> {
    this.connecting = true;
    const controller = new AbortController();
    // Timeout only the headers. An ongoing pricing stream must not be aborted
    // by a normal REST request timeout; maintain() checks its heartbeat instead.
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const key = await credential(this.env, "OANDA");
      if (!key || !this.env.OANDA_ACCOUNT_ID) {
        this.retryAt = Date.now() + 60000;
        return;
      }
      const host =
        this.env.OANDA_ENV === "live"
          ? "stream-fxtrade.oanda.com"
          : "stream-fxpractice.oanda.com";
      const response = await fetch(
        `https://${host}/v3/accounts/${encodeURIComponent(this.env.OANDA_ACCOUNT_ID)}/pricing/stream?instruments=XAU_USD&snapshot=true`,
        {
          headers: { Authorization: `Bearer ${key}` },
          signal: controller.signal,
        },
      );
      if (!response.ok || !response.body) {
        if (response.body) await response.body.cancel();
        throw new Error("Pricing stream unavailable");
      }
      const session: Session = {
        controller,
        reader: response.body.getReader(),
        started: Date.now(),
        heartbeat: Date.now(),
      };
      this.session = session;
      this.last = null;
      // Pending upstream I/O keeps a Durable Object active. This promise catches
      // all stream errors internally; the alarm reconnects after its backoff.
      void this.consume(session);
    } catch {
      controller.abort();
      this.retryAt = Date.now() + 15000;
    } finally {
      clearTimeout(timer);
      this.connecting = false;
    }
  }

  private async consume(session: Session): Promise<void> {
    const decoder = new TextDecoder();
    let pending = "";
    try {
      while (this.session === session) {
        const { done, value } = await session.reader.read();
        if (done) break;
        if (this.session !== session) break;
        if (value.byteLength > 262144)
          throw new Error("Pricing chunk too large");
        pending += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, newline).trim();
          pending = pending.slice(newline + 1);
          if (line.length > 65536) throw new Error("Pricing frame too large");
          if (line) this.frame(session, line);
        }
        if (pending.length > 65536) throw new Error("Pricing frame too large");
      }
    } catch {
      // Transport/parse errors never expose the API key or upstream body.
    } finally {
      if (this.session === session) {
        this.session = null;
        this.last = null;
        this.retryAt = Date.now() + 15000;
      }
      session.controller.abort();
      await session.reader.cancel().catch(() => {});
      session.reader.releaseLock();
    }
  }

  private frame(session: Session, line: string): void {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(line);
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;
    const at = typeof data.time === "string" ? Date.parse(data.time) : NaN;
    if (
      !Number.isFinite(at) ||
      at > Date.now() + 5000 ||
      at <= 0 ||
      (data.status !== "non-tradeable" && Date.now() - at > 30000)
    )
      return;
    if (data.type === "HEARTBEAT") {
      session.heartbeat = Date.now();
      return;
    }
    if (
      data.type !== "PRICE" ||
      data.instrument !== "XAU_USD" ||
      !["tradeable", "non-tradeable"].includes(String(data.status))
    )
      return;
    const bid = Number(data.closeoutBid),
      ask = Number(data.closeoutAsk);
    if (
      !Number.isFinite(bid) ||
      !Number.isFinite(ask) ||
      bid <= 0 ||
      ask < bid ||
      (this.last &&
        at <= this.last.at &&
        (data.status === "tradeable" ? "live" : "closed") === this.last.status)
    )
      return;
    session.heartbeat = Date.now();
    this.last = {
      symbol: "XAUUSD",
      price: bid + (ask - bid) / 2,
      change: 0,
      source: "OANDA",
      status: data.status === "tradeable" ? "live" : "closed",
      at,
    };
    if (this.acceptPrimary(this.last)) this.onQuote(this.last);
  }
}
