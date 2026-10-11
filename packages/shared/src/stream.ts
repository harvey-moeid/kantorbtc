import { z } from "zod";
import {
  voteSchema,
  symbols,
  timeframes,
  type Meeting,
  type Quote,
} from "./domain";
import type { MeetingEvent } from "./presentation";
const phases = z.enum(["scanner", "ai", "rr", "approved", "rejected"]);
const quoteSchema = z.object({
  symbol: z.enum(symbols),
  price: z.number().positive().finite(),
  change: z.number().finite(),
  source: z.string().max(100),
  status: z.enum(["live", "fallback", "stale", "closed", "demo"]),
  at: z.number().finite(),
});
const meetingSchema = z.object({
  id: z.string().min(1).max(160),
  symbol: z.enum(symbols),
  tf: z.enum(timeframes),
  at: z.number().finite(),
  phase: phases,
  scanner: z
    .array(
      z.object({
        group: z.enum(["smc", "indicators", "volume", "derivatives"]),
        direction: z.enum(["long", "short", "netral", "abstain"]),
        score: z.number().min(0).max(100),
        evidence: z.array(z.string().max(2000)).max(20),
      }),
    )
    .max(4),
  votes: z
    .array(
      voteSchema.extend({
        provider: z.string().max(100),
        model: z.string().max(160),
        latency: z.number().nonnegative().finite(),
      }),
    )
    .max(4),
  reason: z.string().max(4000),
  signalId: z.string().optional(),
});
export interface PublicOfficeEvent {
  type: "mood" | "meeting";
  mood?: "naik" | "turun" | "tenang";
  meeting?: "idle" | Meeting["phase"];
  meetingId?: string;
  at?: number;
  aiTriggered?: boolean;
}
export function publicMeetingEvent(
  meeting: Meeting,
  at: number,
): PublicOfficeEvent {
  return {
    type: "meeting",
    meeting: meeting.phase,
    meetingId: meeting.id,
    at,
    aiTriggered:
      meeting.votes.length > 0 ||
      ["ai", "rr", "approved"].includes(meeting.phase),
  };
}
export function parsePublicStream(value: unknown): PublicOfficeEvent | null {
  const parsed = z
    .object({
      type: z.enum(["mood", "meeting"]),
      mood: z.enum(["naik", "turun", "tenang"]).optional(),
      meeting: z
        .enum(["idle", "scanner", "ai", "rr", "approved", "rejected"])
        .optional(),
      meetingId: z.string().max(160).optional(),
      at: z.number().finite().optional(),
      aiTriggered: z.boolean().optional(),
    })
    .safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function parsePrivateStream(
  value: unknown,
):
  | { type: "tick"; quote: Quote; mood?: "naik" | "turun" | "tenang" }
  | { type: "meeting"; event: MeetingEvent }
  | { type: "refresh" }
  | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (input.type === "refresh") return { type: "refresh" };
  if (input.type === "tick") {
    const q = quoteSchema.safeParse(input.quote);
    const mood = z.enum(["naik", "turun", "tenang"]).safeParse(input.mood);
    return q.success
      ? {
          type: "tick",
          quote: q.data,
          ...(mood.success ? { mood: mood.data } : {}),
        }
      : null;
  }
  if (input.type === "meeting") {
    const m = meetingSchema.safeParse(input.meeting);
    if (!m.success) return null;
    const at = z.number().finite().safeParse(input.at);
    return {
      type: "meeting",
      event: {
        id: m.data.id,
        phase: m.data.phase,
        at: at.success ? at.data : Date.now(),
        aiTriggered:
          m.data.votes.length > 0 ||
          ["ai", "rr", "approved"].includes(m.data.phase),
        details: m.data,
      },
    };
  }
  return null;
}
