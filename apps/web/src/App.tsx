import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowRight,
  Bell,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  MessageSquare,
  Radio,
  Settings2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import {
  type Settings,
  type Signal,
  type Quote,
  type Meeting,
} from "../../../packages/shared/src/domain";
import { demoTime } from "../../../packages/shared/src/demo";
import { api, ApiError, useStore } from "./store";
import { dateTime, useT } from "./i18n";
import { Badge, Modal } from "./components/UI";
import { connectStream } from "./stream-client";
import {
  parsePrivateStream,
  parsePublicStream,
} from "../../../packages/shared/src/stream";
import Office, { StaffPanel } from "./pages/Office";
const ChartPage = lazy(() => import("./pages/ChartPage"));
const Signals = lazy(() => import("./pages/Signals"));
const Meetings = lazy(() => import("./pages/Meetings"));
const SettingsPage = lazy(() => import("./pages/Settings"));
function Login({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      const data = await api<{ settings: Settings }>("/settings/scanner");
      useStore.getState().set({
        authenticated: true,
        publicView: false,
        demo: false,
        settings: data.settings,
        connection: "connecting",
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Selamat datang di Kantor" onClose={onClose}>
      <div className="login-mark">
        <LockKeyhole size={28} />
      </div>
      <p className="muted">Satu password untuk masuk ke workspace privat.</p>
      <form onSubmit={submit}>
        <label className="form-field">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </label>
        {error && (
          <p role="alert" className="callout error">
            {error}
          </p>
        )}
        <button className="button primary wide" disabled={busy}>
          {busy ? "Memeriksa…" : "Masuk ke workspace"}
          <ArrowRight size={16} />
        </button>
      </form>
      <div className="login-divider">atau lihat pengalaman aplikasinya</div>
      <button
        className="button secondary wide"
        onClick={() => {
          useStore.getState().enterDemo();
          onClose();
        }}
      >
        Jelajahi demo tanpa password
      </button>
    </Modal>
  );
}
export default function App() {
  const t = useT(),
    location = useLocation(),
    navigate = useNavigate(),
    [login, setLogin] = useState(false),
    [sessionChecking, setSessionChecking] = useState(true),
    [mobileMenu, setMobileMenu] = useState(false),
    [notificationOpen, setNotificationOpen] = useState(false),
    state = useStore(),
    started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<{ authenticated: boolean }>("/auth/session")
      .then(async (d) => {
        if (d.authenticated) {
          const s = await api<{ settings: Settings }>("/settings/scanner");
          useStore.getState().set({
            authenticated: true,
            publicView: false,
            settings: s.settings,
            connection: "connecting",
          });
        }
      })
      .catch(() => {})
      .finally(() => setSessionChecking(false));
  }, []);
  useEffect(() => {
    setMobileMenu(false);
  }, [location.pathname]);
  useEffect(() => {
    document.documentElement.lang = state.settings.language;
  }, [state.settings.language]);
  useEffect(() => {
    if (!state.authenticated || state.demo) return;
    let active = true;

    const load = async () => {
      try {
        const [signals, meetings, quotes, alerts] = await Promise.all([
          api<{ signals: Signal[] }>("/signals"),
          api<{ meetings: Meeting[] }>("/meetings"),
          api<{ quotes: Quote[] }>("/market"),
          api<{ alerts: typeof state.alerts }>("/alerts"),
        ]);
        if (active)
          useStore.getState().set({
            signals: signals.signals,
            meetings: meetings.meetings,
            quotes: quotes.quotes,
            alerts: alerts.alerts,
          });
      } catch (e) {
        if (active) {
          if (e instanceof ApiError && e.status === 401)
            useStore.getState().exit();
          useStore.getState().notify((e as Error).message);
        }
      }
    };
    void load();
    const disconnect = connectStream(
      `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/stream`,
      {
        state: (connection) => {
          if (active) useStore.getState().set({ connection });
        },
        unauthorized: () => {
          if (active) {
            useStore.getState().exit();
            useStore.getState().notify("Sesi berakhir. Silakan masuk kembali.");
          }
        },
        message: (value) => {
          const data = parsePrivateStream(value);
          if (!data) return;
          if (data.type === "refresh") void load();
          if (data.type === "meeting") {
            useStore.getState().set({
              meetingPhase: data.event.phase,
              meetingEvent:
                useStore.getState().meetingEvent?.id === data.event.id
                  ? { ...data.event, at: useStore.getState().meetingEvent!.at }
                  : data.event,
            });
            void load();
          }
          if (data.type === "tick") {
            useStore.getState().set({
              ...(data.mood ? { mood: data.mood } : {}),
              quotes: [
                ...useStore
                  .getState()
                  .quotes.filter((q) => q.symbol !== data.quote.symbol),
                data.quote,
              ].sort((a, b) => a.symbol.localeCompare(b.symbol)),
            });
          }
        },
      },
    );
    const id = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(id);
      disconnect();
    };
  }, [state.authenticated, state.demo]);
  useEffect(() => {
    if (!state.publicView || state.demo) return;
    return connectStream(
      `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/public/stream`,
      {
        message: (value) => {
          const data = parsePublicStream(value);
          if (!data) return;
          const patch: Parameters<typeof state.set>[0] = {};
          if (data.mood) patch.mood = data.mood;
          if (data.meeting) patch.meetingPhase = data.meeting;
          if (
            data.meetingId &&
            data.meeting &&
            data.meeting !== "idle" &&
            data.at
          )
            patch.meetingEvent = {
              id: data.meetingId,
              phase: data.meeting,
              at:
                useStore.getState().meetingEvent?.id === data.meetingId
                  ? useStore.getState().meetingEvent!.at
                  : data.at,
              aiTriggered: !!data.aiTriggered,
            };
          useStore.getState().set(patch);
        },
      },
    );
  }, [state.publicView, state.demo]);
  const nav = [
    ["/office", Box, t.office],
    ["/chart/btcusdt", TrendingUp, t.chart],
    ["/signals", Zap, t.signals],
    ["/meetings", MessageSquare, t.meetings],
  ] as const;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
        <NavLink className="brand" to="/office">
          <span className="brand-mark">
            k<span>.</span>
          </span>
          <span>
            KANTOR<small>TRADING INTELLIGENCE</small>
          </span>
        </NavLink>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <LayoutDashboard size={17} />
          </span>
          <div>
            <b>My trading office</b>
            <small>Personal workspace</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-label">{t.workspace}</span>
        <nav className="main-nav">
          {nav.map(([to, Icon, label]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive ||
                (to.includes("/chart/") &&
                  location.pathname.startsWith("/chart/"))
                  ? "active"
                  : ""
              }
              onClick={(e) => {
                if (state.publicView && to !== "/office") {
                  e.preventDefault();
                  setLogin(true);
                }
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {to === "/signals" && !state.publicView && (
                <small>
                  {
                    state.signals.filter((s) =>
                      ["menunggu_entry", "aktif"].includes(s.status),
                    ).length
                  }
                </small>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="office-status">
            <span className="status-orbit">
              <Radio size={22} />
            </span>
            <b>Your edge, in perspective.</b>
            <p>
              Analisis terstruktur.
              <br />
              Keputusan terukur.
            </p>
            <span>
              <i className="dot" />
              {state.demo
                ? "Demo workspace"
                : state.authenticated
                  ? "Private workspace"
                  : "Public workspace"}
            </span>
          </div>
          <NavLink
            to="/settings"
            className={
              location.pathname === "/settings"
                ? "settings-link active"
                : "settings-link"
            }
            onClick={(e) => {
              if (state.publicView) {
                e.preventDefault();
                setLogin(true);
              }
            }}
          >
            <Settings2 size={18} />
            {t.settings}
          </NavLink>
          <button
            className="profile"
            onClick={() =>
              state.publicView
                ? setLogin(true)
                : setNotificationOpen(!notificationOpen)
            }
          >
            <span className="avatar profile-avatar">M</span>
            <span>
              <b>{state.publicView ? "Guest" : "My workspace"}</b>
              <small>
                {state.demo
                  ? "Demo access"
                  : state.authenticated
                    ? "Owner"
                    : "Read-only access"}
              </small>
            </span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          aria-label="Tutup menu"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Buka menu"
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              <Menu size={21} />
            </button>
            <span className="topbar-workspace">
              My workspace <ChevronRight size={13} />{" "}
              <b>
                {location.pathname.startsWith("/chart")
                  ? t.chart
                  : location.pathname === "/signals"
                    ? t.signals
                    : location.pathname === "/meetings"
                      ? t.meetings
                      : location.pathname === "/settings"
                        ? t.settings
                        : t.overview}
              </b>
            </span>
          </div>
          <div className="topbar-actions">
            <Badge
              tone={state.demo ? "amber" : state.publicView ? "" : "green"}
            >
              <i className="dot" />
              {state.demo
                ? t.demo
                : state.publicView
                  ? t.public
                  : state.connection === "live"
                    ? t.live
                    : state.connection === "offline"
                      ? "OFFLINE"
                      : "MENGHUBUNGKAN"}
            </Badge>
            <button
              className="icon-button language-button"
              aria-label="Ganti bahasa"
              onClick={() =>
                state.set({
                  settings: {
                    ...state.settings,
                    language: state.settings.language === "id" ? "en" : "id",
                  },
                })
              }
            >
              <Globe2 size={17} />
              <small>{state.settings.language.toUpperCase()}</small>
            </button>
            <button
              className="icon-button notification-button"
              aria-label="Notifikasi"
              onClick={() => setNotificationOpen(!notificationOpen)}
            >
              <Bell size={19} />
              {state.demo && <i />}
            </button>
            {state.publicView ? (
              <button
                className="button primary small"
                onClick={() => setLogin(true)}
              >
                <LockKeyhole size={14} />
                {t.enter}
              </button>
            ) : (
              <button
                className="icon-button"
                aria-label={t.signout}
                onClick={async () => {
                  if (state.authenticated) {
                    try {
                      await api("/auth/logout", { method: "POST" });
                    } catch {
                      state.notify("Logout gagal. Coba lagi.");
                      return;
                    }
                  }
                  state.exit();
                  navigate("/office");
                }}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </header>
        {state.demo && (
          <div className="demo-banner">
            <span>
              <Eye size={14} />
              {t.demoNote}
            </span>
            <button onClick={() => setLogin(true)}>
              Hubungkan workspace live <ArrowRight size={12} />
            </button>
          </div>
        )}
        {state.publicView && (
          <div className="public-banner">
            <div>
              <Sparkles size={17} />
              <span>
                Selamat datang di Kantor. Jelajahi ruang kerja trading Anda.
              </span>
            </div>
            <button onClick={() => state.enterDemo()}>
              {t.demoButton} <ArrowRight size={15} />
            </button>
          </div>
        )}
        <main>
          <Suspense
            fallback={<div className="empty-state tall">Memuat workspace…</div>}
          >
            {sessionChecking ? (
              <div className="empty-state tall">Memeriksa workspace…</div>
            ) : (
              <Routes>
                <Route path="/" element={<Navigate to="/office" replace />} />
                <Route path="/office" element={<Office />} />
                <Route
                  path="/public"
                  element={<Navigate to="/office" replace />}
                />
                <Route
                  path="/chart/:symbol"
                  element={
                    state.publicView ? (
                      <Navigate to="/office" replace />
                    ) : (
                      <ChartPage />
                    )
                  }
                />
                <Route
                  path="/signals"
                  element={
                    state.publicView ? (
                      <Navigate to="/office" replace />
                    ) : (
                      <Signals />
                    )
                  }
                />
                <Route
                  path="/meetings"
                  element={
                    state.publicView ? (
                      <Navigate to="/office" replace />
                    ) : (
                      <Meetings />
                    )
                  }
                />
                <Route
                  path="/settings"
                  element={
                    state.publicView ? (
                      <Navigate to="/office" replace />
                    ) : (
                      <SettingsPage />
                    )
                  }
                />
                <Route
                  path="*"
                  element={
                    <div className="empty-state tall">
                      <h1>Halaman tidak ditemukan</h1>
                      <NavLink to="/office">Kembali ke kantor</NavLink>
                    </div>
                  }
                />
              </Routes>
            )}
          </Suspense>
        </main>
        <footer className="app-footer">
          <span>
            <ShieldCheck size={13} />
            {t.disclaimer}
          </span>
          <span>
            KANTOR <span className="muted">/</span> v0.1
          </span>
        </footer>
      </div>
      {login && <Login onClose={() => setLogin(false)} />}
      <StaffPanel />
      {notificationOpen && (
        <div className="notification-popover">
          <div className="modal-head">
            <h3>Notifikasi</h3>
            <button
              className="icon-button"
              aria-label="Tutup notifikasi"
              onClick={() => setNotificationOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          {state.demo ? (
            <>
              <div className="notification-item">
                <ShieldCheck size={19} />
                <div>
                  <b>Meeting contoh disetujui</b>
                  <p>BTCUSDT · H1 · 3/4 LONG · RR 1:2</p>
                  <small>Data demonstrasi · {dateTime(demoTime)}</small>
                </div>
              </div>
              <div className="notification-item">
                <Eye size={19} />
                <p>
                  Demo tidak mengirim alert Discord atau memanggil provider AI.
                </p>
              </div>
            </>
          ) : (
            <p className="muted">Belum ada notifikasi baru.</p>
          )}
        </div>
      )}
      {state.notice && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{state.notice}</span>
          <button
            aria-label="Tutup"
            onClick={() => state.set({ notice: null })}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
