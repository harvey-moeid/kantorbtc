import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { app } from "./index";
import type { Env } from "./env";
import { defaultSlots } from "../../../packages/shared/src/ai-config";
import { hashToken } from "./security";
let db: DatabaseSync;
let env: Env;
const token = "b".repeat(64);
beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  db.prepare("INSERT INTO users VALUES('owner','fixture',0)").run();
  db.prepare("INSERT INTO sessions VALUES(?,'owner',?)").run(
    await hashToken(token),
    Date.now() + 60000,
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
          async all() {
            return { results: stmt.all(...values) };
          },
        };
      },
      async batch(stmts: { run(): Promise<unknown> }[]) {
        const results = [];
        for (const stmt of stmts) results.push(await stmt.run());
        return results;
      },
    },
  } as unknown as Env;
});
afterEach(() => db.close());
function request(body?: unknown, auth = true, origin = "https://kantor.test") {
  return app.request(
    "https://kantor.test/api/settings/ai",
    {
      method: body ? "PUT" : "GET",
      headers: {
        ...(auth ? { Cookie: `kantor_session=${token}` } : {}),
        Origin: origin,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    env,
  );
}
describe("private AI fallback settings", () => {
  it("requires a private session for reads and updates", async () => {
    expect((await request(undefined, false)).status).toBe(401);
    expect((await request({ slots: defaultSlots }, false)).status).toBe(401);
  });
  it("rejects cross-origin mutations", async () =>
    expect(
      (await request({ slots: defaultSlots }, true, "https://another.test"))
        .status,
    ).toBe(403));
  it("stores an ordered fallback list and a versioned audit, then reads it back", async () => {
    const slots = structuredClone(defaultSlots);
    slots[0].fallbacks = [
      { provider: "Groq", model: "backup-1" },
      { provider: "Mistral", model: "backup-2" },
    ];
    expect((await request({ slots })).status).toBe(200);
    expect(await (await request()).json()).toEqual({ slots });
    const audit = db.prepare("SELECT * FROM settings_audit").get()!;
    expect(audit.category).toBe("ai");
    expect(audit.version).toBe(1);
    expect(JSON.parse(audit.new_json as string)).toEqual(slots);
  });
  it("supports old configurations without resetting their models", async () => {
    const old = defaultSlots.map(({ fallbacks: _, ...slot }) => slot);
    db.prepare("INSERT INTO settings VALUES('ai',?,4,0)").run(
      JSON.stringify(old),
    );
    expect(await (await request()).json()).toEqual({ slots: defaultSlots });
  });
  it("rejects invalid fallback settings without writes or audit changes", async () => {
    const slots = structuredClone(defaultSlots);
    slots[0].fallbacks = [{ provider: "Workers AI", model: slots[0].model }];
    expect((await request({ slots })).status).toBe(400);
    expect(db.prepare("SELECT count(*) AS n FROM settings").get()?.n).toBe(0);
    expect(
      db.prepare("SELECT count(*) AS n FROM settings_audit").get()?.n,
    ).toBe(0);
  });
  it("returns honest candle sources, crypto gaps and pending recovery counts", async () => {
    for (const file of ["0002_backfill.sql", "0007_backfill_recovery.sql"])
      db.exec(
        readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"),
      );
    db.prepare(
      "INSERT INTO candles VALUES('BTCUSDT','5m',300,100,110,90,105,10,'OKX')",
    ).run();
    db.prepare(
      "INSERT INTO candles VALUES('BTCUSDT','5m',900,100,110,90,105,10,'Binance')",
    ).run();
    db.prepare(
      "INSERT INTO backfill_jobs(id,symbol,tf,from_time,to_time,cursor_time,updated_at,kind) VALUES('gap','BTCUSDT','5m',600,900,900,0,'recovery')",
    ).run();
    const response = await app.request(
      "https://kantor.test/api/market/BTCUSDT/candles?tf=5m",
      { headers: { Cookie: `kantor_session=${token}` } },
      env,
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      candles: { time: number }[];
      health: unknown;
    };
    expect(data.candles.map((c) => c.time)).toEqual([300, 900]);
    expect(data.health).toEqual({
      sources: ["OKX", "Binance"],
      lastClosedAt: 900,
      gapCount: 1,
      recoveryJobs: 1,
    });
  });
  it("does not classify gold session breaks as missing candles", async () => {
    for (const file of ["0002_backfill.sql", "0007_backfill_recovery.sql"])
      db.exec(
        readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"),
      );
    for (const time of [300, 900])
      db.prepare(
        "INSERT INTO candles VALUES('XAUUSD','5m',?,100,110,90,105,10,'OANDA')",
      ).run(time);
    const response = await app.request(
      "https://kantor.test/api/market/XAUUSD/candles?tf=5m",
      { headers: { Cookie: `kantor_session=${token}` } },
      env,
    );
    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { health: { gapCount: number | null } })
        .health.gapCount,
    ).toBeNull();
  });
});
