import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Env } from "./env";

vi.mock("./market", () => ({
  marketCandles: vi.fn(async () => ({
    candles: [{ time: 100, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
    source: "OKX",
  })),
  persistCandles: vi.fn(),
}));

import { app } from "./index";
import { initialBackfill, backfillChunk } from "./backfill";
import {
  backfillFlags,
  isBackfillEnabled,
  setBackfillEnabled,
} from "./backfill-control";
import { marketCandles, persistCandles } from "./market";

let db: DatabaseSync;
let env: Env;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  for (const migration of ["0001_initial", "0002_backfill"])
    db.exec(
      readFileSync(
        new URL(`../migrations/${migration}.sql`, import.meta.url),
        "utf8",
      ),
    );
  env = {
    APP_MODE: "live",
    ADMIN_PASSWORD: "fixture-password",
    DB: {
      prepare(sql: string) {
        const stmt = db.prepare(sql);
        let values: (string | number | null)[] = [];
        return {
          bind(...args: (string | number | null)[]) {
            values = args;
            return this;
          },
          async first() {
            return stmt.get(...values) ?? null;
          },
          async all() {
            return { results: stmt.all(...values) };
          },
          async run() {
            return { meta: { changes: Number(stmt.run(...values).changes) } };
          },
        };
      },
      async batch(statements: D1PreparedStatement[]) {
        return Promise.all(statements.map((stmt) => stmt.run()));
      },
    } as unknown as D1Database,
  } as Env;
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("backfill per-symbol switches", () => {
  it("defaults BTC on and XAU off and saves only changed choices", async () => {
    expect(await backfillFlags(env)).toEqual({ BTCUSDT: true, XAUUSD: false });
    expect(await isBackfillEnabled(env, "XAUUSD")).toBe(false);
    await setBackfillEnabled(env, "XAUUSD", true);
    await setBackfillEnabled(env, "BTCUSDT", false);
    await setBackfillEnabled(env, "BTCUSDT", false);
    expect(await backfillFlags(env)).toEqual({ BTCUSDT: false, XAUUSD: true });
    expect(
      db.prepare("SELECT count(*) AS n FROM settings_audit").get()?.n,
    ).toBe(2);
  });

  it("creates initial jobs only for enabled assets and never duplicates initialization", async () => {
    await initialBackfill(env);
    await initialBackfill(env);
    expect(
      db
        .prepare(
          "SELECT symbol,count(*) AS n FROM backfill_jobs GROUP BY symbol",
        )
        .all(),
    ).toEqual([{ symbol: "BTCUSDT", n: 5 }]);
  });

  it("does not burn a 15-minute budget slot or move the cursor while all jobs are paused", async () => {
    db.exec(
      "INSERT INTO backfill_jobs(id,symbol,tf,from_time,to_time,cursor_time,updated_at) VALUES('btc','BTCUSDT','5m',0,1000,1000,0),('xau','XAUUSD','5m',0,1000,1000,1)",
    );
    await setBackfillEnabled(env, "BTCUSDT", false);
    await backfillChunk(env);
    expect(marketCandles).not.toHaveBeenCalled();
    expect(
      db
        .prepare("SELECT id FROM settings WHERE id='backfill_last_attempt'")
        .get(),
    ).toBeUndefined();
    expect(
      db.prepare("SELECT cursor_time FROM backfill_jobs WHERE id='btc'").get()
        ?.cursor_time,
    ).toBe(1000);
    await setBackfillEnabled(env, "BTCUSDT", true);
    await backfillChunk(env);
    expect(marketCandles).toHaveBeenCalledTimes(1);
    expect(
      db.prepare("SELECT cursor_time FROM backfill_jobs WHERE id='btc'").get()
        ?.cursor_time,
    ).toBe(100);
    expect(
      db.prepare("SELECT cursor_time FROM backfill_jobs WHERE id='xau'").get()
        ?.cursor_time,
    ).toBe(1000);
  });

  it("does not persist a provider result after backfill is turned off in flight", async () => {
    db.exec(
      "INSERT INTO backfill_jobs(id,symbol,tf,from_time,to_time,cursor_time,updated_at) VALUES('btc','BTCUSDT','5m',0,1000,1000,0)",
    );
    vi.mocked(marketCandles).mockImplementationOnce(async () => {
      await setBackfillEnabled(env, "BTCUSDT", false);
      return {
        candles: [{ time: 100, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
        source: "OKX",
      };
    });
    await backfillChunk(env);
    expect(persistCandles).not.toHaveBeenCalled();
    expect(
      db.prepare("SELECT cursor_time FROM backfill_jobs WHERE id='btc'").get()
        ?.cursor_time,
    ).toBe(1000);
  });

  it("requires admin login, checks symbols, and blocks manual backfill and resume while off", async () => {
    const url = "https://kantor.test";
    const get = (path: string, cookie?: string) =>
      app.request(
        url + path,
        { headers: cookie ? { Cookie: cookie } : {} },
        env,
      );
    expect((await get("/api/backfill")).status).toBe(401);
    const login = await app.request(
      url + "/api/auth/login",
      {
        method: "POST",
        headers: { Origin: url, "Content-Type": "application/json" },
        body: JSON.stringify({ password: "fixture-password" }),
      },
      env,
    );
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const put = (symbol: string, value: unknown) =>
      app.request(
        url + "/api/backfill/settings/" + symbol,
        {
          method: "PUT",
          headers: {
            Origin: url,
            Cookie: cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(value),
        },
        env,
      );
    expect((await put("INVALID", { enabled: true })).status).toBe(400);
    expect((await put("BTCUSDT", { enabled: "off" })).status).toBe(400);
    expect((await put("XAUUSD", { enabled: true, unexpected: 1 })).status).toBe(
      400,
    );

    const manual = () =>
      app.request(
        url + "/api/backfill",
        {
          method: "POST",
          headers: {
            Origin: url,
            Cookie: cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ symbol: "XAUUSD", from: 100, to: 200 }),
        },
        env,
      );
    expect((await manual()).status).toBe(409);

    db.exec(
      "INSERT INTO backfill_jobs(id,symbol,tf,from_time,to_time,cursor_time,status,updated_at) VALUES('failed-xau','XAUUSD','5m',0,1000,1000,'failed',0)",
    );
    const resume = () =>
      app.request(
        url + "/api/backfill/failed-xau/resume",
        {
          method: "POST",
          headers: { Origin: url, Cookie: cookie },
        },
        env,
      );
    expect((await resume()).status).toBe(409);
    expect((await put("XAUUSD", { enabled: true })).status).toBe(200);
    expect((await get("/api/backfill", cookie)).status).toBe(200);
    expect((await resume()).status).toBe(200);
    expect(
      db
        .prepare("SELECT cursor_time FROM backfill_jobs WHERE id='failed-xau'")
        .get()?.cursor_time,
    ).toBe(1000);
    // An existing failed history job must not be replaced by five new jobs.
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM backfill_jobs WHERE symbol='XAUUSD'",
        )
        .get()?.n,
    ).toBe(1);
  });

  it("bootstraps a newly enabled symbol that never had a history job", async () => {
    const url = "https://kantor.test";
    const login = await app.request(
      url + "/api/auth/login",
      {
        method: "POST",
        headers: { Origin: url, "Content-Type": "application/json" },
        body: JSON.stringify({ password: "fixture-password" }),
      },
      env,
    );
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const response = await app.request(
      url + "/api/backfill/settings/XAUUSD",
      {
        method: "PUT",
        headers: {
          Origin: url,
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: true }),
      },
      env,
    );
    expect(response.status).toBe(200);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM backfill_jobs WHERE symbol='XAUUSD'",
        )
        .get()?.n,
    ).toBe(5);
  });
});
