import { describe, expect, it } from "vitest";
import { MarketHub } from "./hub";
import type { Env } from "./env";
import { demoMeetings } from "../../../packages/shared/src/demo";
import { publicMeetingEvent } from "../../../packages/shared/src/stream";
class Client {
  messages: string[] = [];
  closed = false;
  serializeAttachment() {}
  deserializeAttachment() {
    return { expiresAt: Date.now() + 60000, tokenHash: "fixture-session" };
  }
  send(message: string) {
    this.messages.push(message);
  }
  close() {
    this.closed = true;
  }
}
function setup(authorized = true) {
  const pub = new Client(),
    priv = new Client(),
    state = {
      getWebSockets: () => [pub, priv],
      getTags: (client: Client) => (client === pub ? ["public"] : ["private"]),
    },
    statement = {
      bind: () => statement,
      first: async () =>
        authorized ? { token_hash: "fixture-session" } : null,
    },
    env = { DB: { prepare: () => statement } };
  return {
    hub: new MarketHub(
      state as unknown as DurableObjectState,
      env as unknown as Env,
    ),
    pub,
    priv,
  };
}
describe("Durable Object fanout", () => {
  it("sends details to an authorized private connection and safe metadata to public", async () => {
    const { hub, pub, priv } = setup();
    const meeting = demoMeetings[0];
    await hub.broadcast(publicMeetingEvent(meeting, Date.now()), {
      type: "meeting",
      meeting,
    });
    expect(JSON.parse(priv.messages[0])).toEqual({ type: "meeting", meeting });
    expect(pub.messages[0]).not.toMatch(
      /BTCUSDT|levels|votes|reason|long|67400/,
    );
  });
  it("closes a revoked private connection before sending private data", async () => {
    const { hub, pub, priv } = setup(false);
    await hub.broadcast(publicMeetingEvent(demoMeetings[0], Date.now()), {
      type: "meeting",
      meeting: demoMeetings[0],
    });
    expect(priv.closed).toBe(true);
    expect(priv.messages).toEqual([]);
    expect(pub.messages).toHaveLength(1);
  });
  it("provides the same authoritative mood category to both streams", async () => {
    const { hub, pub, priv } = setup();
    await hub.broadcast(
      { type: "mood", mood: "naik" },
      { type: "tick", quote: { symbol: "BTCUSDT", price: 100 } },
    );
    expect(JSON.parse(pub.messages[0])).toEqual({ type: "mood", mood: "naik" });
    expect(JSON.parse(priv.messages[0]).mood).toBe("naik");
  });
});
