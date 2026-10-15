import {
  defaultSettings,
  type Candle,
  type Direction,
  type Levels,
  type Scan,
  type Settings,
  type Signal,
  type Symbol,
  type Timeframe,
  type Vote,
} from "./domain";
export function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  return values.reduce<number[]>((a, n) => {
    a.push(a.length ? n * k + a[a.length - 1] * (1 - k) : n);
    return a;
  }, []);
}
export function rsi(values: number[], period = 14): number[] {
  let gain = 0,
    loss = 0;
  const result = values.map(() => 50);
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (i <= period) {
      gain += Math.max(0, diff) / period;
      loss += Math.max(0, -diff) / period;
    } else {
      gain = (gain * (period - 1) + Math.max(0, diff)) / period;
      loss = (loss * (period - 1) + Math.max(0, -diff)) / period;
    }
    if (i >= period)
      result[i] =
        loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
  }
  return result;
}
export function atr(candles: Candle[], period = 14): number {
  const ranges = candles
    .slice(-period)
    .map((c, i, a) =>
      Math.max(
        c.high - c.low,
        Math.abs(c.high - (a[i - 1]?.close ?? c.open)),
        Math.abs(c.low - (a[i - 1]?.close ?? c.open)),
      ),
    );
  return ranges.reduce((a, b) => a + b, 0) / (ranges.length || 1);
}
export function bollinger(
  values: number[],
  period = 20,
): { middle: number; upper: number; lower: number }[] {
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - period + 1), i + 1),
      middle = w.reduce((a, b) => a + b, 0) / w.length,
      sd = Math.sqrt(w.reduce((a, b) => a + (b - middle) ** 2, 0) / w.length);
    return { middle, upper: middle + 2 * sd, lower: middle - 2 * sd };
  });
}
export function macd(values: number[]) {
  const fast = ema(values, 12),
    slow = ema(values, 26),
    line = fast.map((v, i) => v - slow[i]),
    signal = ema(line, 9);
  return { line, signal, histogram: line.map((v, i) => v - signal[i]) };
}
export interface Derivatives {
  funding: number;
  oiChange: number;
}
export function scan(
  candles: Candle[],
  derivatives?: Derivatives,
  settings = defaultSettings,
): Scan[] {
  if (
    candles.length <
    Math.max(settings.emaSlow, settings.rsiPeriod + 1, 2 * settings.swing + 1)
  )
    return (["smc", "indicators", "volume", "derivatives"] as const).map(
      (group) => ({
        group,
        direction: "abstain",
        score: 0,
        evidence: ["Historis belum cukup."],
      }),
    );
  const strategy = settings.strategy ?? defaultSettings.strategy;
  const last = candles.at(-1)!,
    close = candles.map((c) => c.close),
    fast = ema(close, settings.emaFast).at(-1)!,
    slow = ema(close, settings.emaSlow).at(-1)!,
    strength = rsi(close, settings.rsiPeriod).at(-1)!,
    volatility = atr(candles);
  const prev = candles.slice(-settings.swing * 2 - 1, -1),
    swingHigh = Math.max(...prev.map((c) => c.high)),
    swingLow = Math.min(...prev.map((c) => c.low));
  const smc: Direction =
    strategy.smcMode !== "sweep" && last.close > swingHigh
      ? "long"
      : strategy.smcMode !== "sweep" && last.close < swingLow
        ? "short"
        : strategy.smcMode !== "breakout" &&
            last.low < swingLow &&
            last.close > swingLow
          ? "long"
          : strategy.smcMode !== "breakout" &&
              last.high > swingHigh &&
              last.close < swingHigh
            ? "short"
            : "netral";
  const momentum = macd(close).histogram.at(-1)!;
  const indicator: Direction =
    fast > slow && strength > 50 && strength < strategy.rsiUpper && momentum > 0
      ? "long"
      : fast < slow &&
          strength < 50 &&
          strength > strategy.rsiLower &&
          momentum < 0
        ? "short"
        : "netral";
  const averageVolume = prev.reduce((a, c) => a + c.volume, 0) / prev.length,
    ratio = averageVolume > 0 ? last.volume / averageVolume : 0;
  const scans: Scan[] = [
    {
      group: "smc",
      direction: smc,
      score: smc === "netral" ? 42 : 75,
      evidence: [
        smc === "netral"
          ? "Harga masih dalam rentang swing."
          : last.close > swingHigh || last.close < swingLow
            ? "Break of structure pada candle close."
            : "Liquidity sweep dan kembali ke rentang.",
        `Swing ${settings.swing} candle; definisi awal yang dapat dikonfigurasi.`,
      ],
    },
    {
      group: "indicators",
      direction: indicator,
      score:
        indicator === "netral"
          ? 40
          : Math.min(95, 60 + (Math.abs(fast - slow) / (volatility || 1)) * 10),
      evidence: [
        `EMA ${settings.emaFast}/${settings.emaSlow}: ${fast > slow ? "bullish" : "bearish"}`,
        `RSI ${settings.rsiPeriod}: ${strength.toFixed(1)}`,
        `MACD histogram: ${momentum.toFixed(2)}; ATR 14: ${volatility.toFixed(2)}`,
      ],
    },
    {
      group: "volume",
      direction:
        averageVolume === 0
          ? "abstain"
          : ratio > strategy.volumeRatio
            ? last.close > last.open
              ? "long"
              : "short"
            : "netral",
      score: Math.min(95, Math.round(ratio * 50)),
      evidence: [
        averageVolume === 0
          ? "Volume tidak tersedia; abstain."
          : `Volume ${ratio.toFixed(2)}× rata-rata swing.`,
      ],
    },
    {
      group: "derivatives",
      direction: !derivatives
        ? "abstain"
        : derivatives.oiChange > strategy.oiChange
          ? derivatives.funding < 0
            ? "long"
            : "short"
          : "netral",
      score: derivatives
        ? Math.min(95, 60 + Math.abs(derivatives.oiChange) * 100)
        : 0,
      evidence: [
        derivatives
          ? `Funding ${(derivatives.funding * 100).toFixed(4)}%; perubahan OI ${(derivatives.oiChange * 100).toFixed(2)}%.`
          : "Funding/OI belum tersedia. Kelompok abstain.",
      ],
    },
  ];
  return scans.map((s) =>
    settings.enabled[s.group]
      ? s
      : {
          ...s,
          direction: "abstain",
          score: 0,
          evidence: ["Kelompok dinonaktifkan."],
        },
  );
}
export function scannerWinner(
  scans: Scan[],
  settings: Settings,
  tie = false,
): "long" | "short" | null {
  const valid = scans.filter(
    (s) => s.score >= settings.thresholds[s.group] && settings.enabled[s.group],
  );
  const long = valid.filter((s) => s.direction === "long"),
    short = valid.filter((s) => s.direction === "short");
  const winner =
      long.length > short.length
        ? long
        : short.length > long.length
          ? short
          : null,
    loser = winner === long ? short : long;
  if (!winner || winner.length < settings.minGroups) return null;
  if (
    tie &&
    (settings.tieMargin === null ||
      winner.reduce((a, s) => a + s.score, 0) -
        loser.reduce((a, s) => a + s.score, 0) <
        settings.tieMargin)
  )
    return null;
  return winner === long ? "long" : "short";
}
export function scannerCandidates(
  scans: Scan[],
  settings: Settings,
): ("long" | "short")[] {
  return (["long", "short"] as const).filter(
    (direction) =>
      scans.filter(
        (s) =>
          s.direction === direction &&
          settings.enabled[s.group] &&
          s.score >= settings.thresholds[s.group],
      ).length >= settings.minGroups,
  );
}
export function validateLevels(
  levels: Levels,
  direction: "long" | "short",
): { valid: boolean; rr: number; reason: string } {
  const [low, high] = levels.entry;
  if (
    ![low, high, levels.sl, ...levels.tp].every(
      (n) => Number.isFinite(n) && n > 0,
    ) ||
    low > high ||
    !levels.tp.length ||
    levels.tp.length > 3
  )
    return {
      valid: false,
      rr: 0,
      reason: "Level atau zona entry tidak valid.",
    };
  const entry = direction === "long" ? high : low,
    risk = direction === "long" ? entry - levels.sl : levels.sl - entry;
  const valid =
    risk > 0 &&
    (direction === "long"
      ? levels.sl < low &&
        levels.tp.every((t, i) => t > high && (!i || t > levels.tp[i - 1]))
      : levels.sl > high &&
        levels.tp.every((t, i) => t < low && (!i || t < levels.tp[i - 1])));
  return {
    valid,
    rr: valid ? Math.abs(levels.tp[0] - entry) / risk : 0,
    reason: valid
      ? "Level valid; RR dihitung dari entry terburuk ke TP1."
      : "SL/TP bertentangan dengan arah sinyal.",
  };
}
const median = (n: number[]) => {
  const s = [...n].sort((a, b) => a - b);
  return (s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2;
};
export function decide(
  votes: Vote[],
  scanner: Scan[],
  settings = defaultSettings,
): {
  approved: boolean;
  direction: "long" | "short" | null;
  levels: Levels | null;
  rr: number;
  confidence: number;
  tieBreaker: boolean;
  reason: string;
} {
  const rejected = (reason: string) => ({
    approved: false,
    direction: null,
    levels: null,
    rr: 0,
    confidence: 0,
    tieBreaker: false,
    reason,
  });
  if (votes.length !== 4)
    return rejected("Meeting harus memiliki tepat empat slot AI.");
  const valid = votes.filter((v) => v.direction !== "abstain");
  if (valid.length < 3)
    return rejected("Tidak kuorum: kurang dari tiga suara valid.");
  const longs = valid.filter((v) => v.direction === "long"),
    shorts = valid.filter((v) => v.direction === "short");
  let direction: "long" | "short" | null =
      longs.length >= 3 ? "long" : shorts.length >= 3 ? "short" : null,
    tieBreaker = false;
  if (!direction && longs.length === 2 && shorts.length === 2) {
    direction = scannerWinner(scanner, settings, true);
    tieBreaker = !!direction;
  }
  if (!direction)
    return rejected(
      "Tanpa mayoritas AI; tie-breaker scanner belum memenuhi syarat atau belum dikonfigurasi.",
    );
  const winners = valid.filter((v) => v.direction === direction);
  if (
    winners.some(
      (v) => !v.levels || !validateLevels(v.levels, direction!).valid,
    )
  )
    return rejected("Level pada suara mayoritas tidak valid.");
  const targetCount = Math.min(...winners.map((v) => v.levels!.tp.length));
  const levels: Levels = {
    entry: [
      median(winners.map((v) => v.levels!.entry[0])),
      median(winners.map((v) => v.levels!.entry[1])),
    ],
    sl: median(winners.map((v) => v.levels!.sl)),
    tp: Array.from({ length: targetCount }, (_, i) =>
      median(winners.map((v) => v.levels!.tp[i])),
    ),
  };
  const check = validateLevels(levels, direction);
  if (!check.valid || check.rr < settings.minRR)
    return rejected(
      `Ditolak bos: RR TP1 ${check.rr.toFixed(2)} di bawah ${settings.minRR}, atau level tidak valid.`,
    );
  return {
    approved: true,
    direction,
    levels,
    rr: check.rr,
    confidence: winners.reduce((s, v) => s + v.confidence, 0) / winners.length,
    tieBreaker,
    reason: tieBreaker
      ? "Disetujui melalui scanner_tie_breaker; RR TP1 valid."
      : "Mayoritas AI dan RR TP1 memenuhi aturan bos.",
  };
}
export function advanceSignal(
  signal: Signal,
  price: number,
  now: number,
): Signal {
  if (!["menunggu_entry", "aktif"].includes(signal.status)) return signal;
  if (signal.expiresAt !== null && now >= signal.expiresAt)
    return { ...signal, status: "kedaluwarsa" };
  const [lo, hi] = signal.levels.entry;
  if (signal.status === "menunggu_entry")
    return price >= lo && price <= hi
      ? {
          ...signal,
          status: "aktif",
          entryTouchedAt: now,
          entryTouchedPrice: price,
        }
      : signal;
  if (
    signal.direction === "long"
      ? price <= signal.levels.sl
      : price >= signal.levels.sl
  )
    return { ...signal, status: "stop_loss" };
  const hitTargets = signal.levels.tp
    .map((t, i) =>
      (signal.direction === "long" ? price >= t : price <= t) ? i + 1 : 0,
    )
    .filter(Boolean);
  const hits = [...new Set([...signal.hitTargets, ...hitTargets])];
  return {
    ...signal,
    hitTargets: hits,
    status:
      hits.length === signal.levels.tp.length ? "target_tercapai" : "aktif",
  };
}
export function makeSignal(
  symbol: Symbol,
  tf: Timeframe,
  votes: Vote[],
  scanner: Scan[],
  settings: Settings,
  source: string,
  now: number,
): Signal | null {
  const result = decide(votes, scanner, settings);
  if (
    !result.approved ||
    !result.direction ||
    !result.levels ||
    settings.ttl[tf] === null
  )
    return null;
  return {
    id: crypto.randomUUID(),
    symbol,
    tf,
    direction: result.direction,
    confidence: result.confidence,
    levels: result.levels,
    rr: result.rr,
    status: "menunggu_entry",
    createdAt: now,
    expiresAt: now + settings.ttl[tf]! * 1000,
    source,
    votes,
    scanner,
    tieBreaker: result.tieBreaker,
    hitTargets: [],
    settingsVersion: 1,
  };
}
