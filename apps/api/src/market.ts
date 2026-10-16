import {
  seconds,
  type Candle,
  type Quote,
  type Symbol,
  type Timeframe,
} from "../../../packages/shared/src/domain";
import type { Env } from "./env";
import { credential } from "./data";
export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  return response.json<T>();
}
const okxBars: Record<Timeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  H1: "1H",
  H4: "4H",
  D1: "1Dutc",
};
const binanceBars: Record<Timeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  H1: "1h",
  H4: "4h",
  D1: "1d",
};
const bybitBars: Record<Timeframe, string> = {
  "5m": "5",
  "15m": "15",
  H1: "60",
  H4: "240",
  D1: "D",
};
const oandaBars: Record<Timeframe, string> = {
  "5m": "M5",
  "15m": "M15",
  H1: "H1",
  H4: "H4",
  D1: "D",
};
const twelveBars: Record<Timeframe, string> = {
  "5m": "5min",
  "15m": "15min",
  H1: "1h",
  H4: "4h",
  D1: "1day",
};
function normalized(data: Candle[]): Candle[] {
  return [
    ...new Map(
      data
        .filter(
          (c) =>
            [c.time, c.open, c.high, c.low, c.close, c.volume].every(
              Number.isFinite,
            ) &&
            c.low > 0 &&
            c.high >= Math.max(c.open, c.close) &&
            c.low <= Math.min(c.open, c.close),
        )
        .map((c) => [c.time, c]),
    ).values(),
  ].sort((a, b) => a.time - b.time);
}
export async function marketCandles(
  env: Env,
  symbol: Symbol,
  tf: Timeframe,
  before?: number,
): Promise<{ candles: Candle[]; source: string }> {
  const floor = Math.min(
    Math.floor(Date.now() / 1000 / seconds[tf]) * seconds[tf],
    before ?? Infinity,
  );
  if (symbol === "BTCUSDT") {
    const sources: [string, () => Promise<Candle[]>][] = [
      [
        "OKX",
        async () => {
          const r = await fetchJson<{ code: string; data: string[][] }>(
            `https://www.okx.com/api/v5/market/${before ? "history-candles" : "candles"}?instId=BTC-USDT&bar=${okxBars[tf]}&limit=300${before ? "&after=" + Math.floor(before * 1000) : ""}`,
          );
          if (r.code !== "0") throw new Error("OKX response");
          return r.data
            .filter((c) => c[8] === "1")
            .map((c) => ({
              time: Number(c[0]) / 1000,
              open: +c[1],
              high: +c[2],
              low: +c[3],
              close: +c[4],
              volume: +c[5],
            }));
        },
      ],
      [
        "Binance",
        async () => {
          const r = await fetchJson<(number | string)[][]>(
            `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${binanceBars[tf]}&limit=300${before ? "&endTime=" + Math.floor(before * 1000 - 1) : ""}`,
          );
          return r
            .filter((c) => Number(c[6]) < Date.now())
            .map((c) => ({
              time: Number(c[0]) / 1000,
              open: +c[1],
              high: +c[2],
              low: +c[3],
              close: +c[4],
              volume: +c[5],
            }));
        },
      ],
      [
        "Bybit",
        async () => {
          const r = await fetchJson<{
            retCode: number;
            result: { list: string[][] };
          }>(
            `https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=${bybitBars[tf]}&limit=300${before ? "&end=" + Math.floor(before * 1000 - 1) : ""}`,
          );
          if (r.retCode !== 0) throw new Error("Bybit response");
          return r.result.list
            .filter((c) => Number(c[0]) / 1000 < floor)
            .map((c) => ({
              time: +c[0] / 1000,
              open: +c[1],
              high: +c[2],
              low: +c[3],
              close: +c[4],
              volume: +c[5],
            }));
        },
      ],
    ];
    for (const [source, load] of sources) {
      try {
        const candles = normalized(await load()).filter((c) => c.time < floor);
        if (candles.length) return { source, candles };
      } catch {
        /* Try the configured public fallback; never invent prices. */
      }
    }
    throw new Error("Sumber BTC belum tersedia: OKX, Binance, Bybit.");
  }
  const oanda = await credential(env, "OANDA");
  if (oanda)
    try {
      const host =
        env.OANDA_ENV === "live"
          ? "api-fxtrade.oanda.com"
          : "api-fxpractice.oanda.com";
      const r = await fetchJson<{
        candles: {
          time: string;
          complete: boolean;
          volume: number;
          mid: { o: string; h: string; l: string; c: string };
        }[];
      }>(
        `https://${host}/v3/instruments/XAU_USD/candles?granularity=${oandaBars[tf]}&count=300&price=M${before ? "&to=" + encodeURIComponent(new Date(before * 1000).toISOString()) : ""}`,
        { headers: { Authorization: `Bearer ${oanda}` } },
      );
      const candles = normalized(
        r.candles
          .filter((c) => c.complete)
          .map((c) => ({
            time: Math.floor(Date.parse(c.time) / 1000),
            open: +c.mid.o,
            high: +c.mid.h,
            low: +c.mid.l,
            close: +c.mid.c,
            volume: c.volume,
          })),
      ).filter((c) => c.time < floor);
      if (candles.length) return { source: "OANDA", candles };
    } catch {
      /* Continue to Twelve Data. */
    }
  const twelve = await credential(env, "Twelve Data");
  if (twelve) {
    const r = await fetchJson<{
      values?: {
        datetime: string;
        open: string;
        high: string;
        low: string;
        close: string;
        volume?: string;
      }[];
    }>(
      `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${twelveBars[tf]}&outputsize=300&timezone=UTC${before ? "&end_date=" + encodeURIComponent(new Date(before * 1000).toISOString().slice(0, 19).replace("T", " ")) : ""}&apikey=${encodeURIComponent(twelve)}`,
    );
    const candles = normalized(
      (r.values || [])
        .map((c) => ({
          time: Date.parse(c.datetime.replace(" ", "T") + "Z") / 1000,
          open: +c.open,
          high: +c.high,
          low: +c.low,
          close: +c.close,
          volume: Number(c.volume || 0),
        }))
        .filter((c) => c.time < floor),
    );
    if (candles.length) return { source: "Twelve Data", candles };
  }
  throw new Error(
    "Emas belum tersedia. Konfigurasikan OANDA atau Twelve Data.",
  );
}
export async function marketQuote(env: Env, symbol: Symbol): Promise<Quote> {
  const now = Date.now();
  if (symbol === "BTCUSDT") {
    try {
      const r = await fetchJson<{
        code: string;
        data: { last: string; open24h: string }[];
      }>("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT");
      const q = r.data[0];
      if (r.code === "0" && +q.last > 0)
        return {
          symbol,
          price: +q.last,
          change: (+q.last / +q.open24h - 1) * 100,
          source: "OKX",
          status: "live",
          at: now,
        };
    } catch {
      /* Fallback. */
    }
    try {
      const r = await fetchJson<{
        lastPrice: string;
        priceChangePercent: string;
      }>("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT");
      if (+r.lastPrice > 0)
        return {
          symbol,
          price: +r.lastPrice,
          change: +r.priceChangePercent,
          source: "Binance",
          status: "fallback",
          at: now,
        };
    } catch {
      /* Fallback. */
    }
    const r = await fetchJson<{
      retCode: number;
      result: { list: { lastPrice: string; price24hPcnt: string }[] };
    }>("https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT");
    const q = r.result.list[0];
    if (r.retCode !== 0 || !(+q.lastPrice > 0))
      throw new Error("No valid quote");
    return {
      symbol,
      price: +q.lastPrice,
      change: +q.price24hPcnt * 100,
      source: "Bybit",
      status: "fallback",
      at: now,
    };
  }
  const key = await credential(env, "OANDA");
  if (key && env.OANDA_ACCOUNT_ID)
    try {
      const host =
          env.OANDA_ENV === "live"
            ? "api-fxtrade.oanda.com"
            : "api-fxpractice.oanda.com",
        r = await fetchJson<{
          prices: {
            status: string;
            closeoutBid: string;
            closeoutAsk: string;
            time: string;
          }[];
        }>(
          `https://${host}/v3/accounts/${encodeURIComponent(env.OANDA_ACCOUNT_ID)}/pricing?instruments=XAU_USD`,
          { headers: { Authorization: `Bearer ${key}` } },
        ),
        q = r.prices[0];
      if (+q.closeoutBid > 0)
        return {
          symbol,
          price: (+q.closeoutBid + +q.closeoutAsk) / 2,
          change: 0,
          source: "OANDA",
          status: q.status === "tradeable" ? "live" : "closed",
          at: Date.parse(q.time),
        };
    } catch {
      /* Twelve Data fallback. */
    }
  const twelve = await credential(env, "Twelve Data");
  if (twelve) {
    const q = await fetchJson<{
      close: string;
      percent_change: string;
      is_market_open: boolean;
      timestamp: number;
    }>(
      `https://api.twelvedata.com/quote?symbol=XAU/USD&apikey=${encodeURIComponent(twelve)}`,
    );
    if (+q.close > 0)
      return {
        symbol,
        price: +q.close,
        change: +q.percent_change || 0,
        source: "Twelve Data",
        status: q.is_market_open ? "fallback" : "closed",
        at: q.timestamp * 1000,
      };
  }
  throw new Error("Pricing emas belum dikonfigurasi.");
}
export async function persistCandles(
  env: Env,
  symbol: Symbol,
  tf: Timeframe,
  data: { candles: Candle[]; source: string },
) {
  // Read only the incoming keys, using the existing composite primary key.
  // No in-memory cache: retries and separate Worker instances see persisted data.
  const incoming = [...new Map(data.candles.map((c) => [c.time, c])).values()];
  const changed: Candle[] = [];
  for (let i = 0; i < incoming.length; i += 50) {
    const chunk = incoming.slice(i, i + 50);
    const { results } = await env.DB.prepare(
      `SELECT time,open,high,low,close,volume,source FROM candles WHERE symbol=? AND tf=? AND time IN (${chunk.map(() => "?").join(",")})`,
    )
      .bind(symbol, tf, ...chunk.map((c) => c.time))
      .all<Candle & { source: string }>();
    const existing = new Map(results.map((c) => [c.time, c]));
    for (const c of chunk) {
      const old = existing.get(c.time);
      if (
        !old ||
        old.open !== c.open ||
        old.high !== c.high ||
        old.low !== c.low ||
        old.close !== c.close ||
        old.volume !== c.volume ||
        old.source !== data.source
      )
        changed.push(c);
    }
  }
  for (let i = 0; i < changed.length; i += 50)
    await env.DB.batch(
      changed
        .slice(i, i + 50)
        .map((c) =>
          env.DB.prepare(
            "INSERT INTO candles(symbol,tf,time,open,high,low,close,volume,source) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol,tf,time) DO UPDATE SET open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,volume=excluded.volume,source=excluded.source WHERE candles.open IS NOT excluded.open OR candles.high IS NOT excluded.high OR candles.low IS NOT excluded.low OR candles.close IS NOT excluded.close OR candles.volume IS NOT excluded.volume OR candles.source IS NOT excluded.source",
          ).bind(
            symbol,
            tf,
            c.time,
            c.open,
            c.high,
            c.low,
            c.close,
            c.volume,
            data.source,
          ),
        ),
    );
}
