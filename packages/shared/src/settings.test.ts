import { describe, expect, it } from "vitest";
import { defaultSettings, settingsSchema, type Candle } from "./domain";
import { scan } from "./engine";

describe("editable scanner strategies", () => {
  const candles: Candle[] = Array.from({ length: 80 }, (_, i) => ({
    time: i * 300,
    open: 100,
    high: 102,
    low: 98,
    close: 100,
    volume: 100,
  }));
  const configured = (strategy: Partial<typeof defaultSettings.strategy>) => ({
    ...defaultSettings,
    strategy: { ...defaultSettings.strategy, ...strategy },
  });
  it("loads previous settings with defaults for new fields", () => {
    const { staffNames: _names, strategy: _strategy, ...old } = defaultSettings;
    expect(settingsSchema.parse(old)).toEqual(defaultSettings);
  });
  it("normalizes names and rejects empty names and invalid strategy bounds", () => {
    expect(
      settingsSchema.parse({
        ...defaultSettings,
        staffNames: { s1: "  Dimas  " },
      }).staffNames.s1,
    ).toBe("Dimas");
    expect(
      settingsSchema.safeParse({ ...defaultSettings, staffNames: { s1: " " } })
        .success,
    ).toBe(false);
    expect(settingsSchema.safeParse(configured({ rsiLower: 55 })).success).toBe(
      false,
    );
    expect(
      settingsSchema.safeParse(configured({ volumeRatio: 0 })).success,
    ).toBe(false);
  });
  it("uses breakout and sweep modes independently", () => {
    const breakout = [
      ...candles.slice(0, -1),
      { ...candles[79], high: 105, close: 104 },
    ];
    expect(
      scan(breakout, undefined, configured({ smcMode: "breakout" }))[0]
        .direction,
    ).toBe("long");
    expect(
      scan(breakout, undefined, configured({ smcMode: "sweep" }))[0].direction,
    ).toBe("netral");
    const sweep = [
      ...candles.slice(0, -1),
      { ...candles[79], low: 96, close: 99 },
    ];
    expect(
      scan(sweep, undefined, configured({ smcMode: "sweep" }))[0].direction,
    ).toBe("long");
    expect(
      scan(sweep, undefined, configured({ smcMode: "breakout" }))[0].direction,
    ).toBe("netral");
  });
  it("applies volume and open-interest thresholds to actual scan results", () => {
    const input = [
      ...candles.slice(0, -1),
      { ...candles[79], close: 101, volume: 150 },
    ];
    expect(
      scan(input, undefined, configured({ volumeRatio: 1.2 }))[2].direction,
    ).toBe("long");
    expect(
      scan(input, undefined, configured({ volumeRatio: 2 }))[2].direction,
    ).toBe("netral");
    const derivatives = { funding: -0.001, oiChange: 0.02 };
    expect(
      scan(input, derivatives, configured({ oiChange: 0.01 }))[3].direction,
    ).toBe("long");
    expect(
      scan(input, derivatives, configured({ oiChange: 0.03 }))[3].direction,
    ).toBe("netral");
  });
  it("uses the RSI bounds in indicator confirmation", () => {
    const trend = candles.map((c, i) => ({
      ...c,
      close: 100 + i * 0.1 + Math.sin(i * 0.6),
    }));
    const loose = scan(trend, undefined, configured({ rsiUpper: 100 }))[1];
    expect(loose.direction).toBe("long");
    expect(
      scan(trend, undefined, configured({ rsiUpper: 51 }))[1].direction,
    ).toBe("netral");
  });
});
