import type { Symbol } from "../../../packages/shared/src/domain";
import type { Derivatives } from "../../../packages/shared/src/engine";
import type { Env } from "./env";
import { fetchJson } from "./market";
export async function derivatives(
  env: Env,
  symbol: Symbol,
): Promise<Derivatives | undefined> {
  const instId = symbol === "BTCUSDT" ? "BTC-USDT-SWAP" : "XAU-USDT-SWAP";
  try {
    const [funding, interest] = await Promise.all([
      fetchJson<{ code: string; data: { fundingRate: string }[] }>(
        `https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`,
      ),
      fetchJson<{ code: string; data: { oi: string; ts: string }[] }>(
        `https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${instId}`,
      ),
    ]);
    if (
      funding.code !== "0" ||
      interest.code !== "0" ||
      !funding.data[0] ||
      !interest.data[0]
    )
      return undefined;
    const rate = +funding.data[0].fundingRate,
      oi = +interest.data[0].oi,
      at = +interest.data[0].ts;
    if (
      !Number.isFinite(rate) ||
      !Number.isFinite(oi) ||
      oi <= 0 ||
      !Number.isFinite(at)
    )
      return undefined;
    const previous = await env.DB.prepare(
        "SELECT open_interest FROM derivatives WHERE symbol=? AND at<? ORDER BY at DESC LIMIT 1",
      )
        .bind(symbol, at - 240000)
        .first<{ open_interest: number }>(),
      change =
        previous && previous.open_interest > 0
          ? oi / previous.open_interest - 1
          : null;
    await env.DB.prepare(
      "INSERT OR IGNORE INTO derivatives(symbol,at,source,funding,open_interest,oi_change,is_proxy) VALUES(?,?,?,?,?,?,?)",
    )
      .bind(symbol, at, "OKX", rate, oi, change, symbol === "XAUUSD" ? 1 : 0)
      .run();
    return change === null ? undefined : { funding: rate, oiChange: change };
  } catch {
    return undefined;
  }
}
