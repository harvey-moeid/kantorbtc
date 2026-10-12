import { fetchJson } from "./market";
export type Exchange = "OKX" | "Binance" | "Bybit";
export async function verifiedGoldContract(source: Exchange): Promise<boolean> {
  if (source === "OKX") {
    const data = await fetchJson<{
      code: string;
      data: { instId: string; state: string; instType: string }[];
    }>(
      "https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=XAU-USDT-SWAP",
    );
    return (
      data.code === "0" &&
      data.data.some(
        (c) =>
          c.instId === "XAU-USDT-SWAP" &&
          c.state === "live" &&
          c.instType === "SWAP",
      )
    );
  }
  if (source === "Binance") {
    const data = await fetchJson<{
      symbols: { symbol: string; status: string; contractType: string }[];
    }>("https://fapi.binance.com/fapi/v1/exchangeInfo");
    return data.symbols.some(
      (c) =>
        c.symbol === "XAUUSDT" &&
        c.status === "TRADING" &&
        c.contractType === "PERPETUAL",
    );
  }
  const data = await fetchJson<{
    retCode: number;
    result: {
      list: { symbol: string; status: string; contractType: string }[];
    };
  }>(
    "https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=XAUUSDT",
  );
  return (
    data.retCode === 0 &&
    data.result.list.some(
      (c) =>
        c.symbol === "XAUUSDT" &&
        c.status === "Trading" &&
        c.contractType === "LinearPerpetual",
    )
  );
}
