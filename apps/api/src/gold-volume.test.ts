import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goldVolume } from "./gold-volume";
import { scan } from "../../../packages/shared/src/engine";
import {
  defaultSettings,
  seconds,
  timeframes,
  type Timeframe,
} from "../../../packages/shared/src/domain";
const now = 1791792000000;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function mock(source = "OKX", tf: Timeframe = "5m", invalid = false) {
  const before = Math.floor(now / 1000 / seconds[tf]) * seconds[tf];
  const request = vi.fn(async (input: string) => {
    const url = new URL(input),
      host = url.hostname;
    if (url.pathname.endsWith("instruments"))
      return Response.json({
        code: "0",
        data:
          source === "OKX"
            ? [{ instId: "XAU-USDT-SWAP", state: "live", instType: "SWAP" }]
            : [],
      });
    if (url.pathname.endsWith("exchangeInfo"))
      return Response.json({
        symbols:
          source === "Binance"
            ? [
                {
                  symbol: "XAUUSDT",
                  status: "TRADING",
                  contractType: "PERPETUAL",
                },
              ]
            : [],
      });
    if (url.pathname.endsWith("instruments-info"))
      return Response.json({
        retCode: 0,
        result: {
          list:
            source === "Bybit"
              ? [
                  {
                    symbol: "XAUUSDT",
                    status: "Trading",
                    contractType: "LinearPerpetual",
                  },
                ]
              : [],
        },
      });
    const rows = Array.from({ length: 60 }, (_, i) => [
      String((before - (60 - i) * seconds[tf]) * 1000),
      "100",
      "110",
      "90",
      "105",
      invalid && i === 59 ? "-1" : i === 59 ? "300" : "100",
      "100",
      "100",
      "1",
    ]);
    if (host === "www.okx.com")
      return Response.json({ code: "0", data: rows.reverse() });
    if (host === "fapi.binance.com")
      return Response.json(
        rows.map((row) => [
          ...row.slice(0, 6),
          Number(row[0]) + seconds[tf] * 1000 - 1,
        ]),
      );
    return Response.json({ retCode: 0, result: { list: rows.reverse() } });
  });
  vi.stubGlobal("fetch", request);
  return request;
}
describe("verified gold perpetual volume fallback", () => {
  it.each(timeframes)("normalizes closed proxy candles for %s", async (tf) => {
    mock("OKX", tf);
    const result = await goldVolume(tf);
    expect(result?.isProxy).toBe(true);
    expect(result?.candles).toHaveLength(60);
    expect(result?.source).toBe("OKX XAU-USDT-SWAP");
    expect(result?.candles.at(-1)?.time).toBe(
      Math.floor(now / 1000 / seconds[tf]) * seconds[tf] - seconds[tf],
    );
  });
  it.each(["Binance", "Bybit"])(
    "falls back to a verified %s contract",
    async (source) => {
      mock(source);
      expect((await goldVolume("5m"))?.source).toContain(source);
    },
  );
  it("does not fetch OHLC for unavailable contracts", async () => {
    const request = mock("none");
    expect(await goldVolume("5m")).toBeUndefined();
    expect(
      request.mock.calls.every(([url]) => /instruments|exchangeInfo/.test(url)),
    ).toBe(true);
  });
  it("rejects malformed or negative latest volume instead of manufacturing it", async () => {
    mock("OKX", "5m", true);
    expect(await goldVolume("5m")).toBeUndefined();
  });
  it("uses proxy volume for its group without changing spot candles or prices", async () => {
    mock();
    const proxy = (await goldVolume("5m"))!;
    const spot = proxy.candles.map((c) => ({
      ...c,
      open: 4000,
      high: 4010,
      low: 3990,
      close: 4005,
      volume: 0,
    }));
    expect(scan(spot, undefined, defaultSettings)[2].direction).toBe("abstain");
    const result = scan(spot, undefined, defaultSettings, {
      volumeCandles: proxy.candles,
      volumeSource: proxy.source,
      volumeIsProxy: true,
    });
    expect(result[2].direction).toBe("long");
    expect(result[2].evidence.join(" ")).toContain("Proxy perpetual emas");
    expect(spot.at(-1)?.close).toBe(4005);
    expect(spot.at(-1)?.volume).toBe(0);
  });
  it("abstains when the proxy window does not align with the spot candle", async () => {
    mock();
    const proxy = (await goldVolume("5m"))!;
    const spot = proxy.candles.map((c) => ({ ...c, volume: 0 }));
    const shifted = proxy.candles.map((c) => ({ ...c, time: c.time - 300 }));
    expect(
      scan(spot, undefined, defaultSettings, { volumeCandles: shifted })[2]
        .direction,
    ).toBe("abstain");
  });
});
