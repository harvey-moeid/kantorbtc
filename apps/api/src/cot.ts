import type {
  CotContext,
  CotReport,
} from "../../../packages/shared/src/domain";
import type { Env } from "./env";
// CFTC Disaggregated Futures Only; COMEX gold, not options-combined or spot volume.
export const cotSource =
  "https://publicreporting.cftc.gov/resource/72hh-3qpy.json";
const day = 86400000;
const interval = 6 * 3600000;
function count(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number")
    throw new Error("Invalid count");
  if (String(value).trim() === "") throw new Error("Empty count");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("Invalid count");
  return n;
}
export function parseCot(rows: unknown, now: number): CotReport[] {
  if (!Array.isArray(rows) || !rows.length || rows.length > 2)
    throw new Error("Invalid reports");
  const reports = rows
    .map((row: Record<string, unknown>) => {
      if (!row || row.cftc_contract_market_code !== "088691")
        throw new Error("Wrong contract");
      const date = String(row.report_date_as_yyyy_mm_dd ?? "");
      if (!/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?)?$/.test(date))
        throw new Error("Invalid report date");
      const reportDate = date.slice(0, 10),
        timestamp = Date.parse(reportDate + "T00:00:00Z");
      if (
        !Number.isFinite(timestamp) ||
        new Date(timestamp).toISOString().slice(0, 10) !== reportDate ||
        timestamp > now
      )
        throw new Error("Invalid report date");
      const long = count(row.m_money_positions_long_all),
        short = count(row.m_money_positions_short_all),
        spreading = count(row.m_money_positions_spread_all),
        openInterest = count(row.open_interest_all);
      if (
        openInterest <= 0 ||
        long + spreading > openInterest ||
        short + spreading > openInterest
      )
        throw new Error("Inconsistent positions");
      return {
        reportDate,
        fetchedAt: now,
        source: cotSource,
        contract: "088691" as const,
        openInterest,
        managedMoney: { long, short, spreading, net: long - short },
        netChange: null as number | null,
      };
    })
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  if (reports.length === 2) {
    if (reports[0].reportDate === reports[1].reportDate)
      throw new Error("Duplicate report");
    // Compare only adjacent weekly reports; missing weeks must not look like weekly change.
    if (
      Date.parse(reports[0].reportDate) - Date.parse(reports[1].reportDate) ===
      7 * day
    )
      reports[0].netChange =
        reports[0].managedMoney.net - reports[1].managedMoney.net;
  }
  return reports;
}
export async function cotContext(
  env: Env,
  now = Date.now(),
): Promise<CotContext> {
  const row = await env.DB.prepare(
    "SELECT value_json FROM cot_reports WHERE fetched_at<=? ORDER BY report_date DESC LIMIT 1",
  )
    .bind(now)
    .first<{ value_json: string }>();
  const sync = await env.DB.prepare(
    "SELECT checked_at,warning FROM cot_sync WHERE id='gold' AND checked_at<=?",
  )
    .bind(now)
    .first<{ checked_at: number; warning: string | null }>();
  const report = row ? (JSON.parse(row.value_json) as CotReport) : null;
  const fresh =
    report &&
    now - Date.parse(report.reportDate + "T00:00:00Z") <= 14 * day &&
    now - report.fetchedAt <= 7 * day;
  return {
    status: report ? (fresh ? "fresh" : "stale") : "unavailable",
    checkedAt: sync?.checked_at ?? null,
    warning:
      sync?.warning ??
      (report && !fresh
        ? "COT stale; excluded from AI analysis."
        : !report
          ? "COT unavailable; no positioning inferred."
          : null),
    report,
  };
}
export async function refreshCot(
  env: Env,
  now = Date.now(),
): Promise<CotContext> {
  if (env.APP_MODE !== "live") return cotContext(env, now);
  // Persisted lease prevents parallel cron/API calls and retry storms after failures.
  const claim = await env.DB.prepare(
    "INSERT INTO cot_sync(id,checked_at,warning) VALUES('gold',?,NULL) ON CONFLICT(id) DO UPDATE SET checked_at=excluded.checked_at WHERE cot_sync.checked_at<=?",
  )
    .bind(now, now - interval)
    .run();
  if (!claim.meta.changes) return cotContext(env, now);
  try {
    const url = new URL(cotSource);
    url.searchParams.set("$where", "cftc_contract_market_code='088691'");
    url.searchParams.set("$order", "report_date_as_yyyy_mm_dd DESC");
    url.searchParams.set("$limit", "2");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok || !response.body) throw new Error("CFTC unavailable");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 65536) throw new Error("Oversized COT response");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const reports = parseCot(JSON.parse(new TextDecoder().decode(bytes)), now);
    await env.DB.batch([
      ...reports.map((report) =>
        env.DB.prepare(
          "INSERT INTO cot_reports(report_date,fetched_at,value_json) VALUES(?,?,?) ON CONFLICT(report_date) DO UPDATE SET fetched_at=excluded.fetched_at,value_json=excluded.value_json WHERE cot_reports.fetched_at<=excluded.fetched_at",
        ).bind(report.reportDate, now, JSON.stringify(report)),
      ),
      env.DB.prepare(
        "UPDATE cot_sync SET warning=NULL WHERE id='gold' AND checked_at=?",
      ).bind(now),
    ]);
  } catch {
    await env.DB.prepare(
      "UPDATE cot_sync SET warning=? WHERE id='gold' AND checked_at=?",
    )
      .bind(
        "CFTC refresh failed; cached data retained. No synthetic positioning.",
        now,
      )
      .run();
  }
  return cotContext(env, now);
}
