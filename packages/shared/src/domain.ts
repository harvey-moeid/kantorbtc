import { z } from "zod";
export const symbols = ["BTCUSDT", "XAUUSD"] as const;
export const timeframes = ["5m", "15m", "H1", "H4", "D1"] as const;
export type Symbol = (typeof symbols)[number];
export type Timeframe = (typeof timeframes)[number];
export const seconds: Record<Timeframe, number> = {
  "5m": 300,
  "15m": 900,
  H1: 3600,
  H4: 14400,
  D1: 86400,
};
export type Direction = "long" | "short" | "netral" | "abstain";
export type Group = "smc" | "indicators" | "volume" | "derivatives";
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface Scan {
  group: Group;
  direction: Direction;
  score: number;
  evidence: string[];
}
export const levelsSchema = z.object({
  entry: z.tuple([z.number().positive(), z.number().positive()]),
  sl: z.number().positive(),
  tp: z.array(z.number().positive()).min(1).max(3),
});
export const voteSchema = z.object({
  direction: z.enum(["long", "short", "netral", "abstain"]),
  confidence: z.number().min(0).max(100),
  reason: z.string().min(1).max(1600),
  levels: levelsSchema.nullable(),
  risks: z.array(z.string().max(300)).max(10),
});
export type Levels = z.infer<typeof levelsSchema>;
export type Vote = z.infer<typeof voteSchema> & {
  provider: string;
  model: string;
  latency: number;
  attempts?: {
    provider: string;
    model: string;
    status:
      "valid" | "unavailable" | "timeout" | "invalid_output" | "provider_error";
    latency: number;
  }[];
};
export type SignalStatus =
  | "menunggu_entry"
  | "aktif"
  | "target_tercapai"
  | "stop_loss"
  | "dibatalkan"
  | "kedaluwarsa"
  | "ditolak"
  | "ambigu";
