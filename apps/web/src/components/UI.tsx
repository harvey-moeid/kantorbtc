import { useEffect, useRef, type ReactNode } from "react";
import {
  X,
  Check,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  Bitcoin,
  Layers,
  MoveUpRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Quote, Signal } from "../../../../packages/shared/src/domain";
import { useStore } from "../store";
import { price, dateTime } from "../i18n";
export const statusLabels: Record<Signal["status"], string> = {
  menunggu_entry: "Menunggu entry",
  aktif: "Aktif",
  target_tercapai: "Target tercapai",
  stop_loss: "Stop loss",
  dibatalkan: "Dibatalkan",
  kedaluwarsa: "Kedaluwarsa",
  ditolak: "Ditolak",
};
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Tutup" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
export function MiniSpark({ down = false }: { down?: boolean }) {
  return (
    <svg className="sparkline" viewBox="0 0 150 40" aria-hidden="true">
      <polyline
        points={
          down
            ? "0,9 8,15 17,7 25,18 33,13 44,24 51,20 59,29 67,17 78,22 85,17 94,26 103,21 113,30 125,27 134,35 150,31"
            : "0,34 8,29 17,33 25,22 33,27 44,20 51,24 59,13 67,20 78,15 85,19 94,11 103,14 113,8 125,12 134,4 150,6"
        }
        fill="none"
        stroke={down ? "#d4937c" : "#c4dea1"}
        strokeWidth="1.8"
      />
    </svg>
  );
}
export function QuoteCard({ quote }: { quote: Quote }) {
  const navigate = useNavigate();
  return (
    <button
      className="quote-card"
      onClick={() => navigate(`/chart/${quote.symbol.toLowerCase()}`)}
    >
      <div className="quote-top">
        <span
          className={`asset-icon ${quote.symbol === "XAUUSD" ? "gold" : ""}`}
        >
          {quote.symbol === "BTCUSDT" ? (
            <Bitcoin size={21} />
          ) : (
            <Layers size={21} />
          )}
        </span>
        <span>
          <b>{quote.symbol === "BTCUSDT" ? "Bitcoin" : "Gold / US Dollar"}</b>
          <small>
            {quote.symbol === "BTCUSDT" ? "BTC / USDT" : "XAU / USD"}
          </small>
        </span>
        <span className="quote-source">
          <i className={quote.status === "demo" ? "dot amber" : "dot"} />
          {quote.source} · {quote.status}
        </span>
        <MoveUpRight size={15} />
      </div>
      <div className="quote-bottom">
        <div>
          <strong>${price(quote.price)}</strong>
          <span className={quote.change >= 0 ? "up" : "down"}>
            {quote.change >= 0 ? (
              <ArrowUpRight size={14} />
            ) : (
              <ArrowDownLeft size={14} />
            )}{" "}
            {quote.change > 0 ? "+" : ""}
            {quote.change}%{" "}
            <em>24h {quote.status === "demo" ? "contoh" : ""}</em>
          </span>
        </div>
        {quote.status === "demo" && <MiniSpark down={quote.change < 0} />}
      </div>
    </button>
  );
}
export function SignalDetail({ signal: s }: { signal: Signal }) {
  const demo = useStore((s) => s.demo);
  return (
    <>
      <div className="result-line">
        <Badge tone={s.direction === "long" ? "green" : "red"}>
          {s.direction.toUpperCase()}
        </Badge>
        <Badge>{statusLabels[s.status]}</Badge>
        <b>{s.confidence.toFixed(0)}% keyakinan</b>
      </div>
      {demo && (
        <p className="callout">
          Sinyal fixture · bukan rekomendasi pasar saat ini.
        </p>
      )}
      <div className="level-grid">
        <div>
          <small>ENTRY ZONE</small>
          <b>
            {price(s.levels.entry[0])} — {price(s.levels.entry[1])}
          </b>
        </div>
        <div>
          <small>STOP LOSS</small>
          <b className="down">{price(s.levels.sl)}</b>
        </div>
        {s.levels.tp.map((v, i) => (
          <div key={i}>
            <small>TAKE PROFIT {i + 1}</small>
            <b className="up">
              {price(v)} {s.hitTargets.includes(i + 1) ? "✓" : ""}
            </b>
          </div>
        ))}
        <div>
          <small>RR / TP1</small>
          <b>1:{s.rr.toFixed(2)}</b>
        </div>
      </div>
      <p className="muted">
        {s.source} · versi pengaturan {s.settingsVersion} ·{" "}
        {s.tieBreaker ? "scanner_tie_breaker" : "mayoritas AI"}
      </p>
      {s.entryTouchedAt && (
        <p className="evidence">
          <Check size={16} />
          Entry tersentuh: {dateTime(s.entryTouchedAt)} WIB ·{" "}
          {price(s.entryTouchedPrice!)}
        </p>
      )}
      <h3>Voting AI</h3>
      <div className="vote-list">
        {s.votes.map((v, i) => (
          <div key={i}>
            <div>
              <b>{v.provider}</b>
              <Badge
                tone={
                  v.direction === "long"
                    ? "green"
                    : v.direction === "short"
                      ? "red"
                      : ""
                }
              >
                {v.direction.toUpperCase()}
              </Badge>
            </div>
            <p>{v.reason}</p>
            <small>
              {v.model} · {v.confidence}% · {v.latency} ms
            </small>
          </div>
        ))}
      </div>
      <p className="disclaimer">
        <ShieldCheck size={14} />
        Informasi analisis, bukan nasihat keuangan. Tidak ada eksekusi order.
      </p>
    </>
  );
}
export function SignalRow({
  signal: s,
  compact,
  onClick,
}: {
  signal: Signal;
  compact: boolean;
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      aria-label={`Detail sinyal ${s.id}`}
    >
      <td>
        <b>{s.symbol}</b>
        <small>
          {s.tf} · {dateTime(s.createdAt)}
        </small>
      </td>
      <td>
        <Badge tone={s.direction === "long" ? "green" : "red"}>
          {s.direction === "long" ? (
            <ArrowUpRight size={11} />
          ) : (
            <ArrowDownLeft size={11} />
          )}{" "}
          {s.direction.toUpperCase()}
        </Badge>
      </td>
      {!compact && (
        <td>
          <b>
            {price(s.levels.entry[0])} – {price(s.levels.entry[1])}
          </b>
          <small>SL {price(s.levels.sl)}</small>
        </td>
      )}
      <td>
        <b>1:{s.rr.toFixed(1)}</b>
      </td>
      <td>
        <span className={`signal-status ${s.status}`}>
          <i />
          {statusLabels[s.status]}
        </span>
      </td>
      <td>
        <ChevronRight size={14} />
      </td>
    </tr>
  );
}
