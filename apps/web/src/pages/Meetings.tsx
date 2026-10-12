import CotContext from "../components/CotContext";
import VoteAttempts from "../components/VoteAttempts";
import { useState } from "react";
import {
  Activity,
  ChevronRight,
  Clock3,
  Crosshair,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  groupNames,
  type Meeting,
} from "../../../../packages/shared/src/domain";
import { useStore } from "../store";
import { dateTime, useT } from "../i18n";
import { Badge, Modal, PageTitle } from "../components/UI";
export default function Meetings() {
  const meetings = useStore((s) => s.meetings),
    demo = useStore((s) => s.demo),
    [selected, setSelected] = useState<Meeting | null>(null),
    t = useT();
  return (
    <>
      <PageTitle
        eyebrow="THE WAR ROOM"
        title={t.meetings}
        description="Empat perspektif independen. Satu keputusan yang terukur."
      />
      <div className="meeting-steps">
        {[
          [Activity, "01", "Scanner", "≥ 2 kelompok searah"],
          [Sparkles, "02", "4 model AI", "Analisis paralel"],
          [Crosshair, "03", "Risk & Reward", "Validasi level dan RR"],
          [ShieldCheck, "04", "Persetujuan bos", "Aturan deterministik"],
        ].map(([Icon, n, name, description]) => {
          const I = Icon as typeof Activity;
          return (
            <div key={String(n)}>
              <span>
                <I size={20} />
              </span>
              <small>{String(n)}</small>
              <h3>{String(name)}</h3>
              <p>{String(description)}</p>
            </div>
          );
        })}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <Clock3 size={17} />
            <h2>Riwayat meeting</h2>
          </div>
          <Badge>{demo ? "FIXTURE" : "D1 AUDIT"}</Badge>
        </div>
        {meetings.length ? (
          meetings.map((m) => (
            <button
              className="meeting-row"
              key={m.id}
              onClick={() => setSelected(m)}
            >
              <span className={`meeting-icon ${m.phase}`}>
                <MessageSquare size={19} />
              </span>
              <div>
                <b>
                  {m.symbol} <span className="muted">/ {m.tf}</span>
                </b>
                <p>{m.reason}</p>
                <small>
                  {dateTime(m.at)} WIB ·{" "}
                  {m.votes.length
                    ? `${m.votes.length} slot AI`
                    : "scanner saja"}
                </small>
              </div>
              <Badge tone={m.phase === "approved" ? "green" : "red"}>
                {m.phase === "approved"
                  ? "DISETUJUI"
                  : m.phase === "rejected"
                    ? "DITOLAK"
                    : m.phase.toUpperCase()}
              </Badge>
              <ChevronRight size={16} />
            </button>
          ))
        ) : (
          <div className="empty-state">
            Belum ada meeting. Riwayat hanya berasal dari event backend.
          </div>
        )}
      </section>
      {selected && (
        <Modal
          title={`Meeting ${selected.symbol} · ${selected.tf}`}
          onClose={() => setSelected(null)}
        >
          <p className="analysis-text">{selected.reason}</p>
          {demo && (
            <p className="callout">
              Riwayat contoh. Tidak ada panggilan provider AI.
            </p>
          )}
          <div className="vote-list">
            {selected.scanner.map((s) => (
              <div key={s.group}>
                <div>
                  <b>{groupNames[s.group]}</b>
                  <Badge>
                    {s.direction.toUpperCase()} · {Math.round(s.score)}
                  </Badge>
                </div>
                <p>{s.evidence.join(" ")}</p>
              </div>
            ))}
          </div>
          {selected.symbol === "XAUUSD" && (
            <CotContext context={selected.cot} />
          )}
          <h3>Presentasi AI</h3>
          {selected.votes.length ? (
            selected.votes.map((v, index) => (
              <div className="presentation" key={index}>
                <div>
                  <Sparkles size={18} />
                  <b>{v.provider}</b>
                  <Badge tone={v.direction === "long" ? "green" : ""}>
                    {v.direction.toUpperCase()}
                  </Badge>
                </div>
                <p>{v.reason}</p>
                <VoteAttempts vote={v} />
              </div>
            ))
          ) : (
            <p className="muted">Tidak terpicu. Tidak ada biaya AI.</p>
          )}
        </Modal>
      )}
    </>
  );
}