export interface Signal {
  id: string;
  symbol: Symbol;
  tf: Timeframe;
  direction: "long" | "short";
  confidence: number;
  levels: Levels;
  rr: number;
  status: SignalStatus;
  createdAt: number;
  expiresAt: number | null;
  source: string;
  votes: Vote[];
  scanner: Scan[];
  tieBreaker: boolean;
  entryClock?: {
    remainingMs: number;
    at: number;
    state: "open" | "closed" | "unknown";
    knownUntil: number;
  };
  ambiguousSince?: number;
  exitAt?: number;
  exitPrice?: number;
  cancelledAt?: number;
  cancellationReason?: "opposing_signal_same_timeframe";
  cancelledBySignalId?: string;
  entryTouchedAt?: number;
  entryTouchedPrice?: number;
  hitTargets: number[];
  settingsVersion: number;
}
export interface CotReport {
  reportDate: string;
  fetchedAt: number;
  source: string;
  contract: "088691";
  openInterest: number;
  managedMoney: { long: number; short: number; spreading: number; net: number };
  netChange: number | null;
}
export interface CotContext {
  status: "fresh" | "stale" | "unavailable";
  checkedAt: number | null;
  warning: string | null;
  report: CotReport | null;
}
export interface Meeting {
  id: string;
  symbol: Symbol;
  tf: Timeframe;
  at: number;
  phase: "scanner" | "ai" | "rr" | "approved" | "rejected";
  scanner: Scan[];
  votes: Vote[];
  reason: string;
  signalId?: string;
  cot?: CotContext;
}
export interface Quote {
  symbol: Symbol;
  price: number;
  change: number;
  source: string;
  status: "demo" | "live" | "fallback" | "stale" | "closed";
  at: number;
}
export const settingsSchema = z
  .object({
    language: z.enum(["id", "en"]).default("id"),
    quality: z.enum(["auto", "low", "medium", "high"]).default("auto"),
    minRR: z.number().min(1).max(10).default(1),
    thresholds: z.object({
      smc: z.number().min(0).max(100),
      indicators: z.number().min(0).max(100),
      volume: z.number().min(0).max(100),
      derivatives: z.number().min(0).max(100),
    }),
    enabled: z.object({
      smc: z.boolean(),
      indicators: z.boolean(),
      volume: z.boolean(),
      derivatives: z.boolean(),
    }),
    minGroups: z.number().int().min(2).max(4).default(2),
    tieMargin: z.number().min(0).max(400).nullable().default(40),
    ttl: z.object({
      "5m": z.number().int().min(300).nullable(),
      "15m": z.number().int().min(900).nullable(),
      H1: z.number().int().min(3600).nullable(),
      H4: z.number().int().min(14400).nullable(),
      D1: z.number().int().min(86400).nullable(),
    }),
    emaFast: z.number().int().min(3).max(100),
    emaSlow: z.number().int().min(10).max(300),
    rsiPeriod: z.number().int().min(3).max(100),
    swing: z.number().int().min(2).max(15),
    discordSignals: z.boolean(),
    discordPrices: z.boolean(),
    cooldown: z.number().int().min(0).max(86400),
  })
  .refine((s) => s.emaFast < s.emaSlow, {
    message: "EMA cepat harus lebih kecil dari EMA lambat",
    path: ["emaFast"],
  });
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  language: "id",
  quality: "auto",
  minRR: 1,
  thresholds: { smc: 60, indicators: 60, volume: 60, derivatives: 60 },
  enabled: { smc: true, indicators: true, volume: true, derivatives: true },
  minGroups: 2,
  tieMargin: 40,
  ttl: { "5m": 900, "15m": 2700, H1: 10800, H4: 43200, D1: 259200 },
  emaFast: 20,
  emaSlow: 50,
  rsiPeriod: 14,
  swing: 3,
  discordSignals: true,
  discordPrices: true,
  cooldown: 60,
};
export const groupNames: Record<Group, string> = {
  smc: "SMC / ICT",
  indicators: "Indikator",
  volume: "Volume",
  derivatives: "Derivatives",
};
export const staff = [
  {
    id: "s1",
    name: "Arka",
    role: "SMC / ICT",
    kind: "scanner",
    color: "#e8bb7c",
    floor: 1,
  },
  {
    id: "s2",
    name: "Nadia",
    role: "Indikator",
    kind: "scanner",
    color: "#aacba8",
    floor: 1,
  },
  {
    id: "s3",
    name: "Rafi",
    role: "Volume",
    kind: "scanner",
    color: "#8db8bf",
    floor: 1,
  },
  {
    id: "s4",
    name: "Dara",
    role: "Derivatives",
    kind: "scanner",
    color: "#b5a1cc",
    floor: 1,
  },
  {
    id: "a1",
    name: "Atlas",
    role: "Workers AI",
    kind: "ai",
    color: "#edaa6f",
    floor: 1,
  },
  {
    id: "a2",
    name: "Gem",
    role: "Gemini",
    kind: "ai",
    color: "#81abc9",
    floor: 1,
  },
  {
    id: "a3",
    name: "Nova",
    role: "Groq",
    kind: "ai",
    color: "#cf92a7",
    floor: 1,
  },
  {
    id: "a4",
    name: "Orion",
    role: "OpenRouter",
    kind: "ai",
    color: "#c6bf90",
    floor: 1,
  },
  {
    id: "r1",
    name: "Bima",
    role: "Risk",
    kind: "rr",
    color: "#a8b9a0",
    floor: 2,
  },
  {
    id: "r2",
    name: "Alya",
    role: "Reward",
    kind: "rr",
    color: "#bbaaa4",
    floor: 2,
  },
  {
    id: "boss",
    name: "Direktur",
    role: "Persetujuan akhir",
    kind: "boss",
    color: "#ece2c8",
    floor: 2,
  },
  {
    id: "it",
    name: "Kevin",
    role: "Infrastructure",
    kind: "support",
    color: "#8096a4",
    floor: 1,
  },
  {
    id: "reception",
    name: "Sari",
    role: "Resepsionis",
    kind: "support",
    color: "#b58f73",
    floor: 1,
  },
] as const;
