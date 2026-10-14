import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { app } from "./index";
import type { Env } from "./env";

describe("environment password login", () => {
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
    env = {
      APP_MODE: "demo",
      ADMIN_PASSWORD: "fixture-password",
      DB: {
        async batch(statements: D1PreparedStatement[]) {
          return Promise.all(statements.map((statement) => statement.run()));
        },
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
  const login = (password: string) =>
    app.request(
      "https://kantor.test/api/auth/login",
      {
        method: "POST",
        headers: {
          Origin: "https://kantor.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      },
      env,
    );
  it("creates an owner and authenticated session without saving the password", async () => {
    const response = await login("fixture-password");
    expect(response.status).toBe(200);
    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(
      db.prepare("SELECT password_hash FROM users").get()?.password_hash,
    ).toBe("env-managed");
    const session = await app.request(
      "https://kantor.test/api/auth/session",
      { headers: { Cookie: cookie.split(";")[0] } },
      env,
    );
    expect(await session.json()).toEqual({ authenticated: true });
  });
  it("uses the current env password even when D1 has an old hash", async () => {
    db.prepare("INSERT INTO users VALUES('owner','old-hash',0)").run();
    expect((await login("fixture-password")).status).toBe(200);
    env.ADMIN_PASSWORD = "replacement-password";
    expect((await login("fixture-password")).status).toBe(401);
    expect((await login("replacement-password")).status).toBe(200);
  });
  it("rejects incorrect passwords without creating users or sessions", async () => {
    expect((await login("wrong")).status).toBe(401);
    expect(db.prepare("SELECT count(*) AS n FROM users").get()?.n).toBe(0);
    expect(db.prepare("SELECT count(*) AS n FROM sessions").get()?.n).toBe(0);
  });
  it("requires the env password even if an owner already exists", async () => {
    db.prepare("INSERT INTO users VALUES('owner','old-hash',0)").run();
    delete env.ADMIN_PASSWORD;
    expect((await login("fixture-password")).status).toBe(503);
  });
  it.each([undefined, "not-hex", "ab".repeat(31)])(
    "reports invalid encryption setup without exposing submitted keys (%s)",
    async (key) => {
      env.ENCRYPTION_KEY = key;
      const response = await login("fixture-password");
      const cookie = response.headers.get("set-cookie")!.split(";")[0];
      const result = await app.request(
        "https://kantor.test/api/settings/api/Gemini",
        {
          method: "PUT",
          headers: {
            Origin: "https://kantor.test",
            Cookie: cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ value: "private-test-key" }),
        },
        env,
      );
      expect(result.status).toBe(503);
      const body = await result.text();
      expect(body).toContain("ENCRYPTION_KEY");
      expect(body).not.toContain("private-test-key");
    },
  );
  it("retains login rate limiting", async () => {
    for (let i = 0; i < 8; i++) expect((await login("wrong")).status).toBe(401);
    expect((await login("fixture-password")).status).toBe(429);
  });
});
