import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  defaultSettings,
  timeframes,
} from "../../../packages/shared/src/domain";
import { makeSignal } from "../../../packages/shared/src/engine";
import { demoScanner, demoVotes } from "../../../packages/shared/src/demo";
const initial = readFileSync(
  new URL("../migrations/0001_initial.sql", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../migrations/0006_confirmed_signal_ttl.sql", import.meta.url),
  "utf8",
);
describe("confirmed option A signal lifetime", () => {
  it("sets exactly the confirmed duration on every new signal", () => {
    const durations = [900, 2700, 10800, 43200, 259200];
    timeframes.forEach((tf, i) =>
      expect(
        makeSignal(
          "BTCUSDT",
          tf,
          demoVotes,
          demoScanner,
          defaultSettings,
          "OKX",
          1000,
        )?.expiresAt,
      ).toBe(1000 + durations[i] * 1000),
    );
  });
  it("fills old null settings, preserves numeric overrides and audits the new version", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(initial);
      const old = {
        ...defaultSettings,
        ttl: { "5m": null, "15m": 7200, H1: null, H4: null, D1: null },
      };
      db.prepare("INSERT INTO settings VALUES('scanner',?,7,1000)").run(
        JSON.stringify(old),
      );
      db.exec(migration);
      const row = db
        .prepare("SELECT * FROM settings WHERE id='scanner'")
        .get()!;
      expect(JSON.parse(row.value_json as string).ttl).toEqual({
        "5m": 900,
        "15m": 7200,
        H1: 10800,
        H4: 43200,
        D1: 259200,
      });
      expect(row.version).toBe(8);
      const audit = db.prepare("SELECT * FROM settings_audit").get()!;
      expect(JSON.parse(audit.old_json as string)).toEqual(old);
      expect(audit.new_json).toBe(row.value_json);
      expect(audit.version).toBe(8);
    } finally {
      db.close();
    }
  });
  it("leaves fully configured settings and existing signal expiry untouched", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(initial);
      db.prepare("INSERT INTO settings VALUES('scanner',?,7,1000)").run(
        JSON.stringify(defaultSettings),
      );
      db.prepare(
        "INSERT INTO signals VALUES('old','BTCUSDT','H1','aktif',0,?)",
      ).run(JSON.stringify({ expiresAt: 12345 }));
      db.exec(migration);
      expect(db.prepare("SELECT version FROM settings").get()?.version).toBe(7);
      expect(
        db.prepare("SELECT count(*) AS n FROM settings_audit").get()?.n,
      ).toBe(0);
      expect(
        JSON.parse(
          db.prepare("SELECT value_json FROM signals").get()!
            .value_json as string,
        ).expiresAt,
      ).toBe(12345);
    } finally {
      db.close();
    }
  });
  it("supports a fresh database without inserting unsolicited scanner settings", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(initial);
      db.exec(migration);
      expect(db.prepare("SELECT count(*) AS n FROM settings").get()?.n).toBe(0);
    } finally {
      db.close();
    }
  });
});
