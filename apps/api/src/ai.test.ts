import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callSlot } from "./ai";
import type { Env } from "./env";

const slot = {
  provider: "Workers AI",
  model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
};
const context = {
  symbol: "BTCUSDT",
  tf: "5m",
  scanner: [],
  candles: [],
  source: "fixture",
  language: "id",
} as const;
const output = {
  response: JSON.stringify({
    direction: "netral",
    confidence: 50,
    reason: "No consensus",
    levels: null,
    risks: [],
  }),
};

describe("Workers AI deadline and retry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const analyze = (run: ReturnType<typeof vi.fn>) =>
    callSlot({ AI: { run } } as unknown as Env, slot, {
      ...context,
      scanner: [],
      candles: [],
    });

  it("aborts and abstains after one retry even if the binding ignores cancellation", async () => {
    const signals: AbortSignal[] = [];
    const run = vi.fn((_model, _input, options) => {
      signals.push(options.signal);
      return new Promise(() => {});
    });
    const result = analyze(run);
    await vi.advanceTimersByTimeAsync(11999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(12000);
    expect(await result).toMatchObject({
      direction: "abstain",
      levels: null,
      latency: 24000,
    });
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("accepts a successful retry and clears the timer", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce(output);
    expect(await analyze(run)).toMatchObject({
      direction: "netral",
      reason: "No consensus",
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("ignores a late result from the timed-out attempt", async () => {
    let resolveLate!: (value: typeof output) => void;
    const run = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLate = resolve;
          }),
      )
      .mockResolvedValueOnce(output);
    const result = analyze(run);
    await vi.advanceTimersByTimeAsync(12000);
    expect(await result).toMatchObject({ direction: "netral", latency: 12000 });
    resolveLate({ response: "invalid late output" });
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("abstains after two malformed outputs without disclosing provider errors", async () => {
    const run = vi.fn().mockResolvedValue({ response: "invalid output" });
    expect(await analyze(run)).toMatchObject({
      direction: "abstain",
      levels: null,
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
