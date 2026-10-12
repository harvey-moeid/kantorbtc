// Test-only SQLite adapter: executes the real SQL and models D1 batch rollback.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Env } from "./env";
export function testDatabase(migrations = ["0001_initial.sql"]) {
  const db = new DatabaseSync(":memory:");
  for (const name of migrations)
    db.exec(
      readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"),
    );
  const env = {
    APP_MODE: "demo",
    DB: {
      prepare(sql: string) {
        const stmt = db.prepare(sql);
        let args: (string | number | null)[] = [];
        return {
          bind(...values: typeof args) {
            args = values;
            return this;
          },
          async first() {
            return stmt.get(...args) ?? null;
          },
          async all() {
            return { results: stmt.all(...args) };
          },
          async run() {
            const result = stmt.run(...args);
            return { meta: { changes: Number(result.changes) } };
          },
        };
      },
      async batch(statements: { run(): Promise<unknown> }[]) {
        db.exec("BEGIN");
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
  return { db, env };
}
