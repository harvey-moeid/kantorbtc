import { describe, expect, it } from "vitest";
import { demoMeetings, demoQuotes } from "./demo";
import {
  parsePrivateStream,
  parsePublicStream,
  publicMeetingEvent,
} from "./stream";
describe("stream contract and privacy", () => {
  it("publishes only allowlisted public fields", () => {
    const result = publicMeetingEvent(demoMeetings[0], 1000);
    expect(Object.keys(result).sort()).toEqual([
      "aiTriggered",
      "at",
      "meeting",
      "meetingId",
      "type",
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /BTCUSDT|long|67400|levels|votes|reason/,
    );
  });
  it("removes unexpected private data from public packets", () =>
    expect(
      parsePublicStream({
        type: "mood",
        mood: "naik",
        price: 67400,
        votes: demoMeetings[0].votes,
      }),
    ).toEqual({ type: "mood", mood: "naik" }));
  it("accepts a complete private meeting record", () =>
    expect(
      parsePrivateStream({
        type: "meeting",
        meeting: demoMeetings[0],
        at: 1000,
      }),
    ).toMatchObject({
      type: "meeting",
      event: {
        id: demoMeetings[0].id,
        details: demoMeetings[0],
        aiTriggered: true,
      },
    }));
  it("rejects malformed or unknown events", () => {
    expect(
      parsePrivateStream({
        type: "tick",
        quote: { symbol: "BTCUSDT", price: -1 },
      }),
    ).toBe(null);
    expect(parsePublicStream({ type: "mood", mood: "invented" })).toBe(null);
    expect(parsePrivateStream({ type: "execute_order" })).toBe(null);
  });
  it("preserves honest quote source and status", () =>
    expect(parsePrivateStream({ type: "tick", quote: demoQuotes[0] })).toEqual({
      type: "tick",
      quote: demoQuotes[0],
    }));
});
