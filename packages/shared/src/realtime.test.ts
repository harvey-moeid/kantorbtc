import { describe, expect, it } from "vitest";
import { applyQuote } from "./realtime";
import type { Candle, Quote } from "./domain";
const candle: Candle = {
    time: 300,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 20,
  },
  quote: Quote = {
    symbol: "BTCUSDT",
    price: 115,
    change: 0,
    source: "OKX",
    status: "live",
    at: 350000,
  };
describe("live chart merge", () => {
  it("updates high and close without replacing open or volume", () =>
    expect(applyQuote([candle], quote, "5m", 350000)[0]).toMatchObject({
      open: 100,
      high: 115,
      low: 90,
      close: 115,
      volume: 20,
    }));
  it("starts a new bar at the first observed price", () =>
    expect(
      applyQuote([candle], { ...quote, at: 650000 }, "5m", 650000)[1],
    ).toEqual({
      time: 600,
      open: 115,
      high: 115,
      low: 115,
      close: 115,
      volume: 0,
    }));
  it("does not mutate cached historical data", () => {
    applyQuote([candle], quote, "5m", 350000);
    expect(candle.close).toBe(105);
  });
  it("rejects stale, closed, and demo quotes", () => {
    for (const status of ["stale", "closed", "demo"] as const) {
      const data = [candle];
      expect(applyQuote(data, { ...quote, status }, "5m", 350000)).toBe(data);
    }
  });
  it("ignores expired observations and out-of-order bars", () => {
    const data = [candle];
    expect(applyQuote(data, quote, "5m", 450000)).toBe(data);
    expect(applyQuote(data, { ...quote, at: 50000 }, "5m", 50000)).toBe(data);
  });
});
