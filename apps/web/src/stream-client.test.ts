import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectStream, type SocketLike } from "./stream-client";
class FakeSocket implements SocketLike {
  onopen: SocketLike["onopen"] = null;
  onclose: SocketLike["onclose"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onerror: SocketLike["onerror"] = null;
  closed = false;
  close() {
    this.closed = true;
  }
  lost(code = 1006) {
    this.closed = true;
    this.onclose?.({ code } as CloseEvent);
  }
  open() {
    this.onopen?.({} as Event);
  }
  message(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }
}
describe("reconnecting client transport", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const setup = () => {
    const sockets: FakeSocket[] = [],
      create = vi.fn(() => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      }),
      message = vi.fn(),
      state = vi.fn(),
      unauthorized = vi.fn(),
      stop = connectStream(
        "ws://fixture",
        { message, state, unauthorized },
        create,
      );
    return { sockets, create, message, state, unauthorized, stop };
  };
  it("parses a valid packet and ignores malformed data", () => {
    const t = setup();
    t.sockets[0].open();
    t.sockets[0].message('{"type":"refresh"}');
    t.sockets[0].message("bad-json");
    expect(t.message).toHaveBeenCalledTimes(1);
    expect(t.state).toHaveBeenLastCalledWith("live");
    t.stop();
  });
  it("reconnects with exponential backoff", () => {
    const t = setup();
    t.sockets[0].lost();
    vi.advanceTimersByTime(999);
    expect(t.create).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(t.create).toHaveBeenCalledTimes(2);
    t.sockets[1].lost();
    vi.advanceTimersByTime(1999);
    expect(t.create).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(t.create).toHaveBeenCalledTimes(3);
    t.stop();
  });
  it("resets backoff on a successful connection", () => {
    const t = setup();
    t.sockets[0].lost();
    vi.advanceTimersByTime(1000);
    t.sockets[1].open();
    t.sockets[1].lost();
    vi.advanceTimersByTime(1000);
    expect(t.create).toHaveBeenCalledTimes(3);
    t.stop();
  });
  it("cleans up retries and closes on unmount", () => {
    const t = setup();
    t.sockets[0].lost();
    t.stop();
    vi.advanceTimersByTime(20000);
    expect(t.create).toHaveBeenCalledTimes(1);
    expect(t.sockets[0].closed).toBe(true);
    const active = setup();
    active.stop();
    expect(active.sockets[0].closed).toBe(true);
  });
  it("does not reconnect a revoked session", () => {
    const t = setup();
    t.sockets[0].lost(1008);
    vi.advanceTimersByTime(20000);
    expect(t.unauthorized).toHaveBeenCalledTimes(1);
    expect(t.create).toHaveBeenCalledTimes(1);
    t.stop();
  });
  it("renews an expired public stream without authentication", () => {
    const sockets: FakeSocket[] = [];
    const stop = connectStream("ws://public", { message: () => {} }, () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    });
    sockets[0].lost(1008);
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    stop();
  });
  it("ignores late frames from a replaced socket", () => {
    const t = setup();
    t.sockets[0].lost();
    vi.advanceTimersByTime(1000);
    t.sockets[0].message('{"type":"stale"}');
    t.sockets[1].message('{"type":"fresh"}');
    expect(t.message).toHaveBeenCalledTimes(1);
    expect(t.message).toHaveBeenCalledWith({ type: "fresh" });
    t.stop();
  });
  it("reports a failed handshake as offline and retries", () => {
    const sockets: FakeSocket[] = [],
      state = vi.fn();
    let count = 0;
    const stop = connectStream(
      "ws://fixture",
      { message: () => {}, state },
      () => {
        if (count++ === 0) throw new Error("fixture failure");
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    );
    expect(state).toHaveBeenLastCalledWith("offline");
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(1);
    stop();
  });
});
