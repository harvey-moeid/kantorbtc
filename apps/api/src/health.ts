import { symbols, type Quote } from "../../../packages/shared/src/domain";
import type { Env } from "./env";
import { withDeadline } from "./deadline";

export async function applicationHealth(env: Env) {
  let database = false;
  try {
    // Resolve core tables and columns from all four migrations without scanning
    // their contents. SELECT 1 alone would miss an unmigrated database.
    await withDeadline(
      () =>
        env.DB.prepare(
          "SELECT sessions.token_hash,settings.version,candles.source,signals.status,alert_outbox.retry_at,backfill_jobs.cursor_time,api_credentials.test_status,derivatives.open_interest FROM sessions,settings,candles,signals,alert_outbox,backfill_jobs,api_credentials,derivatives LIMIT 0",
        ).all(),
      3000,
    );
    database = true;
  } catch {
    // Do not expose database errors, schema details or secret values publicly.
  }
  const configuration =
    env.APP_MODE === "demo" ||
    (env.APP_MODE === "live" &&
      !!env.ADMIN_PASSWORD?.trim() &&
      /^[0-9a-f]{64}$/i.test(env.ENCRYPTION_KEY || "") &&
      !!env.MARKET_HUB);
  return {
    status: database && configuration ? "ok" : "degraded",
    app: "kantor",
    mode: env.APP_MODE,
    version: "0.1.0",
    checks: { database, configuration },
  };
}

export function marketReadiness(
  quotes: ReadonlyMap<Quote["symbol"], Quote>,
  observed: ReadonlyMap<Quote["symbol"], number>,
  now = Date.now(),
) {
  return symbols.map((symbol) => {
    const quote = quotes.get(symbol),
      at = observed.get(symbol);
    let status: "missing" | "stale" | "fresh" | "closed" = "missing";
    if (quote) {
      const valid =
        Number.isFinite(quote.price) &&
        quote.price > 0 &&
        Number.isFinite(quote.at) &&
        quote.at > 0 &&
        quote.at <= now + 5000;
      const recentlyObserved =
        at !== undefined &&
        Number.isFinite(at) &&
        at <= now &&
        now - at <= 45000;
      status =
        valid &&
        recentlyObserved &&
        symbol === "XAUUSD" &&
        quote.status === "closed"
          ? "closed"
          : valid &&
              recentlyObserved &&
              now - quote.at <= 45000 &&
              ["live", "fallback"].includes(quote.status)
            ? "fresh"
            : "stale";
    }
    return { symbol, status };
  });
}

export async function applicationReadiness(env: Env) {
  const health = await applicationHealth(env);
  if (env.APP_MODE === "demo") return { ...health, market: "not_required" };
  try {
    const hub = env.MARKET_HUB.get(env.MARKET_HUB.idFromName("office"));
    const markets = await withDeadline(async (signal) => {
      const response = await hub.fetch("https://hub/health", { signal });
      if (!response.ok) throw new Error("Market unavailable");
      const result = await response.json<{
        markets: ReturnType<typeof marketReadiness>;
      }>();
      // Rebuild an allowlist; upstream responses must never leak quotes here.
      return symbols.map((symbol) => {
        const row = result.markets.find((item) => item.symbol === symbol);
        const status =
          row && ["fresh", "closed", "stale", "missing"].includes(row.status)
            ? row.status
            : "missing";
        return { symbol, status };
      });
    }, 3000);
    const market = markets.every(
      (row) => row.status === "fresh" || row.status === "closed",
    );
    return {
      ...health,
      status: health.status === "ok" && market ? "ok" : "degraded",
      market: market ? "ok" : "degraded",
      markets,
    };
  } catch {
    return { ...health, status: "degraded", market: "unavailable" };
  }
}
