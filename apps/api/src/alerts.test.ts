import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { app } from "./index";
import type { Env } from "./env";
import { hashToken } from "./security";
import { claimPriceAlert } from "./notifications";

describe("price alert editing", () => {
  let db: DatabaseSync;
  let env: Env;
  const token = "a".repeat(64);

  beforeEach(async () => {
    db = new DatabaseSync(":memory:");
    db.exec(
      readFileSync(
        new URL("../migrations/0001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    db.prepare(
      "INSERT INTO users(id,password_hash,created_at) VALUES('owner','unused',0)",
    ).run();
    db.prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,'owner',?)",
    ).run(await hashToken(token), Date.now() + 60000);
    db.prepare(
      "INSERT INTO alerts(id,symbol,price,created_at) VALUES('test-alert','BTCUSDT',67500,123)",
    ).run();
    // Exercise the actual API middleware and SQL against SQLite, rather than
    // returning fabricated rows for each expected query.
    env = {
      APP_MODE: "demo",
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
            async run() {
              return statement.run(...values);
            },
          };
        },
      } as unknown as D1Database,
    } as Env;
  });
  afterEach(() => db.close());

  const request = (
    body: unknown,
    options: { auth?: boolean; origin?: string; id?: string } = {},
  ) =>
    app.request(
      `https://kantor.test/api/alerts/${options.id ?? "test-alert"}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: options.origin ?? "https://kantor.test",
          ...(options.auth === false
            ? {}
            : { Cookie: `kantor_session=${token}` }),
        },
        body: JSON.stringify(body),
      },
      env,
    );

  it("persists a price change without changing identity, creation time or one-shot state", async () => {
    const response = await request({ price: 68000.25 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "test-alert",
      symbol: "BTCUSDT",
      price: 68000.25,
      enabled: true,
      fired: false,
    });
    expect(db.prepare("SELECT * FROM alerts").get()).toMatchObject({
      id: "test-alert",
      symbol: "BTCUSDT",
      price: 68000.25,
      created_at: 123,
      enabled: 1,
      fired: 0,
      last_sent_at: null,
    });
    const listed = await app.request(
      "https://kantor.test/api/alerts",
      { headers: { Cookie: `kantor_session=${token}` } },
      env,
    );
    expect(
      ((await listed.json()) as { alerts: { price: number }[] }).alerts[0]
        .price,
    ).toBe(68000.25);
  });

  it.each([
    { price: 0 },
    { price: -1 },
    { price: "68000" },
    {},
    { price: 68000, fired: false },
    { price: 68000, symbol: "XAUUSD" },
  ])("rejects invalid payload %j without changing the alert", async (body) => {
    expect((await request(body)).status).toBe(400);
    expect(db.prepare("SELECT price FROM alerts").get()?.price).toBe(67500);
  });

  it.each(["fired", "enabled"])(
    "does not rearm an alert when %s changes before save",
    async (column) => {
      db.exec(
        `UPDATE alerts SET ${column}=${column === "fired" ? 1 : 0},last_sent_at=456`,
      );
      expect((await request({ price: 68000 })).status).toBe(409);
      expect(
        db.prepare("SELECT price,last_sent_at FROM alerts").get(),
      ).toMatchObject({ price: 67500, last_sent_at: 456 });
    },
  );

  it("returns 404 when the alert was deleted while editing", async () => {
    expect((await request({ price: 68000 }, { id: "deleted" })).status).toBe(
      404,
    );
  });

  it("does not fire from an old level read before a concurrent edit", async () => {
    expect((await request({ price: 68000 })).status).toBe(200);
    expect(await claimPriceAlert(env, "test-alert", 67500, 456)).toBe(false);
    expect(
      db.prepare("SELECT price,fired,last_sent_at FROM alerts").get(),
    ).toMatchObject({ price: 68000, fired: 0, last_sent_at: null });
    expect(await claimPriceAlert(env, "test-alert", 68000, 789)).toBe(true);
  });

  it("keeps a fired alert one-shot when the tick wins the race", async () => {
    expect(await claimPriceAlert(env, "test-alert", 67500, 456)).toBe(true);
    expect((await request({ price: 68000 })).status).toBe(409);
    expect(await claimPriceAlert(env, "test-alert", 67500, 789)).toBe(false);
    expect(
      db.prepare("SELECT price,fired,last_sent_at FROM alerts").get(),
    ).toMatchObject({ price: 67500, fired: 1, last_sent_at: 456 });
  });

  it("does not claim a deleted alert for delivery", async () => {
    db.exec("DELETE FROM alerts");
    expect(await claimPriceAlert(env, "test-alert", 67500, 456)).toBe(false);
  });

  it("does not claim an alert disabled after the tick read it", async () => {
    db.exec("UPDATE alerts SET enabled=0");
    expect(await claimPriceAlert(env, "test-alert", 67500, 456)).toBe(false);
    expect(
      db.prepare("SELECT fired,last_sent_at FROM alerts").get(),
    ).toMatchObject({ fired: 0, last_sent_at: null });
  });

  it("requires a private session", async () => {
    expect((await request({ price: 68000 }, { auth: false })).status).toBe(401);
    expect(db.prepare("SELECT price FROM alerts").get()?.price).toBe(67500);
  });

  it("rejects cross-origin edits even with a valid session", async () => {
    expect(
      (await request({ price: 68000 }, { origin: "https://other.test" }))
        .status,
    ).toBe(403);
    expect(db.prepare("SELECT price FROM alerts").get()?.price).toBe(67500);
  });
});
