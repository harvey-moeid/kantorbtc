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
