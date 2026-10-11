import { describe, expect, it } from "vitest";
import { marketCandles, marketQuote } from "./market";
import { timeframes } from "../../../packages/shared/src/domain";
import type { Env } from "./env";
// Opt-in, read-only public endpoints. No provider key, AI inference, order or webhook.
const live = process.env.KANTOR_LIVE_SMOKE === "1";
describe.skipIf(!live)("live public BTC adapter smoke", () => {
  it.each(timeframes)(
    "returns usable closed candles for %s",
    async (tf) => {
      const result = await marketCandles({} as Env, "BTCUSDT", tf);
      expect(["OKX", "Binance", "Bybit"]).toContain(result.source);
      expect(result.candles.length).toBeGreaterThanOrEqual(50);
      let previous = 0;
      for (const c of result.candles) {
        expect(c.time).toBeGreaterThan(previous);
        previous = c.time;
        expect(
          [c.time, c.open, c.high, c.low, c.close, c.volume].every(
            Number.isFinite,
          ),
        ).toBe(true);
        expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
        expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
        expect(c.low).toBeGreaterThan(0);
        expect(c.time * 1000).toBeLessThan(Date.now());
      }
    },
    60000,
  );
  it("normalizes a real quote with an honest source/status", async () => {
    const q = await marketQuote({} as Env, "BTCUSDT");
    expect(q.price).toBeGreaterThan(0);
    expect(Number.isFinite(q.change)).toBe(true);
    expect(["live", "fallback"]).toContain(q.status);
    expect(["OKX", "Binance", "Bybit"]).toContain(q.source);
  }, 60000);
});
