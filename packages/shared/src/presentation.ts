import { groupNames, staff, type Meeting } from "./domain";
export type PresentationStage =
  | "scanner_travel"
  | "scanner_speaking"
  | "ai_travel"
  | "ai_waiting"
  | "ai_speaking"
  | "rr_travel"
  | "rr_speaking"
  | "director"
  | "returning"
  | "idle";
export interface MeetingEvent {
  id: string;
  phase: Meeting["phase"];
  at: number;
  aiTriggered: boolean;
  details?: Meeting;
}
export interface PresentationFrame {
  stage: PresentationStage;
  elapsed: number;
  duration: number;
  scannerProgress: number;
  aiProgress: number;
  rrProgress: number;
  speaker: number | null;
  title: string;
  message: string;
  shortMessage: string;
  floor: "all" | "2";
  complete: boolean;
  waitAt: number | null;
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const text = {
  id: {
    travel: "Scanner menuju ruang rapat",
    scanner: "Presentasi scanner",
    aiTravel: "Tim AI menyusul",
    waiting: "Menunggu hasil AI",
    ai: "Empat perspektif AI",
    rrTravel: "Divisi RR dan bos bergabung",
    rr: "Validasi Risk & Reward",
    boss: "Persetujuan akhir",
    returning: "Tim kembali bekerja",
    idle: "Kantor siap bekerja",
    publicScan: "Analis memaparkan hasil scanner.",
    publicAI: "Analis mempresentasikan hasil yang sudah tersedia.",
    publicRR: "Divisi RR memeriksa level dan rasio risiko.",
    pending:
      "Analisis backend masih berlangsung. Belum ada voting yang ditampilkan.",
    approved: "Disetujui",
    rejected: "Ditolak",
  },
  en: {
    travel: "Scanners head to the meeting room",
    scanner: "Scanner presentation",
    aiTravel: "AI team joins",
    waiting: "Waiting for AI results",
    ai: "Four AI perspectives",
    rrTravel: "Risk team and director join",
    rr: "Risk & Reward validation",
    boss: "Final approval",
    returning: "Team returns to work",
    idle: "Office ready",
    publicScan: "Analyst presents the scanner results.",
    publicAI: "Analyst presents the existing analysis result.",
    publicRR: "Risk team validates levels and reward ratios.",
    pending: "Backend analysis is still running. No vote is shown yet.",
    approved: "Approved",
    rejected: "Rejected",
  },
};
export function presentationAt(
  event: MeetingEvent,
  elapsed: number,
  publicView = false,
  language: "id" | "en" = "id",
): PresentationFrame {
  const t = text[language],
    e = Math.max(0, elapsed),
    details = publicView ? undefined : event.details;
  const hasAI = event.aiTriggered,
    ready =
      hasAI &&
      ["rr", "approved", "rejected"].includes(event.phase) &&
      (!details || details.votes.length === 4);
  const terminal = ["approved", "rejected"].includes(event.phase),
    duration = hasAI ? 80 : 34;
  const f: PresentationFrame = {
    stage: "idle",
    elapsed: e,
    duration,
    scannerProgress: 0,
    aiProgress: 0,
    rrProgress: 0,
    speaker: null,
    title: t.idle,
    message: "",
    shortMessage: "",
    floor: "all",
    complete: false,
    waitAt: null,
  };
  const say = (
    speaker: number,
    title: string,
    message: string,
    shortMessage = message,
  ) => {
    f.speaker = speaker;
    f.title = title;
    f.message = message;
    f.shortMessage = shortMessage;
  };
  if (e < 10) {
    f.stage = "scanner_travel";
    f.scannerProgress = clamp(e / 10);
    f.title = t.travel;
  } else if (e < 22) {
    f.stage = "scanner_speaking";
    f.scannerProgress = 1;
    f.floor = "2";
    const i = Math.min(3, Math.floor((e - 10) / 3)),
      scan = details?.scanner[i];
    say(
      i,
      t.scanner,
      scan
        ? `${groupNames[scan.group]} · ${scan.direction.toUpperCase()} · ${Math.round(scan.score)}/100. ${scan.evidence.join(" ")}`
        : t.publicScan,
      scan
        ? `${groupNames[scan.group]} / ${scan.direction.toUpperCase()}`
        : staff[i].role,
    );
  } else if (!hasAI) {
    f.stage = e < 34 ? "returning" : "idle";
    f.title = e < 34 ? t.returning : t.idle;
    f.scannerProgress = 1 - clamp((e - 22) / 12);
    f.complete = e >= 34 && terminal;
  } else if (e < 32) {
    f.stage = "ai_travel";
    f.scannerProgress = 1;
    f.aiProgress = clamp((e - 22) / 10);
    f.title = t.aiTravel;
  } else if (!ready) {
    f.stage = "ai_waiting";
    f.scannerProgress = 1;
    f.aiProgress = 1;
    f.floor = "2";
    f.title = t.waiting;
    f.message = t.pending;
    f.waitAt = 32;
  } else if (e < 52) {
    f.stage = "ai_speaking";
    f.scannerProgress = 1;
    f.aiProgress = 1;
    f.floor = "2";
    const i = Math.min(3, Math.floor((e - 32) / 5)),
      vote = details?.votes[i];
    say(
      i + 4,
      t.ai,
      vote
        ? `${vote.provider} · ${vote.direction.toUpperCase()} · ${vote.confidence}% — ${vote.reason}`
        : t.publicAI,
      vote
        ? `${vote.provider} / ${vote.direction.toUpperCase()}`
        : staff[i + 4].role,
    );
  } else if (e < 58) {
    f.stage = "rr_travel";
    f.scannerProgress = 1;
    f.aiProgress = 1;
    f.rrProgress = clamp((e - 52) / 6);
    f.floor = "2";
    f.title = t.rrTravel;
  } else if (e < 63) {
    f.stage = "rr_speaking";
    f.scannerProgress = 1;
    f.aiProgress = 1;
    f.rrProgress = 1;
    f.floor = "2";
    say(
      e < 60.5 ? 8 : 9,
      t.rr,
      details
        ? t.publicRR +
            " " +
            (language === "id"
              ? "RR menggunakan entry terburuk dan TP1; satu SL."
              : "RR uses the worst entry and TP1, with one stop loss.")
        : t.publicRR,
      "RISK & REWARD / TP1",
    );
  } else if (!terminal) {
    f.stage = "ai_waiting";
    f.scannerProgress = 1;
    f.aiProgress = 1;
    f.rrProgress = 1;
    f.floor = "2";
    f.title = t.boss;
    f.message = t.pending;
    f.waitAt = 63;
  } else if (e < 68) {
    f.stage = "director";
    f.scannerProgress = 1;
    f.aiProgress = 1;
    f.rrProgress = 1;
    f.floor = "2";
    const result = event.phase === "approved" ? t.approved : t.rejected;
    say(10, t.boss, details?.reason || result, result.toUpperCase());
  } else {
    f.stage = e < 80 ? "returning" : "idle";
    f.title = e < 80 ? t.returning : t.idle;
    const p = 1 - clamp((e - 68) / 12);
    f.scannerProgress = p;
    f.aiProgress = p;
    f.rrProgress = p;
    f.complete = e >= 80;
  }
  return f;
}
export function presentationProgress(frame: PresentationFrame, index: number) {
  return index < 4
    ? frame.scannerProgress
    : index < 8
      ? frame.aiProgress
      : index < 11
        ? frame.rrProgress
        : 0;
}
