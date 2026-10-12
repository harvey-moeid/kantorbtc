import { describe, expect, it } from "vitest";
import { signalNotification, priceNotification } from "./notification-copy";
import { demoSignals, demoQuotes } from "./demo";
describe("localized informational Discord messages", () => {
  it("includes levels, worst-entry RR, TP1 closure and disclaimer in English", () => {
    const message = signalNotification(demoSignals[0], "en");
    expect(message).toContain("SL");
    expect(message).toContain("TP1");
    expect(message).toContain("RR TP1");
    expect(message).toContain("closes at TP1");
    expect(message).toContain("Not financial advice. No order execution.");
    expect(message).not.toContain("Bukan nasihat");
  });
  it("labels the scanner tie-breaker and gold market pause", () => {
    const message = signalNotification(
      {
        ...demoSignals[0],
        symbol: "XAUUSD",
        tieBreaker: true,
        entryClock: {
          remainingMs: 900000,
          at: 0,
          state: "unknown",
          knownUntil: 0,
        },
      },
      "id",
    );
    expect(message).toContain("scanner_tie_breaker");
    expect(message).toContain("Durasi emas dijeda");
    expect(message).toContain("Sinyal selesai pada TP1");
  });
  it("localizes price crossing without adding execution or mention directives", () => {
    expect(priceNotification(demoQuotes[0], 100, "en")).toContain(
      "price crossed 100",
    );
    expect(priceNotification(demoQuotes[0], 100, "id")).toContain(
      "harga melintasi 100",
    );
    expect(priceNotification(demoQuotes[0], 100, "en")).not.toContain(
      "@everyone",
    );
  });
});
