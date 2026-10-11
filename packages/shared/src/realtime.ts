import { seconds, type Candle, type Quote, type Timeframe } from "./domain";
export function applyQuote(
  candles: Candle[],
  quote: Quote | undefined,
  tf: Timeframe,
  now: number,
): Candle[] {
  if (
    !candles.length ||
    !quote ||
    !["live", "fallback"].includes(quote.status) ||
    now - quote.at > 45000 ||
    quote.at > now + 5000 ||
    !Number.isFinite(quote.price) ||
    quote.price <= 0
  )
    return candles;
  const time = Math.floor(quote.at / 1000 / seconds[tf]) * seconds[tf],
    last = candles.at(-1)!;
  if (time < last.time) return candles;
  if (time === last.time)
    return [
      ...candles.slice(0, -1),
      {
        ...last,
        close: quote.price,
        high: Math.max(last.high, quote.price),
        low: Math.min(last.low, quote.price),
      },
    ];
  // New forming bar starts at the first observed tick. Volume is unknown, not invented.
  return [
    ...candles,
    {
      time,
      open: quote.price,
      high: quote.price,
      low: quote.price,
      close: quote.price,
      volume: 0,
    },
  ];
}
