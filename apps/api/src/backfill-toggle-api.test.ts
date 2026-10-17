import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { app } from "./index";
import { hashToken } from "./security";
import type { Env } from "./env";

describe("private backfill switches API", () => {
  let db: DatabaseSync;
  let env: Env;
  const token = "b".repeat(64);
  const headers = {
    Cookie: `kantor_session=${token}`,
    Origin: "https://kantor.test",
    "Content-Type": "application/json",
  };
  const request = (path: string, init: RequestInit = {}) =>
    app.request(
      `https://kantor.test/api${path}`,
      { ...init, headers: { ...headers, ...init.headers } },
      env,
    );

  beforeEach(async () => {
    db = new DatabaseSync(":memory:");
    for (const migration of ["0001_initial", "0002_backfill"])
      db.exec(
        readFileSync(new URL(`../migrations/${migration}.sql`, import.meta.url), "utf8"),
      );
    db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)")
      .run(await hashToken(token), "owner", Date.now() + 60000);
    env = {
      APP_MODE: "live",
      DB: {
        prepare(sql: string) {
          const statement = db.prepare(sql);
          let values: (string | number | null)[] = [];
          return {
            bind(...params: (string | number | null)[]) {
              values = params;
              return this;
            },
            async first() {
              return statement.get(...values) ?? null;
            },
            async all() {
              return { results: statement.all(...values) };
            },
            async run() {
              return statement.run(...values);
            },
          };
        },
      },
    } as unknown as Env;
  });
  afterEach(() => db.close());

  it("requires owner session to view or change backfill switches", async () => {
    const noCookie = { method: "PUT", headers: { Origin: "https://kantor.test" }, body: JSON.stringify({ enabled: true }) };
    expect((await app.request("https://kantor.test/api/backfill/BTCUSDT/enabled", noCookie, env)).status).toBe(401);
    expect((await app.request("https://kantor.test/api/backfill", {}, env)).status).toBe(401);
    expect((await request("/backfill")).status).toBe(200);
  });

  it("starts OFF, persists each symbol independently, and validates payloads", async () => {
    const initial = await request("/backfill");
    expect((await initial.json()).enabled).toEqual({ BTCUSDT: false, XAUUSD: false });

    const invalid = await request("/backfill/BTCUSDT/enabled", {
      method: "PUT", body: JSON.stringify({ enabled: "yes" }),
    });
    expect(invalid.status).toBe(400);
    const invalidSymbol = await request("/backfill/ETHUSDT/enabled", {
      method: "PUT", body: JSON.stringify({ enabled: true }),
    });
    expect(invalidSymbol.status).toBe(400);

    const enabled = await request("/backfill/BTCUSDT/enabled", {
      method: "PUT", body: JSON.stringify({ enabled: true }),
    });
    expect(enabled.status).toBe(200);
    expect((await enabled.json()).enabled).toBe(true);
    expect((await (await request("/backfill")).json()).enabled).toEqual({
      BTCUSDT: true, XAUUSD: false,
    });
    await request("/backfill/BTCUSDT/enabled", {
      method: "PUT", body: JSON.stringify({ enabled: false }),
    });
    expect((await (await request("/backfill")).json()).enabled).toEqual({
      BTCUSDT: false, XAUUSD: false,
    });
  });

  it("blocks manual start and failed job resume while a symbol is OFF", async () => {
    const create = await request("/backfill", {
      method: "POST",
      body: JSON.stringify({ symbol: "XAUUSD", from: 1700000000, to: 1700003000 }),
    });
    expect(create.status).toBe(409);
    db.prepare(
      "INSERT INTO backfill_jobs(id,symbol,tf,from_time,to_time,cursor_time,status,updated_at) VALUES('job-xau','XAUUSD','5m',0,1000,1000,'failed',0)",
    ).run();
    expect((await request("/backfill/job-xau/resume", { method: "POST" })).status).toBe(409);
    expect(db.prepare("SELECT status FROM backfill_jobs WHERE id='job-xau'").get()?.status).toBe("failed");
    await request("/backfill/XAUUSD/enabled", {
      method: "PUT", body: JSON.stringify({ enabled: true }),
    });
    expect((await request("/backfill/job-xau/resume", { method: "POST" })).status).toBe(200);
    expect(db.prepare("SELECT status FROM backfill_jobs WHERE id='job-xau'").get()?.status).toBe("pending");
  });
});
