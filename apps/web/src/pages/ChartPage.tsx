import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDownLeft,
  Bell,
  Bitcoin,
  Layers,
  Plus,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import {
  symbols,
  timeframes,
  type Candle,
  type Symbol,
  type Timeframe,
} from "../../../../packages/shared/src/domain";
import { applyQuote } from "../../../../packages/shared/src/realtime";
import { demoCandles } from "../../../../packages/shared/src/demo";
import { api, useStore } from "../store";
import { price, useT } from "../i18n";
import { Badge, Modal } from "../components/UI";
import { SignalRows } from "../components/SignalRows";
const MarketChart = lazy(() => import("../components/Chart"));
export default function ChartPage() {
  const { symbol: raw } = useParams(),
    symbol = raw?.toUpperCase() as Symbol,
    navigate = useNavigate(),
    demo = useStore((s) => s.demo),
    quotes = useStore((s) => s.quotes),
    signals = useStore((s) => s.signals),
    [tf, setTf] = useState<Timeframe>("H1"),
    [candles, setCandles] = useState<Candle[]>([]),
    [error, setError] = useState(""),
    [indicators, setIndicators] = useState(["EMA", "Volume", "Sinyal"]),
    [alertOpen, setAlertOpen] = useState(false),
    [alertPrice, setAlertPrice] = useState(""),
    [placing, setPlacing] = useState(false),
    [saving, setSaving] = useState(false),
    alerts = useStore((s) => s.alerts),
    t = useT(),
    currentQuotes = useRef(quotes);
  currentQuotes.current = quotes;
  useEffect(() => {
    if (!symbols.includes(symbol)) return;
    setError("");
    setCandles([]);
    if (demo) {
      setCandles(demoCandles(symbol, tf));
      return;
    }
    let alive = true;
    const load = () =>
      api<{ candles: Candle[] }>(`/market/${symbol}/candles?tf=${tf}&limit=300`)
        .then((d) => {
          if (alive) {
            setError("");
            setCandles(
              applyQuote(
                d.candles,
                currentQuotes.current.find((q) => q.symbol === symbol),
                tf,
                Date.now(),
              ),
            );
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    void load();
    const id = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbol, tf, demo]);
  const chosen = useMemo(
      () => signals.filter((s) => s.symbol === symbol && s.tf === tf),
      [signals, symbol, tf],
    ),
    quote = quotes.find((q) => q.symbol === symbol);
  useEffect(() => {
    if (!demo)
      setCandles((previous) => applyQuote(previous, quote, tf, Date.now()));
  }, [quote?.price, quote?.at, quote?.status, demo, tf]);
  const onPrice = useCallback(
    (p: number) => {
      if (placing) {
        setAlertPrice(p.toFixed(2));
        setAlertOpen(true);
        setPlacing(false);
      }
    },
    [placing],
  );
  if (!symbols.includes(symbol))
    return <Navigate to="/chart/btcusdt" replace />;
  const add = async () => {
    const p = Number(alertPrice);
    if (!Number.isFinite(p) || p <= 0) {
      useStore.getState().notify("Masukkan harga yang valid.");
      return;
    }
    setSaving(true);
    try {
      await useStore.getState().addAlert({ symbol, price: p });
      setAlertOpen(false);
    } catch (e) {
      useStore.getState().notify((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <div className="chart-heading">
        <button className="text-button" onClick={() => navigate("/office")}>
          <ArrowDownLeft size={16} />
          {t.back}
        </button>
        <div className="asset-switch">
          {symbols.map((s) => (
            <button
              className={s === symbol ? "active" : ""}
              onClick={() => navigate(`/chart/${s.toLowerCase()}`)}
              key={s}
            >
              {s === "BTCUSDT" ? <Bitcoin size={17} /> : <Layers size={17} />}{" "}
              {s}
            </button>
          ))}
        </div>
      </div>
      <section className="panel chart-panel">
        <div className="chart-summary">
          <span className={`asset-icon ${symbol === "XAUUSD" ? "gold" : ""}`}>
            {symbol === "BTCUSDT" ? (
              <Bitcoin size={24} />
            ) : (
              <Layers size={24} />
            )}
          </span>
          <div>
            <h1>
              {symbol === "BTCUSDT" ? "Bitcoin" : "Gold / US Dollar"}{" "}
              <small>{symbol}</small>
            </h1>
            <p>
              {quote?.source || "Sumber belum terhubung"}{" "}
              <Badge tone="amber">
                {demo ? "DEMO DATA" : quote?.status || "OFFLINE"}
              </Badge>
            </p>
          </div>
          <div className="chart-price">
            <b>{quote ? `$${price(quote.price)}` : "—"}</b>
            <span className={quote && quote.change < 0 ? "down" : "up"}>
              {quote ? `${quote.change > 0 ? "+" : ""}${quote.change}%` : ""}
            </span>
          </div>
        </div>
        <div className="chart-toolbar">
          <div className="tabs">
            {timeframes.map((f) => (
              <button
                className={tf === f ? "active" : ""}
                onClick={() => setTf(f)}
                key={f}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="indicator-toggles">
            {["EMA", "BB", "RSI", "MACD", "ATR", "Volume", "SMC", "Sinyal"].map(
              (i) => (
                <button
                  className={indicators.includes(i) ? "active" : ""}
                  onClick={() =>
                    setIndicators(
                      indicators.includes(i)
                        ? indicators.filter((j) => j !== i)
                        : [...indicators, i],
                    )
                  }
                  key={i}
                >
                  {i}
                </button>
              ),
            )}
          </div>
          <button
            className={`button secondary small ${placing ? "active" : ""}`}
            onClick={() => setPlacing(!placing)}
          >
            <Plus size={14} /> Alert harga
          </button>
        </div>
        {placing && (
          <div className="info-strip">
            Klik chart untuk memilih harga alert.{" "}
            <button className="text-button" onClick={() => setPlacing(false)}>
              Batal
            </button>
          </div>
        )}
        {error ? (
          <div className="empty-state">
            <Wifi size={25} />
            <p>{error}</p>
          </div>
        ) : candles.length ? (
          <Suspense fallback={<div className="empty-state">Memuat chart…</div>}>
            <MarketChart
              key={`${symbol}-${tf}`}
              candles={candles}
              indicators={indicators}
              signals={chosen}
              onPrice={onPrice}
            />
          </Suspense>
        ) : (
          <div className="empty-state tall">
            {demo
              ? "Memuat candle…"
              : "Candle belum tersedia. Hubungkan sumber data di Pengaturan → API."}
          </div>
        )}
        <div className="chart-footer">
          <span>
            {candles.length} candle ·{" "}
            {demo ? "fixture deterministik" : "historis D1 / provider"} · {tf}
          </span>
          <span>Zoom, geser, dan crosshair tersedia</span>
        </div>
      </section>
      <div className="bottom-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <Zap size={16} />
              <h2>Sinyal {symbol}</h2>
            </div>
          </div>
          <SignalRows symbol={symbol} compact />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <Bell size={16} />
              <h2>Alert harga</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Tambah alert"
              onClick={() => {
                setAlertPrice(String(quote?.price || ""));
                setAlertOpen(true);
              }}
            >
              <Plus size={17} />
            </button>
          </div>
          {alerts.filter((a) => a.symbol === symbol).length ? (
            alerts
              .filter((a) => a.symbol === symbol)
              .map((a) => (
                <div className="alert-row" key={a.id}>
                  <Bell size={16} />
                  <b>${price(a.price)}</b>
                  <Badge>
                    {a.fired ? "TERPICU" : a.enabled ? "AKTIF" : "NONAKTIF"}
                  </Badge>
                  <button
                    className="icon-button"
                    aria-label="Hapus alert"
                    onClick={async () => {
                      try {
                        if (!demo)
                          await api(`/alerts/${a.id}`, { method: "DELETE" });
                        useStore
                          .getState()
                          .set({ alerts: alerts.filter((v) => v.id !== a.id) });
                      } catch (e) {
                        useStore.getState().notify((e as Error).message);
                      }
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))
          ) : (
            <div className="empty-state">
              <Bell size={22} />
              <p>Buat alert dari chart atau tombol +.</p>
              <small>
                {demo
                  ? "Alert demo tidak dikirim ke Discord."
                  : "Pengiriman membutuhkan webhook Discord."}
              </small>
            </div>
          )}
        </section>
      </div>
      {alertOpen && (
        <Modal title="Buat alert harga" onClose={() => setAlertOpen(false)}>
          <p className="muted">
            {symbol} · sentuhan level berdasarkan tick, bukan order
          </p>
          <label className="form-field">
            Level harga
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={alertPrice}
              onChange={(e) => setAlertPrice(e.target.value)}
              autoFocus
            />
          </label>
          <button
            className="button primary wide"
            disabled={saving}
            onClick={add}
          >
            {saving ? "Menyimpan…" : "Buat alert"}
          </button>
        </Modal>
      )}
    </>
  );
}
