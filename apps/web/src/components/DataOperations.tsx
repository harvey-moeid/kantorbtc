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
      BTCUSDT: true,
      XAUUSD: false,
    }),
    [toggleBusy, setToggleBusy] = useState<Symbol | null>(null),
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
      setEnabled(data.enabled);
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
  const toggle = async (asset: Symbol) => {
    if (demo || toggleBusy) return;
    setToggleBusy(asset);
    try {
      const result = await api<{ enabled: Record<Symbol, boolean> }>(
        `/backfill/settings/${asset}`,
        { method: "PUT", body: JSON.stringify({ enabled: !enabled[asset] }) },
      );
      setEnabled(result.enabled);
      const data = await api<{ jobs: Job[] }>("/backfill");
      setJobs(data.jobs);
      useStore.getState().notify(
        `Backfill ${asset} ${result.enabled[asset] ? "diaktifkan" : "dijeda"}; histori yang sudah tersimpan tetap aman.`,
      );
    } catch (e) {
      useStore.getState().notify((e as Error).message);
    } finally {
      setToggleBusy(null);
    }
  };
  return (
    <>
      <div className="settings-title">
        <h2>Histori candle & backfill</h2>
        <p>
          Backfill histori terpisah dari update candle terbaru tiap 5 menit.
          Mematikan backfill tidak menghapus candle atau menghentikan scanner.
        </p>
      </div>
      <div className="callout">
        BTCUSDT aktif secara default, XAUUSD nonaktif hingga provider siap.
        Perubahan berlaku per symbol untuk seluruh timeframe. Job pending
        dijeda saat OFF, tanpa kehilangan cursor; job gagal dapat dilanjutkan
        saat ON. Setiap potongan maksimal 300 candle dan satu potongan per 15 menit.
      </div>
      {symbols.map((asset) => (
        <label className="settings-row" key={asset}>
          <div>
            <b>{asset} · Candle backfill</b>
            <p>
              {enabled[asset]
                ? "ON — histori boleh diisi otomatis maupun manual."
                : "OFF — job histori dijeda; candle terbaru tetap diperbarui."}
            </p>
          </div>
          <input
            type="checkbox"
            className="toggle"
            aria-label={`Backfill ${asset}`}
            checked={enabled[asset]}
            onChange={() => void toggle(asset)}
            disabled={demo || toggleBusy !== null}
          />
        </label>
      ))}
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
        disabled={busy || demo || !enabled[symbol]}
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
                      j.status === "pending" && !enabled[j.symbol as Symbol]
                        ? ""
                        : j.status === "complete"
                        ? "green"
                        : j.status === "failed"
                          ? "red"
                          : ""
                    }
                  >
                    {j.status === "pending" && !enabled[j.symbol as Symbol]
                      ? "DIJEDA"
                      : j.status.toUpperCase()}
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
                {j.status === "failed" && enabled[j.symbol as Symbol] && (
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
