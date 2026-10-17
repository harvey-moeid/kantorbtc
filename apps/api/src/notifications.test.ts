import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Env } from "./env";
import { claimPriceAlert } from "./notifications";

describe("atomic price alert delivery", () => {
  let db: DatabaseSync;
  let env: Env;
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec(
      readFileSync(
        new URL("../migrations/0001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    db.exec(
      "INSERT INTO alerts(id,symbol,price,created_at) VALUES('price-alert','BTCUSDT',100,1)",
    );
    env = {
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
            async run() {
              return {
                meta: { changes: Number(statement.run(...values).changes) },
              };
            },
          };
        },
        // Model D1's documented transactional batch semantics using real SQL.
        async batch(statements: D1PreparedStatement[]) {
          db.exec("BEGIN IMMEDIATE");
          try {
            const results = [];
            for (const statement of statements)
              results.push(await statement.run());
            db.exec("COMMIT");
            return results;
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
        },
      },
    } as unknown as Env;
  });
  afterEach(() => db.close());
  const claim = (content: string | undefined = "Crossing 100") =>
    claimPriceAlert(env, "price-alert", 100, 1234, content);
  const outbox = () => db.prepare("SELECT * FROM alert_outbox").all();

  it("commits the one-shot state and exactly one durable notification", async () => {
    expect(await claim()).toBe(true);
    expect(await claim("duplicate")).toBe(false);
    expect(
      db.prepare("SELECT fired,last_sent_at FROM alerts").get(),
    ).toMatchObject({ fired: 1, last_sent_at: 1234 });
    expect(outbox()).toMatchObject([
      { id: "price-price-alert", content: "Crossing 100", status: "pending" },
    ]);
  });
  it.each([
    "UPDATE alerts SET price=101",
    "UPDATE alerts SET enabled=0",
    "DELETE FROM alerts",
  ])("does not queue a stale tick after %s", async (sql) => {
    db.exec(sql);
    expect(await claim()).toBe(false);
    expect(outbox()).toEqual([]);
  });
  it("keeps the alert eligible for retry when the outbox insert fails", async () => {
    db.exec(
      "CREATE TRIGGER fail_outbox BEFORE INSERT ON alert_outbox BEGIN SELECT RAISE(ABORT,'database unavailable'); END",
    );
    await expect(claim()).rejects.toThrow("database unavailable");
    expect(
      db.prepare("SELECT fired,last_sent_at FROM alerts").get(),
    ).toMatchObject({ fired: 0, last_sent_at: null });
    expect(outbox()).toEqual([]);
    db.exec("DROP TRIGGER fail_outbox");
    expect(await claim()).toBe(true);
  });
  it("rolls back the outbox insertion if the following claim fails", async () => {
    db.exec(
      "CREATE TRIGGER fail_claim BEFORE UPDATE ON alerts BEGIN SELECT RAISE(ABORT,'claim failed'); END",
    );
    await expect(claim()).rejects.toThrow("claim failed");
    expect(outbox()).toEqual([]);
    expect(db.prepare("SELECT fired FROM alerts").get()?.fired).toBe(0);
  });
  it("still records a one-shot crossing when Discord is disabled", async () => {
    expect(await claimPriceAlert(env, "price-alert", 100, 1234)).toBe(true);
    expect(outbox()).toEqual([]);
  });
});
