import { staffName } from "../../../../packages/shared/src/domain";
import {
  Pause,
  Play,
  Square,
  Eye,
  EyeOff,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { staff, type Meeting } from "../../../../packages/shared/src/domain";
import type { useOfficeMeeting } from "../hooks/useOfficeMeeting";
import { useStore } from "../store";
import { Badge } from "./UI";
export default function MeetingPlayback({
  playback,
  meetings,
  follow,
  onFollow,
}: {
  playback: ReturnType<typeof useOfficeMeeting>;
  meetings: Meeting[];
  follow: boolean;
  onFollow: (follow: boolean) => void;
}) {
  const language = useStore((s) => s.settings.language),
    settings = useStore((s) => s.settings),
    publicView = useStore((s) => s.publicView),
    demo = useStore((s) => s.demo),
    en = language === "en",
    frame = playback.frame,
    speaker =
      frame?.speaker === null || frame?.speaker === undefined
        ? null
        : staff[frame.speaker];
  if (!frame) return null;
  const steps = ["Scanner", "AI", "RR", en ? "Director" : "Bos"],
    active = ["scanner_travel", "scanner_speaking"].includes(frame.stage)
      ? 0
      : ["ai_travel", "ai_waiting", "ai_speaking"].includes(frame.stage)
        ? 1
        : ["rr_travel", "rr_speaking"].includes(frame.stage)
          ? 2
          : 3;
  return (
    <section
      className="meeting-playback"
      aria-label={en ? "Meeting presentation" : "Presentasi meeting"}
      data-stage={frame.stage}
    >
      <div className="playback-heading">
        <div>
          <MessageSquare size={15} />
          <b>{frame.title}</b>
          <Badge tone={playback.manual ? "amber" : "green"}>
            {playback.manual
              ? demo
                ? "DEMO REPLAY"
                : "REPLAY"
              : "SERVER EVENT"}
          </Badge>
        </div>
        <button
          className={`icon-button ${follow ? "active" : ""}`}
          aria-label={en ? "Follow speaker" : "Ikuti pembicara"}
          aria-pressed={follow}
          onClick={() => onFollow(!follow)}
        >
          {follow ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>
      <div className="playback-steps">
        {steps.map((step, i) => (
          <span
            className={i === active ? "active" : i < active ? "done" : ""}
            key={step}
          >
            {step}
            {i < 3 && <ChevronRight size={11} />}
          </span>
        ))}
      </div>
      <div className="speaker-caption" aria-live="polite">
        {speaker && (
          <span
            className="avatar"
            style={{ "--avatar-color": speaker.color } as React.CSSProperties}
          >
            {staffName(speaker, settings)[0]}
          </span>
        )}
        <div>
          {speaker && (
            <b>
              {staffName(speaker, settings)} ·{" "}
              {speaker.kind === "ai" && !publicView
                ? playback.event?.details?.votes[(frame?.speaker || 4) - 4]
                    ?.provider || speaker.role
                : speaker.role}
            </b>
          )}
          <p>
            {frame.message ||
              (frame.stage === "returning"
                ? en
                  ? "Presentation complete. No additional model calls."
                  : "Presentasi selesai. Tidak ada panggilan model tambahan."
                : frame.complete
                  ? en
                    ? "Replay complete."
                    : "Replay selesai."
                  : en
                    ? "All meetings take place on floor 2."
                    : "Seluruh meeting berlangsung di lantai 2.")}
          </p>
        </div>
      </div>
      {playback.manual && !publicView && (
        <div className="playback-controls">
          <button
            className="icon-button"
            aria-label={
              playback.paused
                ? en
                  ? "Resume replay"
                  : "Lanjutkan replay"
                : en
                  ? "Pause replay"
                  : "Jeda replay"
            }
            onClick={playback.togglePause}
          >
            {playback.paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <input
            type="range"
            min={0}
            max={frame.duration}
            step={0.25}
            aria-label={en ? "Replay position" : "Posisi replay"}
            value={Math.min(frame.duration, playback.elapsed)}
            onChange={(e) => playback.seek(Number(e.target.value))}
          />
          <span>
            {Math.floor(playback.elapsed)} / {frame.duration}s
          </span>
          <select
            aria-label={en ? "Replay speed" : "Kecepatan replay"}
            value={playback.speed}
            onChange={(e) => playback.setSpeed(Number(e.target.value))}
          >
            {[0.5, 1, 2, 4].map((speed) => (
              <option key={speed} value={speed}>
                {speed}×
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            aria-label={en ? "Stop replay" : "Hentikan replay"}
            onClick={playback.stop}
          >
            <Square size={13} />
          </button>
        </div>
      )}
      {playback.manual && !publicView && meetings.length > 1 && (
        <label className="replay-select">
          {en ? "Meeting record" : "Rekaman meeting"}
          <select
            aria-label={en ? "Select meeting record" : "Pilih rekaman meeting"}
            value={playback.event?.details?.id || ""}
            onChange={(e) => {
              const m = meetings.find((m) => m.id === e.target.value);
              if (m) playback.replay(m);
            }}
          >
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.symbol} · {m.tf} · {m.phase}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
