import { describe, expect, it } from "vitest";
import { initialQuality, sampleQuality, type QualityState } from "./quality";
const medium: QualityState = {
  level: "medium",
  slowSeconds: 0,
  fastSeconds: 0,
  lastChange: -15,
};
describe("adaptive quality policy", () => {
  it("starts low on limited hardware or reduced motion", () => {
    expect(
      initialQuality({ cores: 2, smallScreen: true, reducedMotion: false }),
    ).toBe("low");
    expect(
      initialQuality({
        cores: 8,
        memory: 8,
        smallScreen: false,
        reducedMotion: true,
      }),
    ).toBe("low");
  });
  it("does not assume high quality before measuring frames", () =>
    expect(
      initialQuality({
        cores: 16,
        memory: 16,
        smallScreen: false,
        reducedMotion: false,
      }),
    ).toBe("medium"));
  it("lowers quality after sustained slow frames", () => {
    const first = sampleQuality(medium, 22, 2, 2);
    expect(first.level).toBe("medium");
    expect(sampleQuality(first, 23, 2, 4).level).toBe("low");
  });
  it("raises quality after sustained fast frames", () => {
    let state = medium;
    for (let t = 2; t <= 12; t += 2) state = sampleQuality(state, 60, 2, t);
    expect(state.level).toBe("high");
  });
  it("does not oscillate during the cooldown", () =>
    expect(
      sampleQuality({ ...medium, slowSeconds: 4, lastChange: 10 }, 10, 2, 12)
        .level,
    ).toBe("medium"));
  it("ignores invalid samples and long background gaps", () => {
    expect(sampleQuality(medium, 0, 2, 20)).toBe(medium);
    expect(sampleQuality(medium, 20, 20, 20)).toBe(medium);
  });
  it("never lowers below Low", () =>
    expect(
      sampleQuality({ ...medium, level: "low", slowSeconds: 4 }, 10, 2, 20)
        .level,
    ).toBe("low"));
});
