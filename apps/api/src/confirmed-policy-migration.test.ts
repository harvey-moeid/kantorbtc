import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { testDatabase } from "./test-database";
import { defaultSettings } from "../../../packages/shared/src/domain";
const migration = readFileSync(
  new URL("../migrations/0008_confirmed_tie_margin.sql", import.meta.url),
  "utf8",
);
describe("confirmed scanner margin migration", () => {
  it("fills a null margin with 40 and audits the old and new settings", () => {
    const { db } = testDatabase();
    try {
      db.prepare("INSERT INTO settings VALUES('scanner',?,3,0)").run(
        JSON.stringify({ ...defaultSettings, tieMargin: null }),
      );
      db.exec(migration);
      const settings = db
        .prepare("SELECT value_json,version FROM settings")
        .get()!;
      expect(JSON.parse(settings.value_json as string).tieMargin).toBe(40);
      expect(settings.version).toBe(4);
      const audit = db
        .prepare("SELECT old_json,new_json,version FROM settings_audit")
        .get()!;
      expect(JSON.parse(audit.old_json as string).tieMargin).toBeNull();
      expect(JSON.parse(audit.new_json as string).tieMargin).toBe(40);
      expect(audit.version).toBe(4);
    } finally {
      db.close();
    }
  });
  it("preserves a numeric admin override and avoids unsolicited rows on a fresh database", () => {
    const { db } = testDatabase();
    try {
      db.exec(migration);
      expect(db.prepare("SELECT count(*) AS n FROM settings").get()?.n).toBe(0);
      db.prepare("INSERT INTO settings VALUES('scanner',?,3,0)").run(
        JSON.stringify({ ...defaultSettings, tieMargin: 75 }),
      );
      db.exec(migration);
      expect(
        JSON.parse(
          db.prepare("SELECT value_json FROM settings").get()!
            .value_json as string,
        ).tieMargin,
      ).toBe(75);
      expect(
        db.prepare("SELECT count(*) AS n FROM settings_audit").get()?.n,
      ).toBe(0);
    } finally {
      db.close();
    }
  });
});
