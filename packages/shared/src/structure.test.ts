import { describe, expect, it } from "vitest";
import { structure } from "./structure";
import type { Candle } from "./domain";
const c = (
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
): Candle => ({ time, open, high, low, close, volume: 100 });
describe("explicit initial SMC definitions", () => {
  it("finds a bullish three-candle FVG", () => {
    const result = structure([
      c(1, 100, 105, 95, 103),
      c(2, 103, 112, 101, 111),
      c(3, 111, 117, 109, 115),
    ]);
    expect(result.zones).toContainEqual(
      expect.objectContaining({
        type: "FVG",
        direction: "long",
        low: 105,
        high: 109,
      }),
    );
  });
  it("finds a bearish three-candle FVG", () => {
    const result = structure([
      c(1, 115, 117, 109, 111),
      c(2, 111, 112, 101, 103),
      c(3, 103, 105, 95, 100),
    ]);
    expect(result.zones).toContainEqual(
      expect.objectContaining({
        type: "FVG",
        direction: "short",
        low: 105,
        high: 109,
      }),
    );
  });
  it("removes invalidated bullish zones", () => {
    const result = structure([
      c(1, 100, 105, 95, 103),
      c(2, 103, 112, 101, 111),
      c(3, 111, 117, 109, 115),
      c(4, 115, 116, 90, 91),
    ]);
    expect(
      result.zones.filter((z) => z.from === 1 && z.direction === "long"),
    ).toEqual([]);
  });
  it("does not invent zones with insufficient data", () =>
    expect(structure([c(1, 100, 105, 95, 103)]).zones).toEqual([]));
});

describe("confirmed causal swing/BOS/CHoCH definitions", () => {
  const confirmed = [
    c(0, 100, 102, 98, 101),
    c(1, 101, 110, 100, 108),
    c(2, 105, 107, 99, 100),
    c(3, 100, 106, 95, 96),
    c(4, 97, 108, 97, 107),
    c(5, 108, 113, 105, 112),
    c(6, 112, 114, 107, 113),
    c(7, 107, 109, 93, 94),
  ];
  it("does not expose a default three-right-candle pivot before confirmation", () => {
    const data = [
      c(0, 100, 101, 99, 100),
      c(1, 101, 104, 100, 103),
      c(2, 103, 106, 102, 105),
      c(3, 105, 110, 104, 109),
      c(4, 105, 107, 103, 106),
      c(5, 102, 105, 101, 104),
      c(6, 101, 103, 100, 102),
    ];
    expect(structure(data.slice(0, 6)).pivots).toEqual([]);
    expect(structure(data).pivots).toContainEqual({
      kind: "high",
      price: 110,
      at: 3,
      confirmedAt: 6,
      index: 3,
    });
  });
  it("uses a closed-candle break and identifies the first opposing break as CHoCH", () => {
    expect(structure(confirmed, 1).events).toEqual([
      { type: "BOS", direction: "long", price: 110, from: 1, at: 5 },
      { type: "CHoCH", direction: "short", price: 95, from: 3, at: 7 },
    ]);
  });
  it("does not classify a wick-only sweep as a BOS", () => {
    const data = confirmed.slice(0, 5).concat(c(5, 108, 113, 105, 109));
    expect(structure(data, 1).events).toEqual([]);
  });
  it("never retroactively changes events when future candles arrive", () => {
    for (let size = 1; size < confirmed.length; size++)
      expect(
        structure(confirmed, 1).events.filter(
          (event) => event.at <= confirmed[size - 1].time,
        ),
      ).toEqual(structure(confirmed.slice(0, size), 1).events);
  });
  it("emits each pivot break once rather than once per candle above its price", () =>
    expect(structure(confirmed.slice(0, 7), 1).events).toHaveLength(1));
  it("uses the last opposing candle before the break for an order block", () => {
    const zone = structure(confirmed.slice(0, 6), 1).zones.find(
      (z) => z.type === "ORDER BLOCK",
    );
    expect(zone).toMatchObject({
      from: 3,
      createdAt: 5,
      low: 95,
      high: 106,
      direction: "long",
    });
  });
  it("does not invent strict pivots from a flat or tied range", () =>
    expect(
      structure(
        Array.from({ length: 10 }, (_, i) => c(i, 100, 101, 99, 100)),
        1,
      ).pivots,
    ).toEqual([]));
  it("computes premium/discount only from confirmed non-inverted swing levels", () =>
    expect(structure(confirmed.slice(0, 6), 1).premiumDiscount).toMatchObject({
      low: 95,
      high: 110,
      midpoint: 102.5,
    }));
  it("rejects invalid swing parameters", () => {
    for (const swing of [0, 1.5, 16])
      expect(() => structure(confirmed, swing)).toThrow();
  });
});
