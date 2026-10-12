import type { Quote, Signal } from "./domain";
export function signalNotification(
  signal: Signal,
  language: "id" | "en",
): string {
  const en = language === "en";
  const entry =
    signal.levels.entry[0] === signal.levels.entry[1]
      ? String(signal.levels.entry[0])
      : signal.levels.entry.join(" – ");
  return `${signal.symbol} ${signal.tf} ${signal.direction.toUpperCase()}\nEntry ${entry} | SL ${signal.levels.sl}\n${signal.levels.tp.map((target, i) => `TP${i + 1} ${target}`).join(" | ")}\nRR TP1 1:${signal.rr.toFixed(2)} · ${signal.source}\n${signal.tieBreaker ? "scanner_tie_breaker" : en ? "AI majority" : "Mayoritas AI"}\n${en ? "Signal closes at TP1; additional targets are informational. Entry countdown stops after entry." : "Sinyal selesai pada TP1; target tambahan bersifat informasi. Hitung mundur berhenti setelah entry."}${signal.entryClock ? (en ? " Gold countdown pauses when the market is closed or provider status is unknown." : " Durasi emas dijeda saat pasar tutup atau status provider tidak diketahui.") : ""}\n${en ? "Not financial advice. No order execution." : "Bukan nasihat keuangan. Tidak ada eksekusi order."}`;
}
export function priceNotification(
  quote: Quote,
  level: number,
  language: "id" | "en",
): string {
  return language === "en"
    ? `${quote.symbol}: price crossed ${level}. Source ${quote.source}. Not financial advice.`
    : `${quote.symbol}: harga melintasi ${level}. Sumber ${quote.source}. Bukan nasihat keuangan.`;
}
