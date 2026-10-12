import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "./index";
import { testDatabase } from "./test-database";
import { hashToken } from "./security";
let fixture: ReturnType<typeof testDatabase>;
const token = "c".repeat(64);
beforeEach(async () => {
  fixture = testDatabase();
  fixture.db.prepare("INSERT INTO users VALUES('owner','fixture',0)").run();
  fixture.db
    .prepare("INSERT INTO sessions VALUES(?,'owner',?)")
    .run(await hashToken(token), Date.now() + 60000);
  fixture.db
    .prepare(
      "INSERT INTO signals VALUES('signal','BTCUSDT','H1','aktif',0,'{}')",
    )
    .run();
  for (const [id, at] of [
    ["a", 100],
    ["b", 100],
    ["c", 200],
  ] as const)
    fixture.db
      .prepare(
        "INSERT INTO signal_events VALUES(?,'signal','entry_clock',NULL,?,?)",
      )
      .run(id, at, JSON.stringify({ to: "unknown", remainingMs: 1000 }));
});
afterEach(() => fixture.db.close());
const request = (query = "", auth = true, id = "signal") =>
  app.request(
    `https://kantor.test/api/signals/${id}/events${query}`,
    { headers: auth ? { Cookie: `kantor_session=${token}` } : {} },
    fixture.env,
  );
describe("private signal-event audit", () => {
  it("does not disclose events to public visitors", async () =>
    expect((await request("", false)).status).toBe(401));
  it("returns ordered, parsed audit events with an honest null price", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      events: { id: string; price: number | null; details: unknown }[];
      nextCursor: unknown;
    };
    expect(data.events.map((event) => event.id)).toEqual(["c", "b", "a"]);
    expect(data.events[0]).toMatchObject({
      price: null,
      details: { to: "unknown", remainingMs: 1000 },
    });
    expect(data.nextCursor).toBeNull();
  });
  it("paginates equal timestamps without dropping or duplicating events", async () => {
    const first = (await (await request("?limit=2")).json()) as {
      events: { id: string }[];
      nextCursor: { at: number; id: string };
    };
    expect(first.events.map((event) => event.id)).toEqual(["c", "b"]);
    expect(first.nextCursor).toEqual({ at: 100, id: "b" });
    const second = (await (
      await request("?limit=2&cursorAt=100&cursorId=b")
    ).json()) as { events: { id: string }[]; nextCursor: unknown };
    expect(second.events.map((event) => event.id)).toEqual(["a"]);
    expect(second.nextCursor).toBeNull();
  });
  it("rejects invalid IDs, partial cursors and unbounded limits", async () => {
    for (const query of [
      "?limit=0",
      "?limit=201",
      "?cursorAt=100",
      "?cursorId=b",
      "?cursorAt=-1&cursorId=b",
    ])
      expect((await request(query)).status).toBe(400);
    expect((await request("", true, "bad.id")).status).toBe(400);
    expect((await request("", true, "missing")).status).toBe(404);
  });
  it("returns an empty audited history without fabricating example events", async () => {
    fixture.db.prepare("DELETE FROM signal_events").run();
    expect(await (await request()).json()).toEqual({
      events: [],
      nextCursor: null,
    });
  });
});
