import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { app } from "./index";
import { marketReadiness } from "./health";
import { hashToken } from "./security";
import type { Env } from "./env";
import type { Quote } from "../../../packages/shared/src/domain";

describe("application health and private readiness", () => {
  let db: DatabaseSync;
  let env: Env;
  const fetchHub = vi.fn();
  const token = "b".repeat(64);
  const healthyMarkets = [
    { symbol: "BTCUSDT", status: "fresh" },
    { symbol: "XAUUSD", status: "closed" },
  ];
  beforeEach(async () => {
    db = new DatabaseSync(":memory:");
    for (const name of [
      "0001_initial",
      "0002_backfill",
      "0003_credential_status",
      "0004_derivatives",
    ])
      db.exec(
        readFileSync(
          new URL(`../migrations/${name}.sql`, import.meta.url),
          "utf8",
        ),
      );
    db.exec("INSERT INTO users VALUES('owner','env-managed',0)");
    db.prepare("INSERT INTO sessions VALUES(?,'owner',?)").run(
      await hashToken(token),
      Date.now() + 60000,
    );
    fetchHub
      .mockReset()
      .mockImplementation(async () =>
        Response.json({ markets: healthyMarkets }),
      );
    env = {
      APP_MODE: "live",
      ADMIN_PASSWORD: "private-password",
      ENCRYPTION_KEY: "ab".repeat(32),
      DB: {
        prepare(sql: string) {
          const statement = db.prepare(sql);
          let values: (string | number | null)[] = [];
          return {
            bind(...input: (string | number | null)[]) {
              values = input;
              return this;
            },
            async first() {
              return statement.get(...values) ?? null;
            },
            async all() {
              return { results: statement.all(...values) };
            },
          };
        },
      },
      MARKET_HUB: {
        idFromName: () => "office",
        get: () => ({ fetch: fetchHub }),
      },
    } as unknown as Env;
  });
  afterEach(() => {
    db.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const request = (path = "health", authenticated = false) =>
    app.request(
      `https://kantor.test/api/${path}`,
      { headers: authenticated ? { Cookie: `kantor_session=${token}` } : {} },
      env,
    );

  it("checks the migrated schema and configuration without contacting providers", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      checks: { database: true, configuration: true },
    });
    expect(fetchHub).not.toHaveBeenCalled();
  });
  it("fails closed for an unmigrated database without disclosing SQL or credentials", async () => {
    db.exec("DROP TABLE derivatives");
    const response = await request();
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({
      status: "degraded",
      checks: { database: false },
    });
    expect(body).not.toMatch(/SELECT|derivatives|private-password|abababab/);
  });
  it("detects a missing credential-status migration", async () => {
    db.exec("ALTER TABLE api_credentials DROP COLUMN test_status");
    expect((await request()).status).toBe(503);
  });
  it.each(["ADMIN_PASSWORD", "ENCRYPTION_KEY", "MARKET_HUB"] as const)(
    "rejects missing live configuration %s",
    async (field) => {
      delete (env as unknown as Record<string, unknown>)[field];
      const response = await request();
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        checks: { database: true, configuration: false },
      });
    },
  );
  it("does not require live secrets or data in demo mode", async () => {
    env.APP_MODE = "demo";
    delete env.ADMIN_PASSWORD;
    delete env.ENCRYPTION_KEY;
    const response = await request("readiness", true);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ market: "not_required" });
    expect(fetchHub).not.toHaveBeenCalled();
  });
  it("requires login before checking market readiness", async () => {
    expect((await request("readiness")).status).toBe(401);
    expect(fetchHub).not.toHaveBeenCalled();
  });
  it("reports fresh and recently confirmed closed markets using an explicit allowlist", async () => {
    fetchHub.mockResolvedValue(
      Response.json({
        markets: healthyMarkets.map((row) => ({
          ...row,
          price: 67482,
          token: "PRIVATE_MARKER",
        })),
        quote: "PRIVATE_MARKER",
      }),
    );
    const response = await request("readiness", true);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({
      status: "ok",
      markets: healthyMarkets,
    });
    expect(body).not.toMatch(/67482|PRIVATE_MARKER|private-password/);
  });
  it("returns 503 for missing or stale market data", async () => {
    fetchHub.mockResolvedValue(
      Response.json({ markets: [{ symbol: "BTCUSDT", status: "stale" }] }),
    );
    const response = await request("readiness", true);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      market: "degraded",
      markets: [
        { symbol: "BTCUSDT", status: "stale" },
        { symbol: "XAUUSD", status: "missing" },
      ],
    });
  });
  it("redacts hub failures", async () => {
    fetchHub.mockRejectedValue(new Error("PRIVATE_PROVIDER_DETAILS"));
    const response = await request("readiness", true);
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ market: "unavailable" });
    expect(body).not.toContain("PRIVATE_PROVIDER_DETAILS");
  });
  it("bounds the response when D1 never resolves", async () => {
    vi.useFakeTimers();
    vi.spyOn(env.DB, "prepare").mockReturnValue({
      all: () => new Promise(() => {}),
    } as unknown as D1PreparedStatement);
    const response = request();
    await vi.advanceTimersByTimeAsync(3000);
    expect((await response).status).toBe(503);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds readiness when the hub ignores cancellation", async () => {
    vi.useFakeTimers();
    fetchHub.mockImplementation(() => new Promise(() => {}));
    const response = request("readiness", true);
    // Session hashing uses real Web Crypto; wait until the hub request starts
    // before advancing its deadline on the fake clock.
    await vi.waitFor(() => expect(fetchHub).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(3000);
    expect((await response).status).toBe(503);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("market freshness", () => {
  const now = 1000000;
  const btc: Quote = {
    symbol: "BTCUSDT",
    price: 100,
    change: 0,
    source: "fixture",
    status: "live",
    at: now,
  };
  const gold: Quote = { ...btc, symbol: "XAUUSD", status: "closed", at: 1 };
  const assess = (quote: Quote, observedAt?: number) =>
    marketReadiness(
      new Map([[quote.symbol, quote]]),
      new Map(observedAt === undefined ? [] : [[quote.symbol, observedAt]]),
      now,
    ).find((row) => row.symbol === quote.symbol)?.status;
  it("requires a current observation even for a closed market", () => {
    expect(assess(gold, now)).toBe("closed");
    expect(assess(gold, now - 45001)).toBe("stale");
    expect(assess(gold)).toBe("stale");
  });
  it("does not treat an old provider timestamp or stale/demo status as fresh", () => {
    expect(assess(btc, now)).toBe("fresh");
    expect(assess({ ...btc, at: now - 45001 }, now)).toBe("stale");
    expect(assess({ ...btc, status: "fallback" }, now)).toBe("fresh");
    expect(assess({ ...btc, status: "stale" }, now)).toBe("stale");
    expect(assess({ ...btc, status: "demo" }, now)).toBe("stale");
    expect(assess({ ...btc, status: "closed" }, now)).toBe("stale");
  });
  it("rejects invalid prices, future timestamps and missing symbols", () => {
    expect(assess({ ...btc, price: NaN }, now)).toBe("stale");
    expect(assess({ ...btc, at: now + 6000 }, now)).toBe("stale");
    expect(
      marketReadiness(new Map(), new Map(), now).every(
        (row) => row.status === "missing",
      ),
    ).toBe(true);
  });
});
