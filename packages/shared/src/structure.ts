import type { Candle } from "./domain";
export interface Zone {
  type: "FVG" | "ORDER BLOCK";
  direction: "long" | "short";
  low: number;
  high: number;
  from: number;
  to: number;
  createdAt: number;
}
export interface StructureLevel {
  type: "BOS" | "CHoCH" | "LIQUIDITY";
  price: number;
  at?: number;
  from?: number;
  direction?: "long" | "short";
}
export interface Pivot {
  kind: "high" | "low";
  price: number;
  at: number;
  confirmedAt: number;
  index: number;
}
export interface StructureEvent extends StructureLevel {
  type: "BOS" | "CHoCH";
  direction: "long" | "short";
  at: number;
  from: number;
}
// Confirmed definition: strict pivots with N candles on both sides, close-only
// breaks, first break against the established direction = CHoCH, wick FVGs.
// Each pivot becomes visible only at index + N, never at its earlier pivot bar.
export function structure(
  candles: Candle[],
  swing = 3,
): {
  zones: Zone[];
  levels: StructureLevel[];
  events: StructureEvent[];
  pivots: Pivot[];
  premiumDiscount?: {
    low: number;
    high: number;
    midpoint: number;
    from: number;
  };
} {
  if (!Number.isInteger(swing) || swing < 1 || swing > 15)
    throw new Error("Invalid swing sensitivity");
  const end = candles.at(-1)?.time ?? 0,
    zones: Zone[] = [],
    events: StructureEvent[] = [],
    pivots: Pivot[] = [];
  let high: Pivot | undefined,
    low: Pivot | undefined,
    trend: "long" | "short" | undefined;
  const broken = new Set<string>();
  for (let i = 0; i < candles.length; i++) {
    const current = candles[i];
    if (i >= swing * 2) {
      const j = i - swing,
        pivot = candles[j];
      const neighbors = [
        ...candles.slice(j - swing, j),
        ...candles.slice(j + 1, i + 1),
      ];
      if (neighbors.every((c) => pivot.high > c.high)) {
        high = {
          kind: "high",
          price: pivot.high,
          at: pivot.time,
          confirmedAt: current.time,
          index: j,
        };
        pivots.push(high);
      }
      if (neighbors.every((c) => pivot.low < c.low)) {
        low = {
          kind: "low",
          price: pivot.low,
          at: pivot.time,
          confirmedAt: current.time,
          index: j,
        };
        pivots.push(low);
      }
    }
    if (i >= 2) {
      const first = candles[i - 2];
      if (current.low > first.high)
        zones.push({
          type: "FVG",
          direction: "long",
          low: first.high,
          high: current.low,
          from: first.time,
          to: end,
          createdAt: current.time,
        });
      else if (current.high < first.low)
        zones.push({
          type: "FVG",
          direction: "short",
          low: current.high,
          high: first.low,
          from: first.time,
          to: end,
          createdAt: current.time,
        });
    }
    const direction =
      high && !broken.has(`high-${high.index}`) && current.close > high.price
        ? "long"
        : low && !broken.has(`low-${low.index}`) && current.close < low.price
          ? "short"
          : undefined;
    if (!direction) continue;
    const pivot = (direction === "long" ? high : low)!;
    events.push({
      type: trend && direction !== trend ? "CHoCH" : "BOS",
      direction,
      price: pivot.price,
      from: pivot.at,
      at: current.time,
    });
    broken.add(`${pivot.kind}-${pivot.index}`);
    trend = direction;
    const opposing = candles
      .slice(0, i)
      .reverse()
      .find((c) =>
        direction === "long" ? c.close < c.open : c.close > c.open,
      );
    if (opposing)
      zones.push({
        type: "ORDER BLOCK",
        direction,
        low: opposing.low,
        high: opposing.high,
        from: opposing.time,
        to: end,
        createdAt: current.time,
      });
  }
  const levels: StructureLevel[] = [...events.slice(-8)];
  if (high)
    levels.push({ type: "LIQUIDITY", price: high.price, from: high.at });
  if (low) levels.push({ type: "LIQUIDITY", price: low.price, from: low.at });
  const premiumDiscount =
    high && low && high.price > low.price
      ? {
          low: low.price,
          high: high.price,
          midpoint: (high.price + low.price) / 2,
          from: Math.max(high.confirmedAt, low.confirmedAt),
        }
      : undefined;
  return {
    events,
    pivots,
    levels,
    premiumDiscount,
    zones: zones
      .filter(
        (zone) =>
          !candles.some(
            (c) =>
              c.time > zone.createdAt &&
              (zone.direction === "long"
                ? c.close < zone.low
                : c.close > zone.high),
          ),
      )
      .slice(-8),
  };
}
