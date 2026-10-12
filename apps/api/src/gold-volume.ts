import {
  seconds,
  type Candle,
  type Timeframe,
} from "../../../packages/shared/src/domain";
import { fetchJson } from "./market";
import { verifiedGoldContract, type Exchange } from "./gold-contract";
const okxBars = { "5m": "5m", "15m": "15m", H1: "1H", H4: "4H", D1: "1Dutc" };
const binanceBars = { "5m": "5m", "15m": "15m", H1: "1h", H4: "4h", D1: "1d" };
const bybitBars = { "5m": "5", "15m": "15", H1: "60", H4: "240", D1: "D" };
export type GoldVolume = { candles: Candle[]; source: string; isProxy: true };
export async function goldVolume(
  tf: Timeframe,
): Promise<GoldVolume | undefined> {
  const closedBefore =
    Math.floor(Date.now() / 1000 / seconds[tf]) * seconds[tf];
  for (const source of ["OKX", "Binance", "Bybit"] as Exchange[]) {
    try {
      if (!(await verifiedGoldContract(source))) continue;
      let rows: Candle[];
      if (source === "OKX") {
        const result = await fetchJson<{ code: string; data: string[][] }>(
          `https://www.okx.com/api/v5/market/candles?instId=XAU-USDT-SWAP&bar=${okxBars[tf]}&limit=100`,
        );
        if (result.code !== "0") continue;
        rows = result.data
          .filter((row) => row[8] === "1")
          .map((row) => ({
            time: Number(row[0]) / 1000,
            open: Number(row[1]),
            high: Number(row[2]),
            low: Number(row[3]),
            close: Number(row[4]),
            volume: Number(row[5]),
          }));
      } else if (source === "Binance") {
        const result = await fetchJson<(number | string)[][]>(
          `https://fapi.binance.com/fapi/v1/klines?symbol=XAUUSDT&interval=${binanceBars[tf]}&limit=100`,
        );
        rows = result
          .filter((row) => Number(row[6]) < Date.now())
          .map((row) => ({
            time: Number(row[0]) / 1000,
            open: Number(row[1]),
            high: Number(row[2]),
            low: Number(row[3]),
            close: Number(row[4]),
            volume: Number(row[5]),
          }));
      } else {
        const result = await fetchJson<{
          retCode: number;
          result: { list: string[][] };
        }>(
          `https://api.bybit.com/v5/market/kline?category=linear&symbol=XAUUSDT&interval=${bybitBars[tf]}&limit=100`,
        );
        if (result.retCode !== 0) continue;
        rows = result.result.list.map((row) => ({
          time: Number(row[0]) / 1000,
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
          volume: Number(row[5]),
        }));
      }
      const candles = [
        ...new Map(
          rows
            .filter(
              (c) =>
                [c.time, c.open, c.high, c.low, c.close, c.volume].every(
                  Number.isFinite,
                ) &&
                c.low > 0 &&
                c.high >= Math.max(c.open, c.close) &&
                c.low <= Math.min(c.open, c.close) &&
                c.volume >= 0 &&
                c.time < closedBefore,
            )
            .map((c) => [c.time, c]),
        ).values(),
      ].sort((a, b) => a.time - b.time);
      if (
        candles.length >= 32 &&
        candles.at(-1)!.time === closedBefore - seconds[tf] &&
        candles.at(-1)!.volume > 0
      )
        return {
          candles,
          source: `${source} XAU${source === "OKX" ? "-USDT-SWAP" : "USDT"}`,
          isProxy: true,
        };
    } catch {
      /* Public fallback; unavailable or unverified proxy means abstain. */
    }
  }
  return undefined;
}
