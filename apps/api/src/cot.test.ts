import { afterEach, describe, expect, it, vi } from "vitest";
import { cotContext, parseCot, refreshCot } from "./cot";
import { testDatabase } from "./test-database";
import { app } from "./index";
import { hashToken } from "./security";
const now = Date.parse("2026-10-12T12:00:00Z");
const row = (date = "2026-10-06T00:00:00.000", long = "100") => ({
  report_date_as_yyyy_mm_dd: date,
  cftc_contract_market_code: "088691",
  open_interest_all: "1000",
  m_money_positions_long_all: long,
  m_money_positions_short_all: "40",
  m_money_positions_spread_all: "20",
});
const database = () => testDatabase(["0001_initial.sql", "0009_cot.sql"]);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("CFTC gold weekly context", () => {
  it("normalizes contracts, negative net and weekly changes in date order", () => {
    const reports = parseCot(
      [row("2026-09-29", "90"), row("2026-10-06", "20")],
      now,
    );
    expect(reports[0]).toMatchObject({
      reportDate: "2026-10-06",
      managedMoney: { net: -20 },
      netChange: -70,
      contract: "088691",
      fetchedAt: now,
    });
  });
  it("does not infer a weekly change across missing reports", () => {
    expect(parseCot([row(), row("2026-09-22")], now)[0].netChange).toBeNull();
  });
  it.each([
    { ...row(), cftc_contract_market_code: "088692" },
    { ...row(), m_money_positions_long_all: "" },
    { ...row(), m_money_positions_short_all: "-1" },
    { ...row(), open_interest_all: "10" },
    { ...row(), report_date_as_yyyy_mm_dd: "2026-02-30" },
    row("2026-10-13"),
    { ...row(), m_money_positions_spread_all: "1.1" },
  ])("rejects malformed/future/non-gold/inconsistent records", (value) => {
    expect(() => parseCot([value], now)).toThrow();
  });
  it("rejects empty, duplicate or oversized report lists", () => {
    for (const rows of [[], [row(), row()], [row(), row(), row()]])
      expect(() => parseCot(rows, now)).toThrow();
  });
  it("persists source data and uses an atomic cooldown across concurrent refreshes", async () => {
    const { env, db } = database();
    env.APP_MODE = "live";
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json([row(), row("2026-09-29")]));
    vi.stubGlobal("fetch", fetcher);
    await Promise.all([refreshCot(env, now), refreshCot(env, now)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain("%24limit=2");
    expect(await cotContext(env, now)).toMatchObject({
      status: "fresh",
      report: { managedMoney: { net: 60 }, netChange: 0 },
      warning: null,
    });
    expect(db.prepare("SELECT count(*) n FROM cot_reports").get()).toEqual({
      n: 2,
    });
    db.close();
  });
  it("retains cache on HTTP and validation failure and throttles retries", async () => {
    const { env, db } = database();
    env.APP_MODE = "live";
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([row()]))
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(Response.json([row("2026-10-20")]));
    vi.stubGlobal("fetch", fetcher);
    await refreshCot(env, now);
    const failed = await refreshCot(env, now + 6 * 3600000);
    expect(failed).toMatchObject({
      status: "fresh",
      report: { fetchedAt: now },
      warning: expect.stringContaining("failed"),
    });
    await refreshCot(env, now + 6 * 3600000 + 1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await refreshCot(env, now + 12 * 3600000)).report?.fetchedAt).toBe(
      now,
    );
    db.close();
  });
  it("marks reports stale by age or last successful retrieval and excludes future retrievals", async () => {
    const { env, db } = database();
    env.APP_MODE = "live";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([row()])));
    await refreshCot(env, now);
    expect((await cotContext(env, now - 1)).status).toBe("unavailable");
    expect((await cotContext(env, now + 8 * 86400000)).status).toBe("stale");
    db.close();
  });
  it("does not fetch real positioning in demo mode", async () => {
    const { env, db } = database();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await refreshCot(env, now)).toMatchObject({
      status: "unavailable",
      report: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
    db.close();
  });
  it("bounds responses and reports failure without storing partial data", async () => {
    const { env, db } = database();
    env.APP_MODE = "live";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("x".repeat(65537))),
    );
    expect(await refreshCot(env, now)).toMatchObject({
      status: "unavailable",
      warning: expect.stringContaining("failed"),
    });
    expect(db.prepare("SELECT count(*) n FROM cot_reports").get()).toEqual({
      n: 0,
    });
    db.close();
  });
  it("requires authentication to read COT", async () => {
    const { env, db } = database();
    expect(
      (await app.request("https://kantor.test/api/market/XAUUSD/cot", {}, env))
        .status,
    ).toBe(401);
    db.close();
  });
});

it("marks an old position date stale even immediately after successful retrieval", async () => {
  const { env, db } = database();
  env.APP_MODE = "live";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json([row("2026-09-22")])),
  );
  expect(await refreshCot(env, now)).toMatchObject({
    status: "stale",
    report: { fetchedAt: now },
    warning: expect.stringContaining("stale"),
  });
  db.close();
});
it("returns persisted COT to authenticated visitors without fetching a provider", async () => {
  const { env, db } = database();
  const token = "c".repeat(64);
  db.prepare("INSERT INTO users VALUES('owner','fixture',0)").run();
  db.prepare("INSERT INTO sessions VALUES(?,'owner',?)").run(
    await hashToken(token),
    Date.now() + 60000,
  );
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const response = await app.request(
    "https://kantor.test/api/market/XAUUSD/cot",
    { headers: { Cookie: `kantor_session=${token}` } },
    env,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    status: "unavailable",
    report: null,
  });
  expect(fetcher).not.toHaveBeenCalled();
  db.close();
});
