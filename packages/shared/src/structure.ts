import type { Candle } from "./domain";
export interface Zone {
  type: "FVG" | "ORDER BLOCK";
  direction: "long" | "short";
  low: number;
  high: number;
  from: number;
  to: number;
}
export interface StructureLevel {
  type: "BOS" | "LIQUIDITY";
  price: number;
}
// Explicit initial definition: three-candle FVG; last opposing candle preceding a swing break.
export function structure(
  candles: Candle[],
  swing = 3,
): { zones: Zone[]; levels: StructureLevel[] } {
  const zones: Zone[] = [];
  const end = candles.at(-1)?.time || 0;
  for (let i = Math.max(2, candles.length - 80); i < candles.length; i++) {
    const a = candles[i - 2],
      b = candles[i];
    if (b.low > a.high)
      zones.push({
        type: "FVG",
        direction: "long",
        low: a.high,
        high: b.low,
        from: a.time,
        to: end,
      });
    else if (b.high < a.low)
      zones.push({
        type: "FVG",
        direction: "short",
        low: b.high,
        high: a.low,
        from: a.time,
        to: end,
      });
    if (i >= swing) {
      const previous = candles.slice(i - swing, i),
        high = Math.max(...previous.map((c) => c.high)),
        low = Math.min(...previous.map((c) => c.low));
      if (b.close > high || b.close < low) {
        const bullish = b.close > high,
          opposing = [...previous]
            .reverse()
            .find((c) => (bullish ? c.close < c.open : c.close > c.open));
        if (opposing)
          zones.push({
            type: "ORDER BLOCK",
            direction: bullish ? "long" : "short",
            low: opposing.low,
            high: opposing.high,
            from: opposing.time,
            to: end,
          });
      }
    }
  }
  const recent = candles.slice(-swing * 2 - 1, -1),
    levels: StructureLevel[] = recent.length
      ? [
          { type: "LIQUIDITY", price: Math.max(...recent.map((c) => c.high)) },
          { type: "LIQUIDITY", price: Math.min(...recent.map((c) => c.low)) },
        ]
      : [];
  return {
    zones: zones
      .filter(
        (z) =>
          !candles.some(
            (c) =>
              c.time > z.from &&
              (z.direction === "long" ? c.close < z.low : c.close > z.high),
          ),
      )
      .slice(-4),
    levels,
  };
}
