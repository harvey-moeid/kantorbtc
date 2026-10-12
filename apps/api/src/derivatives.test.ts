import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { derivatives } from "./derivatives";
import type { Env } from "./env";
let db: DatabaseSync;
let env: Env;
const now = 1791792000000;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  db = new DatabaseSync(":memory:");
  for (const file of ["0004_derivatives.sql", "0005_derivatives_sources.sql"])
    db.exec(
      readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"),
    );
  env = {
    DB: {
      prepare(sql: string) {
        const stmt = db.prepare(sql);
        let values: (string | number | null)[] = [];
        return {
          bind(...args: typeof values) {
            values = args;
            return this;
          },
          async first() {
            return stmt.get(...values) ?? null;
          },
          async run() {
            return stmt.run(...values);
          },
        };
      },
    },
  } as unknown as Env;
});
afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function baseline(
  source: string,
  oi = 100,
  at = now - 300000,
  symbol = "BTCUSDT",
) {
  db.prepare(
    "INSERT INTO derivatives(symbol,source,at,funding,open_interest,is_proxy) VALUES(?,?,?,0,?,?)",
  ).run(symbol, source, at, oi, symbol === "XAUUSD" ? 1 : 0);
}
function mock(provider = "OKX", malformed = false) {
  const request = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.hostname === "www.okx.com" && provider === "OKX")
      return Response.json(
        url.pathname.endsWith("funding-rate")
          ? { code: "0", data: [{ fundingRate: "0.0001" }] }
          : {
              code: "0",
              data: [{ oi: "110", ts: String(malformed ? now - 300000 : now) }],
            },
      );
    if (url.hostname === "fapi.binance.com" && provider === "Binance")
      return Response.json(
        url.pathname.endsWith("premiumIndex")
          ? { symbol: "BTCUSDT", lastFundingRate: "0.0002", time: now }
          : { symbol: "BTCUSDT", openInterest: "220", time: now },
      );
    if (url.hostname === "api.bybit.com" && provider === "Bybit")
      return Response.json({
        retCode: 0,
        time: now,
        result: {
          list: [
            {
              symbol: url.searchParams.get("symbol"),
              fundingRate: "-0.0001",
              openInterest: "330",
            },
          ],
        },
      });
    return Response.json(
      {
        code: "unavailable",
        retCode: 10001,
        result: { list: [] },
        data: [],
        symbols: [],
      },
      { status: 503 },
    );
  });
  vi.stubGlobal("fetch", request);
  return request;
}
describe("derivatives provider fallback", () => {
  it("uses only the primary when its data is valid", async () => {
    baseline("OKX");
    const request = mock();
    expect(await derivatives(env, "BTCUSDT")).toEqual({
      funding: 0.0001,
      oiChange: expect.closeTo(0.1),
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("falls back to Binance without comparing OI units across providers", async () => {
    baseline("OKX", 10000);
    baseline("Binance", 200);
    mock("Binance");
    expect(await derivatives(env, "BTCUSDT")).toEqual({
      funding: 0.0002,
      oiChange: expect.closeTo(0.1),
    });
    expect(
      db
        .prepare("SELECT source FROM derivatives ORDER BY at DESC LIMIT 1")
        .get()?.source,
    ).toBe("Binance");
  });
  it("falls back to Bybit when both earlier providers fail", async () => {
    baseline("Bybit", 300);
    mock("Bybit");
    expect(await derivatives(env, "BTCUSDT")).toEqual({
      funding: -0.0001,
      oiChange: expect.closeTo(0.1),
    });
  });
  it("stores a new baseline and abstains after switching to an unseen source", async () => {
    baseline("OKX", 10000);
    mock("Binance");
    expect(await derivatives(env, "BTCUSDT")).toBeUndefined();
    expect(
      db
        .prepare("SELECT oi_change FROM derivatives WHERE source='Binance'")
        .get()?.oi_change,
    ).toBeNull();
  });
  it("does not reuse an old baseline or stale current snapshot", async () => {
    baseline("OKX", 100, now - 3600000);
    mock();
    expect(await derivatives(env, "BTCUSDT")).toBeUndefined();
    mock("OKX", true);
    expect(await derivatives(env, "BTCUSDT")).toBeUndefined();
  });
  it("abstains for unavailable gold contracts without requesting invented tickers", async () => {
    const request = mock();
    expect(await derivatives(env, "XAUUSD")).toBeUndefined();
    expect(
      request.mock.calls.every(([url]) => /instruments|exchangeInfo/.test(url)),
    ).toBe(true);
    expect(db.prepare("SELECT count(*) AS n FROM derivatives").get()?.n).toBe(
      0,
    );
  });
  it("accepts gold proxy data only after confirming an active perpetual contract", async () => {
    baseline("Bybit", 300, now - 300000, "XAUUSD");
    const request = mock("Bybit");
    request.mockImplementation(async (input) => {
      const url = new URL(input);
      if (url.hostname !== "api.bybit.com")
        return Response.json({}, { status: 503 });
      return Response.json(
        url.pathname.endsWith("instruments-info")
          ? {
              retCode: 0,
              result: {
                list: [
                  {
                    symbol: "XAUUSDT",
                    status: "Trading",
                    contractType: "LinearPerpetual",
                  },
                ],
              },
            }
          : {
              retCode: 0,
              time: now,
              result: {
                list: [
                  {
                    symbol: "XAUUSDT",
                    fundingRate: "0.0003",
                    openInterest: "330",
                  },
                ],
              },
            },
      );
    });
    expect(await derivatives(env, "XAUUSD")).toEqual({
      funding: 0.0003,
      oiChange: expect.closeTo(0.1),
    });
    expect(
      db
        .prepare("SELECT is_proxy FROM derivatives ORDER BY at DESC LIMIT 1")
        .get()?.is_proxy,
    ).toBe(1);
  });
  it("retains different sources with identical timestamps through the migration", () => {
    baseline("OKX", 100, now);
    baseline("Binance", 200, now);
    expect(db.prepare("SELECT count(*) AS n FROM derivatives").get()?.n).toBe(
      2,
    );
  });
});
