import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  Clock3,
  Crosshair,
  Expand,
  Layers,
  LockKeyhole,
  MessageSquare,
  Monitor,
  Play,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  staff,
  symbols,
  groupNames,
  type Settings,
} from "../../../../packages/shared/src/domain";
import { useStore } from "../store";
import { useT, dateTime } from "../i18n";
import { Badge, Modal, QuoteCard } from "../components/UI";
import { useOfficeMeeting } from "../hooks/useOfficeMeeting";
import MeetingPlayback from "../components/MeetingPlayback";
import type { RenderStats } from "../components/RenderMonitor";
import { SignalRows } from "../components/SignalRows";
const OfficeScene = lazy(() => import("../components/OfficeScene"));
export function TeamList() {
  const set = useStore((s) => s.set),
    selected = useStore((s) => s.selectedStaff);
  return (
    <div className="team-list">
      {staff
        .filter((s) => s.kind !== "support")
        .map((s) => (
          <button
            key={s.id}
            className={selected === s.id ? "selected" : ""}
            onClick={() => set({ selectedStaff: s.id })}
          >
            <span
              className="avatar"
              style={{ "--avatar-color": s.color } as React.CSSProperties}
            >
              {s.name.slice(0, 1)}
              <i />
            </span>
            <span>
              <b>{s.name}</b>
              <small>{s.role}</small>
            </span>
            <ChevronRight size={14} />
          </button>
        ))}
    </div>
  );
}
export function StaffPanel() {
  const personId = useStore((s) => s.selectedStaff),
    set = useStore((s) => s.set),
    meetings = useStore((s) => s.meetings),
    demo = useStore((s) => s.demo),
    person = staff.find((s) => s.id === personId);
  if (!person) return null;
  const idx = staff.findIndex((s) => s.id === person.id),
    scan = meetings[0]?.scanner[idx],
    vote = meetings[0]?.votes[idx - 4];
  return (
    <Modal
      title={`${person.name} · ${person.role}`}
      onClose={() => set({ selectedStaff: null })}
    >
      <div className="staff-profile">
        <span
          className="avatar large"
          style={{ "--avatar-color": person.color } as React.CSSProperties}
        >
          {person.name[0]}
        </span>
        <div>
          <Badge tone="green">{person.kind.toUpperCase()}</Badge>
          <p>Lantai {person.floor} · Tim Kantor</p>
        </div>
      </div>
      {demo && (
        <p className="callout">
          Analisis dan voting berikut adalah contoh demonstrasi.
        </p>
      )}
      {scan && person.kind === "scanner" ? (
        <>
          <div className="result-line">
            <Badge tone={scan.direction === "long" ? "green" : "amber"}>
              {scan.direction.toUpperCase()}
            </Badge>
            <b>Skor {scan.score}/100</b>
          </div>
          {scan.evidence.map((e, i) => (
            <p key={i} className="evidence">
              <Check size={16} />
              {e}
            </p>
          ))}
        </>
      ) : vote && person.kind === "ai" ? (
        <>
          <div className="result-line">
            <Badge tone="green">{vote.direction.toUpperCase()}</Badge>
            <b>{vote.confidence}% keyakinan</b>
            <small>{vote.latency} ms</small>
          </div>
          <p className="analysis-text">{vote.reason}</p>
          <p className="muted">
            {vote.model} · {vote.provider}
          </p>
          {vote.risks.map((r) => (
            <p className="callout" key={r}>
              {r}
            </p>
          ))}
        </>
      ) : (
        <p className="analysis-text">
          {person.kind === "boss"
            ? "Persetujuan otomatis: mayoritas 3/4 atau tie-breaker scanner yang sah, level valid, dan RR TP1 ≥ ambang. Tidak ada eksekusi order."
            : person.kind === "rr"
              ? "Validasi satu SL, TP1–TP3, dan RR dari batas entry yang paling tidak menguntungkan."
              : "Memantau infrastruktur dan aktivitas kantor."}
        </p>
      )}
    </Modal>
  );
}
function Office2D() {
  const t = useT(),
    publicView = useStore((s) => s.publicView);
  return (
    <div className="office-2d">
      <div className="flat-office-mark">
        <Box size={36} />
      </div>
      <span className="eyebrow">KANTOR / OVERVIEW</span>
      <h2>
        {publicView ? "11 analis. Satu kantor." : "Tim Anda tetap terhubung."}
      </h2>
      <p>
        {publicView
          ? t.private
          : "Mode 2D · pilih analis untuk melihat detail pekerjaannya."}
      </p>
      {!publicView && <TeamList />}
    </div>
  );
}
export function MarketOverview() {
  const quotes = useStore((s) => s.quotes),
    signals = useStore((s) => s.signals),
    t = useT();
  return (
    <div className="market-overview">
      {quotes.length
        ? quotes.map((q) => <QuoteCard key={q.symbol} quote={q} />)
        : symbols.map((s) => (
            <div className="quote-card quote-empty" key={s}>
              <b>{s}</b>
              <span>Menunggu koneksi sumber data</span>
            </div>
          ))}
      <div className="stats-card">
        <div>
          <span className="stats-icon">
            <Zap size={18} />
          </span>
          <span>
            {t.activeSignals}
            <strong>
              {signals
                .filter((s) => ["aktif", "menunggu_entry"].includes(s.status))
                .length.toString()
                .padStart(2, "0")}
            </strong>
          </span>
        </div>
        <span className="stats-meta">
          <ShieldCheck size={13} /> Voting + validasi RR
        </span>
      </div>
    </div>
  );
}
export default function Office() {
  const t = useT(),
    navigate = useNavigate(),
    floor = useStore((s) => s.floor),
    set = useStore((s) => s.set),
    quality = useStore((s) => s.settings.quality),
    mode2d = useStore((s) => s.mode2d),
    demo = useStore((s) => s.demo),
    publicView = useStore((s) => s.publicView),
    meetings = useStore((s) => s.meetings),
    [reset, resetCamera] = useState(0),
    [follow, setFollow] = useState(false),
    [stats, setStats] = useState<RenderStats | null>(null),
    playback = useOfficeMeeting(),
    [expanded, setExpanded] = useState(false),
    [timer, setTimer] = useState(0);
  useEffect(() => {
    const tick = () => setTimer(300 - (Math.floor(Date.now() / 1000) % 300));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const meeting = meetings[0];
  useEffect(() => {
    if (follow && playback.frame)
      set({ floor: playback.frame.complete ? "all" : playback.frame.floor });
  }, [follow, playback.frame?.floor, playback.frame?.complete, set]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} /> {t.overview}
          </div>
          <h1>
            {t.tradingFloor}
            <span className="heading-dot" />
          </h1>
          <p>{t.officeSubtitle}</p>
        </div>
        <div className="heading-actions">
          <button
            className="button secondary"
            onClick={() => navigate("/meetings")}
            disabled={publicView}
          >
            <Clock3 size={16} /> {t.meetings}
          </button>
          <button
            className="button primary"
            onClick={() => navigate("/chart/btcusdt")}
            disabled={publicView}
          >
            <TrendingUp size={16} /> {t.chart} <ArrowUpRight size={16} />
          </button>
        </div>
      </div>
      {!publicView && <MarketOverview />}
      <div className="office-layout">
        <section
          className={`office-panel panel ${expanded ? "office-expanded" : ""}`}
        >
          <div className="panel-heading">
            <div>
              <span className="live-dot" />
              <h2>{t.office}</h2>
              <Badge>{mode2d ? "2D" : "INTERACTIVE"}</Badge>
            </div>
            <button
              className="icon-button"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "Tutup layar penuh" : "Perbesar kantor"}
            >
              {expanded ? <X size={17} /> : <Expand size={17} />}
            </button>
          </div>
          <div className="scene-area">
            <div className="scene-label">
              <span className="eyebrow">KANTOR HEADQUARTERS</span>
              <span>
                Jakarta ·{" "}
                {demo
                  ? "11 Okt 2026, 15:45 WIB · contoh"
                  : "Private trading office"}
              </span>
            </div>
            <div className="floor-controls">
              {(["all", "1", "2"] as const).map((f) => (
                <button
                  key={f}
                  className={floor === f ? "active" : ""}
                  onClick={() => {
                    setFollow(false);
                    set({ floor: f });
                  }}
                >
                  {f === "all" ? <Layers size={14} /> : null}
                  {f === "all" ? t.allFloors : `${t.floor} ${f}`}
                </button>
              ))}
            </div>
            {mode2d ? (
              <Office2D />
            ) : (
              <Suspense
                fallback={
                  <div className="scene-loading">
                    <Box className="pulse" size={36} />
                    <span>Menyiapkan kantor…</span>
                  </div>
                }
              >
                <OfficeScene
                  onChart={(s) => {
                    if (!publicView) navigate(`/chart/${s}`);
                  }}
                  reset={reset}
                  frame={playback.frame}
                  follow={follow}
                  onManual={() => setFollow(false)}
                  onStats={setStats}
                  fallback={<Office2D />}
                />
              </Suspense>
            )}
            <div className="scene-tools">
              <button
                className="icon-button"
                aria-label="Reset kamera"
                onClick={() => {
                  setFollow(false);
                  resetCamera(reset + 1);
                }}
              >
                <RotateCcw size={16} />
              </button>
              <button
                className={`icon-button ${mode2d ? "active" : ""}`}
                aria-label="Ganti mode 2D/3D"
                onClick={() => set({ mode2d: !mode2d })}
              >
                <Monitor size={16} />
              </button>
              <select
                aria-label="Kualitas 3D"
                value={quality}
                onChange={(e) =>
                  set({
                    settings: {
                      ...useStore.getState().settings,
                      quality: e.target.value as Settings["quality"],
                    },
                  })
                }
              >
                {["auto", "low", "medium", "high"].map((q) => (
                  <option key={q}>{q}</option>
                ))}
              </select>
            </div>
            {stats && !mode2d && (
              <span className="render-stats" aria-label="Statistik render">
                {quality === "auto" ? "AUTO · " : ""}
                {stats.quality.toUpperCase()} ·{" "}
                {stats.paused
                  ? "PAUSED"
                  : stats.onDemand
                    ? "ON DEMAND"
                    : stats.fps === null
                      ? "—"
                      : `${stats.fps} FPS`}
              </span>
            )}
            <div className="scene-hint">
              <span>
                <Crosshair size={13} /> Geser untuk orbit · scroll untuk zoom
              </span>
              <span>
                <Users size={13} /> 11 inti + 2 pendukung
              </span>
            </div>
          </div>
          <MeetingPlayback
            playback={playback}
            meetings={meetings}
            follow={follow}
            onFollow={setFollow}
          />
          <div className="office-footer">
            <span>
              <i className="dot" />{" "}
              {publicView
                ? "Suasana kantor · read-only"
                : demo
                  ? "Demo interaktif · tanpa koneksi pasar"
                  : "Aktivitas mengikuti event server"}
            </span>
            {!publicView && meeting && (
              <button
                onClick={() => {
                  playback.replay(meeting);
                  useStore
                    .getState()
                    .notify(
                      demo
                        ? "Replay data contoh; tidak ada panggilan AI."
                        : "Replay rekaman backend; tidak ada panggilan AI baru.",
                    );
                }}
              >
                <Play size={13} /> {demo ? "Simulasi rapat" : "Putar meeting"}
              </button>
            )}
          </div>
        </section>
        <aside className="right-column">
          <section className="panel scanner-panel">
            <div className="panel-heading">
              <div>
                <Activity size={16} />
                <h2>{t.scanner}</h2>
              </div>
              <Badge>{publicView ? "PRIVATE" : "4 GROUPS"}</Badge>
            </div>
            {publicView ? (
              <div className="private-message">
                <LockKeyhole size={28} />
                <p>{t.private}</p>
              </div>
            ) : (
              <>
                <div className="consensus-summary">
                  <span className="consensus-number">
                    {demo
                      ? "3"
                      : meeting?.scanner.filter((s) => s.direction === "long")
                          .length || "—"}
                    <small>/ 4</small>
                  </span>
                  <div>
                    <b>{demo ? "Bias bullish" : "Hasil putaran terakhir"}</b>
                    <span>
                      {meeting
                        ? `${meeting.symbol} · ${meeting.tf}${demo ? " · contoh" : ""}`
                        : "Menunggu scanner"}
                    </span>
                  </div>
                  <span className="scan-radar">
                    <Crosshair size={25} />
                  </span>
                </div>
                <div className="scan-list">
                  {(meeting?.scanner || []).map((s) => (
                    <div key={s.group}>
                      <span>{groupNames[s.group]}</span>
                      <div className="score-track">
                        <i
                          style={{
                            width: `${s.score}%`,
                            background:
                              s.direction === "long"
                                ? "#bfdaa1"
                                : s.direction === "short"
                                  ? "#d4957f"
                                  : "#8b9184",
                          }}
                        />
                      </div>
                      <b>{Math.round(s.score)}</b>
                      <span className={`direction-dot ${s.direction}`} />
                    </div>
                  ))}
                </div>
                <div className="scanner-note">
                  <ShieldCheck size={14} />
                  <span>
                    {demo
                      ? "3 kelompok searah · syarat AI terpenuhi (contoh)"
                      : "Abstain tidak dihitung sebagai suara netral."}
                  </span>
                </div>
              </>
            )}
          </section>
          <section className="panel team-panel">
            <div className="panel-heading">
              <div>
                <Users size={16} />
                <h2>{t.team}</h2>
              </div>
              <span className="muted">11</span>
            </div>
            {publicView ? (
              <div className="public-team">
                {staff.slice(0, 8).map((p) => (
                  <span
                    key={p.id}
                    className="avatar"
                    style={{ "--avatar-color": p.color } as React.CSSProperties}
                  >
                    {p.name[0]}
                  </span>
                ))}
                <p>4 scanner · 4 AI · 2 RR · 1 bos</p>
              </div>
            ) : (
              <TeamList />
            )}
          </section>
        </aside>
      </div>
      {!publicView && (
        <div className="bottom-grid">
          <section className="panel recent-signals">
            <div className="panel-heading">
              <div>
                <Zap size={16} />
                <h2>{t.activeSignals}</h2>
              </div>
              <NavLink to="/signals">
                Lihat semua <ArrowRight size={14} />
              </NavLink>
            </div>
            <SignalRows compact />
          </section>
          <section className="panel meeting-preview">
            <div className="panel-heading">
              <div>
                <MessageSquare size={16} />
                <h2>{t.activity}</h2>
              </div>
              <span className="muted">{demo ? "CONTOH" : "SERVER"}</span>
            </div>
            <div className="meeting-preview-body">
              <div className="timeline-icon">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h3>
                  {meeting ? "Meeting terakhir selesai" : "Belum ada meeting"}
                </h3>
                <p>
                  {meeting?.reason ||
                    "Scanner berjalan tiap 5 menit saat backend aktif."}
                </p>
                <small>
                  {meeting ? dateTime(meeting.at) + " WIB" : "Menunggu data"}
                </small>
              </div>
            </div>
            <div className="meeting-countdown">
              <span>
                <Clock3 size={14} /> {t.nextMeeting}
                {demo ? " · jadwal contoh" : ""}
              </span>
              <b>
                {String(Math.floor(timer / 60)).padStart(2, "0")}:
                {String(timer % 60).padStart(2, "0")}
              </b>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
