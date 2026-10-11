import {
  type Candle,
  type Meeting,
  type Quote,
  type Scan,
  type Signal,
  type Symbol,
  type Timeframe,
  type Vote,
  seconds,
} from "./domain";
// Fixed, reproducible fixtures. Never presented as live exchange data or real AI output.
export const demoTime = Date.UTC(2026, 9, 11, 8, 45);
export function demoCandles(
  symbol: Symbol,
  tf: Timeframe,
  count = 180,
): Candle[] {
  let seed = symbol === "BTCUSDT" ? 83 : 27;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const base = symbol === "BTCUSDT" ? 67482.5 : 2643.8,
    amplitude = base * 0.0019,
    end = Math.floor(demoTime / 1000 / seconds[tf]) * seconds[tf];
  let close = base - amplitude * 4;
  const candles = Array.from({ length: count }, (_, i) => {
    const open = close;
    close =
      open +
      (random() - 0.45) * amplitude * 0.75 +
      Math.sin(i / 14) * amplitude * 0.1;
    return {
      time: end - (count - 1 - i) * seconds[tf],
      open,
      close,
      high: Math.max(open, close) + random() * amplitude * 0.45,
      low: Math.min(open, close) - random() * amplitude * 0.45,
      volume: random() * 130 + 30,
    };
  });
  const offset = base - candles.at(-1)!.close;
  return candles.map((c) => ({
    ...c,
    open: c.open + offset,
    high: c.high + offset,
    low: c.low + offset,
    close: c.close + offset,
  }));
}
export const demoScanner: Scan[] = [
  {
    group: "smc",
    direction: "long",
    score: 84,
    evidence: [
      "BOS bullish di atas swing high terakhir.",
      "Harga kembali ke zona discount; FVG masih terbuka.",
    ],
  },
  {
    group: "indicators",
    direction: "long",
    score: 78,
    evidence: [
      "EMA 20 berada di atas EMA 50.",
      "RSI 58,4; momentum positif tanpa overbought.",
    ],
  },
  {
    group: "volume",
    direction: "long",
    score: 72,
    evidence: [
      "Volume candle 1,6× rata-rata.",
      "Tekanan beli meningkat di area demand.",
    ],
  },
  {
    group: "derivatives",
    direction: "netral",
    score: 52,
    evidence: ["Fixture funding +0,008%.", "OI belum mengonfirmasi arah."],
  },
];
const levels = {
  entry: [67400, 67480] as [number, number],
  sl: 67080,
  tp: [68280, 68900, 69600],
};
export const demoVotes: Vote[] = [
  {
    provider: "Workers AI",
    model: "Llama 3.3",
    direction: "long",
    confidence: 86,
    reason:
      "Struktur bullish dan demand yang belum teruji mendukung kelanjutan. Entry pada retest menjaga risiko tetap terukur.",
    levels,
    risks: ["Waspadai liquidity sweep di bawah support."],
    latency: 1240,
  },
  {
    provider: "Gemini",
    model: "Gemini Flash",
    direction: "long",
    confidence: 82,
    reason:
      "Konfluensi EMA dan volume mendukung bias long. Tunggu harga masuk ke zona, hindari mengejar breakout.",
    levels,
    risks: ["Momentum dapat melemah dekat resistance."],
    latency: 980,
  },
  {
    provider: "Groq",
    model: "Llama 3.3",
    direction: "long",
    confidence: 84,
    reason:
      "Tiga kelompok scanner memiliki bias yang konsisten. Risiko invalidasi terdefinisi di bawah swing low.",
    levels,
    risks: ["Funding masih netral."],
    latency: 520,
  },
  {
    provider: "OpenRouter",
    model: "Mistral Small",
    direction: "netral",
    confidence: 65,
    reason:
      "Menunggu konfirmasi candle H1. Divergensi volume di resistance membuat entry agresif kurang menarik.",
    levels: null,
    risks: ["Breakout palsu."],
    latency: 1530,
  },
];
export const demoSignals: Signal[] = [
  {
    id: "DEMO-BTC-001",
    symbol: "BTCUSDT",
    tf: "H1",
    direction: "long",
    confidence: 84,
    levels,
    rr: 2,
    status: "menunggu_entry",
    createdAt: demoTime - 900000,
    expiresAt: demoTime + 21600000,
    source: "OKX · fixture",
    votes: demoVotes,
    scanner: demoScanner,
    tieBreaker: false,
    hitTargets: [],
    settingsVersion: 1,
  },
  {
    id: "DEMO-XAU-002",
    symbol: "XAUUSD",
    tf: "15m",
    direction: "short",
    confidence: 79,
    levels: { entry: [2646, 2648], sl: 2654, tp: [2634, 2628] },
    rr: 1.5,
    status: "aktif",
    createdAt: demoTime - 1800000,
    expiresAt: demoTime + 3600000,
    source: "OANDA · fixture",
    votes: demoVotes.map((v) => ({
      ...v,
      direction: "short",
      levels: { entry: [2646, 2648], sl: 2654, tp: [2634, 2628] },
    })),
    scanner: demoScanner.map((s) => ({ ...s, direction: "short" })),
    tieBreaker: false,
    entryTouchedAt: demoTime - 1200000,
    entryTouchedPrice: 2647,
    hitTargets: [],
    settingsVersion: 1,
  },
  {
    id: "DEMO-BTC-003",
    symbol: "BTCUSDT",
    tf: "15m",
    direction: "long",
    confidence: 81,
    levels: { entry: [66120, 66200], sl: 65800, tp: [66800] },
    rr: 1.5,
    status: "target_tercapai",
    createdAt: demoTime - 10800000,
    expiresAt: demoTime - 5400000,
    source: "OKX · fixture",
    votes: demoVotes,
    scanner: demoScanner,
    tieBreaker: false,
    entryTouchedAt: demoTime - 10000000,
    entryTouchedPrice: 66180,
    hitTargets: [1],
    settingsVersion: 1,
  },
];
export const demoQuotes: Quote[] = [
  {
    symbol: "BTCUSDT",
    price: 67482.5,
    change: 2.34,
    source: "OKX",
    status: "demo",
    at: demoTime,
  },
  {
    symbol: "XAUUSD",
    price: 2643.8,
    change: -0.42,
    source: "OANDA",
    status: "demo",
    at: demoTime,
  },
];
export const demoMeetings: Meeting[] = [
  {
    id: "DEMO-M-001",
    symbol: "BTCUSDT",
    tf: "H1",
    at: demoTime - 900000,
    phase: "approved",
    scanner: demoScanner,
    votes: demoVotes,
    reason: "3 dari 4 AI memilih LONG. RR TP1 2,00 memenuhi minimum 1,00.",
    signalId: demoSignals[0].id,
  },
  {
    id: "DEMO-M-002",
    symbol: "XAUUSD",
    tf: "15m",
    at: demoTime - 1800000,
    phase: "approved",
    scanner: demoSignals[1].scanner,
    votes: demoSignals[1].votes,
    reason: "4 dari 4 AI memilih SHORT. RR TP1 1,50.",
    signalId: demoSignals[1].id,
  },
  {
    id: "DEMO-M-003",
    symbol: "BTCUSDT",
    tf: "5m",
    at: demoTime - 2100000,
    phase: "rejected",
    scanner: demoScanner.map((s) => ({ ...s, direction: "netral" })),
    votes: [],
    reason: "Konsensus scanner tidak tercapai. Tidak ada panggilan AI.",
  },
];
