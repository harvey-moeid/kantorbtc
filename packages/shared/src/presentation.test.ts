import { describe, expect, it } from "vitest";
import { demoMeetings } from "./demo";
import {
  presentationAt,
  presentationProgress,
  type MeetingEvent,
} from "./presentation";
const approved: MeetingEvent = {
  id: demoMeetings[0].id,
  phase: "approved",
  at: 0,
  aiTriggered: true,
  details: demoMeetings[0],
};
describe("meeting narration from recorded results", () => {
  it.each([
    [0, "scanner_travel"],
    [12, "scanner_speaking"],
    [25, "ai_travel"],
    [32, "ai_speaking"],
    [54, "rr_travel"],
    [59, "rr_speaking"],
    [65, "director"],
    [72, "returning"],
    [80, "idle"],
  ])("shows stage at %s seconds", (seconds, stage) =>
    expect(presentationAt(approved, Number(seconds)).stage).toBe(stage),
  );
  it("scanner alone travels first", () => {
    const f = presentationAt(approved, 5);
    expect(presentationProgress(f, 0)).toBe(0.5);
    expect(presentationProgress(f, 4)).toBe(0);
    expect(presentationProgress(f, 10)).toBe(0);
  });
  it("does not move meetings to floor 1", () =>
    expect(presentationAt(approved, 15).floor).toBe("2"));
  it.each([
    [32, 4],
    [37, 5],
    [42, 6],
    [47, 7],
  ])("presents each AI in sequence at %s", (time, index) =>
    expect(presentationAt(approved, time).speaker).toBe(index),
  );
  it("uses the existing AI reason", () =>
    expect(presentationAt(approved, 32).message).toContain(
      demoMeetings[0].votes[0].reason,
    ));
  it("waits instead of inventing votes", () => {
    const frame = presentationAt(
      {
        ...approved,
        phase: "ai",
        details: { ...demoMeetings[0], phase: "ai", votes: [] },
      },
      45,
    );
    expect(frame.stage).toBe("ai_waiting");
    expect(frame.waitAt).toBe(32);
    expect(frame.speaker).toBe(null);
  });
  it("waits for an actual final decision", () => {
    const frame = presentationAt({ ...approved, phase: "rr" }, 66);
    expect(frame.waitAt).toBe(63);
    expect(frame.stage).toBe("ai_waiting");
  });
  it("skips all AI/RR stages when scanner consensus was not reached", () => {
    const event: MeetingEvent = {
      ...approved,
      phase: "rejected",
      aiTriggered: false,
      details: demoMeetings[2],
    };
    expect(presentationAt(event, 25).stage).toBe("returning");
    expect(presentationAt(event, 34).complete).toBe(true);
  });
  it("returns participants to work", () => {
    const f = presentationAt(approved, 80);
    expect(f.complete).toBe(true);
    expect(f.scannerProgress + f.aiProgress + f.rrProgress).toBe(0);
  });
  it("never exposes votes, price levels, evidence or reasons to public viewers", () => {
    for (const time of [15, 32, 42, 59, 65]) {
      const f = presentationAt(approved, time, true);
      expect(f.message).not.toMatch(/LONG|SHORT|674|682/);
      expect(f.message).not.toContain(demoMeetings[0].votes[0].reason);
    }
  });
  it("does not mutate the backend decision", () => {
    const original = structuredClone(approved);
    for (let time = 0; time < 90; time++) presentationAt(approved, time);
    expect(approved).toEqual(original);
  });
  it("supports English narration", () =>
    expect(presentationAt(approved, 65, false, "en").title).toBe(
      "Final approval",
    ));
});
