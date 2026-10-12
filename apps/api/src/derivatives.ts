import { verifiedGoldContract } from "./gold-contract";
import type { Symbol } from "../../../packages/shared/src/domain";
import type { Derivatives } from "../../../packages/shared/src/engine";
import type { Env } from "./env";
import { fetchJson } from "./market";

type Snapshot = { source: string; funding: number; oi: number; at: number };

function number(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") return NaN;
  if (typeof value === "string" && !value.trim()) return NaN;
  return Number(value);
}

function valid(snapshot: Snapshot): boolean {
  return (
    [snapshot.funding, snapshot.oi, snapshot.at].every(Number.isFinite) &&
    snapshot.oi > 0 &&
    snapshot.at > 0 &&
    Date.now() - snapshot.at <= 120000 &&
    snapshot.at <= Date.now() + 5000
  );
}

async function okx(symbol: Symbol): Promise<Snapshot> {
  const instId = symbol === "BTCUSDT" ? "BTC-USDT-SWAP" : "XAU-USDT-SWAP";
  if (symbol === "XAUUSD" && !(await verifiedGoldContract("OKX")))
    throw new Error("Contract unavailable");
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
    throw new Error("Provider unavailable");
  return {
    source: "OKX",
    funding: number(funding.data[0].fundingRate),
    oi: number(interest.data[0].oi),
    at: number(interest.data[0].ts),
  };
}

async function binance(symbol: Symbol): Promise<Snapshot> {
  const instId = symbol === "BTCUSDT" ? "BTCUSDT" : "XAUUSDT";
  if (symbol === "XAUUSD" && !(await verifiedGoldContract("Binance")))
    throw new Error("Contract unavailable");
  const [funding, interest] = await Promise.all([
    fetchJson<{ symbol: string; lastFundingRate: string; time: number }>(
      `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${instId}`,
    ),
    fetchJson<{ symbol: string; openInterest: string; time: number }>(
      `https://fapi.binance.com/fapi/v1/openInterest?symbol=${instId}`,
    ),
  ]);
  if (
    funding.symbol !== instId ||
    interest.symbol !== instId ||
    Math.abs(funding.time - interest.time) > 120000
  )
    throw new Error("Provider unavailable");
  return {
    source: "Binance",
    funding: number(funding.lastFundingRate),
    oi: number(interest.openInterest),
    at: interest.time,
  };
}

async function bybit(symbol: Symbol): Promise<Snapshot> {
  const instId = symbol === "BTCUSDT" ? "BTCUSDT" : "XAUUSDT";
  if (symbol === "XAUUSD" && !(await verifiedGoldContract("Bybit")))
    throw new Error("Contract unavailable");
  const result = await fetchJson<{
    retCode: number;
    time: number;
    result: {
      list: { symbol: string; fundingRate: string; openInterest: string }[];
    };
  }>(
    `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${instId}`,
  );
  const value = result.result?.list?.find((c) => c.symbol === instId);
  if (result.retCode !== 0 || !value) throw new Error("Provider unavailable");
  return {
    source: "Bybit",
    funding: number(value.fundingRate),
    oi: number(value.openInterest),
    at: result.time,
  };
}

export async function derivatives(
  env: Env,
  symbol: Symbol,
): Promise<Derivatives | undefined> {
  let snapshot: Snapshot | undefined;
  for (const load of [okx, binance, bybit]) {
    try {
      const candidate = await load(symbol);
      if (valid(candidate)) {
        snapshot = candidate;
        break;
      }
    } catch {
      // Public provider fallback; never substitute prices or invent gold contracts.
    }
  }
  if (!snapshot) return undefined;
  // OI units differ across exchanges. A switch starts a fresh baseline rather
  // than comparing e.g. OKX contracts with Binance base-asset quantities.
  const previous = await env.DB.prepare(
    "SELECT open_interest FROM derivatives WHERE symbol=? AND source=? AND at<=? AND at>=? ORDER BY at DESC LIMIT 1",
  )
    .bind(symbol, snapshot.source, snapshot.at - 240000, snapshot.at - 1800000)
    .first<{ open_interest: number }>();
  const change =
    previous && previous.open_interest > 0
      ? snapshot.oi / previous.open_interest - 1
      : null;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO derivatives(symbol,at,source,funding,open_interest,oi_change,is_proxy) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(
      symbol,
      snapshot.at,
      snapshot.source,
      snapshot.funding,
      snapshot.oi,
      change,
      symbol === "XAUUSD" ? 1 : 0,
    )
    .run();
  return change === null
    ? undefined
    : { funding: snapshot.funding, oiChange: change };
}
