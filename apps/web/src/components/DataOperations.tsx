import { useEffect, useState } from "react";
import { Database, Play, RefreshCw } from "lucide-react";
import { symbols, type Symbol } from "../../../../packages/shared/src/domain";
import { api, useStore } from "../store";
import { Badge } from "./UI";
import { dateTime } from "../i18n";
interface Job {
  id: string;
  symbol: string;
  tf: string;
  from_time: number;
  to_time: number;
  cursor_time: number;
  status: string;
  rows_saved: number;
  error: string | null;
  updated_at: number;
}
export default function DataOperations() {
  const demo = useStore((s) => s.demo),
    [jobs, setJobs] = useState<Job[]>([]),
    [enabled, setEnabled] = useState<Record<Symbol, boolean>>({
      BTCUSDT: false,
      XAUUSD: false,
    }),
    [loaded, setLoaded] = useState(false),
    [savingSymbol, setSavingSymbol] = useState<Symbol | null>(null),
    [symbol, setSymbol] = useState<Symbol>("BTCUSDT"),
    [from, setFrom] = useState("2025-10-11"),
    [to, setTo] = useState("2026-10-11"),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (demo) return;
    let active = true;
    const load = () =>
      api<{ jobs: Job[]; enabled: Record<Symbol, boolean> }>("/backfill")
        .then((d) => {
          if (active) {
            setJobs(d.jobs);
            setEnabled(d.enabled);
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (active) useStore.getState().notify(e.message);
        });
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [demo]);
  const toggleBackfill = async (target: Symbol, next: boolean) => {
    setSavingSymbol(target);
    try {
      if (demo) throw new Error("Backfill hanya dapat diatur di backend live.");
      await api(`/backfill/${target}/enabled`, {
        method: "PUT",
        body: JSON.stringify({ enabled: next }),
      });
      setEnabled((prev) => ({ ...prev, [target]: next }));
      useStore.getState().notify(
        `Backfill ${target} ${next ? "ON: job yang tertunda bisa berlanjut." : "OFF: histori berhenti tanpa menghapus candle."}`,
      );
    } catch (error) {
      useStore.getState().notify((error as Error).message);
    } finally {
      setSavingSymbol(null);
    }
  };
  const start = async () => {
    setBusy(true);
    try {
      if (demo) throw new Error("Backfill hanya berjalan di backend live.");
      if (!enabled[symbol]) throw new Error(`Backfill ${symbol} masih OFF.`);
      await api("/backfill", {
        method: "POST",
        body: JSON.stringify({
          symbol,
          from: Date.parse(from + "T00:00:00Z") / 1000,
          to: Date.parse(to + "T00:00:00Z") / 1000,
        }),
      });
      const data = await api<{ jobs: Job[] }>("/backfill");
      setJobs(data.jobs);
      useStore
        .getState()
        .notify(
          "Lima job timeframe dibuat. Progres tersimpan dan dapat dilanjutkan.",
        );
    } catch (e) {
      useStore.getState().notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="settings-title">
        <h2>Histori candle & backfill</h2>
        <p>
          Histori candle per simbol dengan kontrol backfill independen. Candle
          live tetap berjalan saat backfill OFF.
        </p>
      </div>
      <div className="callout">
        Backfill historis default OFF untuk menghemat kuota D1. Mengaktifkan
        simbol akan melanjutkan job pending dari cursor terakhir; mematikan
        simbol menunda histori saja, bukan scanner dan candle live. Pemrosesan
        maksimal satu potongan historis per 15 menit untuk semua simbol.
      </div>
      <h3>Aktifkan backfill per simbol</h3>
      <div className="backfill-toggles">
        {symbols.map((target) => (
          <label className="settings-row" key={target}>
            <div>
              <b>{target}</b>
              <p>{enabled[target] ? "ON · histori diproses bertahap" : "OFF · job histori dijeda"}</p>
            </div>
            <input
              className="toggle"
              type="checkbox"
              aria-label={`Backfill histori ${target}`}
              checked={enabled[target]}
              disabled={demo || !loaded || savingSymbol !== null}
              onChange={(e) => void toggleBackfill(target, e.target.checked)}
            />
          </label>
        ))}
      </div>
      <div className="backfill-form">
        <label className="form-field">
          Aset
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value as Symbol)}
          >
            {symbols.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="form-field">
          Dari (UTC)
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="form-field">
          Sampai (UTC)
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <button
        className="button primary"
        disabled={busy || demo || !loaded || !enabled[symbol]}
        onClick={start}
      >
        <Play size={15} />
        {busy ? "Menyiapkan…" : "Backfill rentang ini"}
      </button>
      <h3>Progres tersimpan</h3>
      {jobs.length ? (
        <div className="backfill-jobs">
          {jobs.map((j) => {
            const progress = Math.max(
              0,
              Math.min(
                100,
                ((j.to_time - j.cursor_time) / (j.to_time - j.from_time)) * 100,
              ),
            );
            return (
              <div key={j.id}>
                <div>
                  <b>
                    {j.symbol} / {j.tf}
                  </b>
                  <Badge
                    tone={
                      j.status === "complete"
                        ? "green"
                        : j.status === "failed"
                          ? "red"
                          : ""
                    }
                  >
                    {j.status === "pending" && !enabled[j.symbol as Symbol] ? "JEDA" : j.status.toUpperCase()}
                  </Badge>
                </div>
                <div className="backfill-track">
                  <i style={{ width: `${progress}%` }} />
                </div>
                <small>
                  {j.rows_saved.toLocaleString()} candle disimpan ·{" "}
                  {progress.toFixed(1)}% · {dateTime(j.updated_at)} WIB
                </small>
                {j.error && <p>{j.error}</p>}
                {j.status === "failed" && (
                  <button
                    className="text-button"
                    disabled={demo || !enabled[j.symbol as Symbol]}
                    onClick={async () => {
                      try {
                        await api(`/backfill/${j.id}/resume`, {
                          method: "POST",
                        });
                        useStore
                          .getState()
                          .notify("Job dilanjutkan dari cursor terakhir.");
                      } catch (e) {
                        useStore.getState().notify((e as Error).message);
                      }
                    }}
                  >
                    <RefreshCw size={13} />
                    Lanjutkan
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <Database size={25} />
          <p>
            {demo
              ? "Tidak ada job backfill dalam demo."
              : "Job backfill belum dibuat."}
          </p>
        </div>
      )}
    </>
  );
}
