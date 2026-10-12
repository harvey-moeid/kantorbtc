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
  kind?: "initial" | "manual" | "recovery";
}
export default function DataOperations() {
  const demo = useStore((s) => s.demo),
    language = useStore((s) => s.settings.language),
    [jobs, setJobs] = useState<Job[]>([]),
    [symbol, setSymbol] = useState<Symbol>("BTCUSDT"),
    [from, setFrom] = useState("2025-10-11"),
    [to, setTo] = useState("2026-10-11"),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (demo) return;
    let active = true;
    const load = () =>
      api<{ jobs: Job[] }>("/backfill")
        .then((d) => {
          if (active) setJobs(d.jobs);
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
  const start = async () => {
    setBusy(true);
    try {
      if (demo) throw new Error("Backfill hanya berjalan di backend live.");
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
          Pengisian awal satu tahun, lalu upsert tiap 5 menit tanpa menghapus
          candle lama.
        </p>
      </div>
      <div className="callout">
        Mode live membuat job awal otomatis untuk dua aset dan lima timeframe.
        Tiap potongan maksimal 300 candle, satu potongan per alarm. Riwayat
        penuh bergantung provider dan paket akun; job gagal dapat dilanjutkan
        dari cursor terakhir.
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
        disabled={busy || demo}
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
                  {j.kind === "recovery" && (
                    <Badge>
                      {language === "id" ? "PEMULIHAN GAP" : "GAP RECOVERY"}
                    </Badge>
                  )}
                  <Badge
                    tone={
                      j.status === "complete"
                        ? "green"
                        : j.status === "failed"
                          ? "red"
                          : ""
                    }
                  >
                    {j.status.toUpperCase()}
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
