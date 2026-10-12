import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callSlot } from "./ai";
import { credential } from "./data";
import type { Env, Slot } from "./env";
import {
  aiSettingsSchema,
  defaultSlots,
} from "../../../packages/shared/src/ai-config";
vi.mock("./data", () => ({ credential: vi.fn() }));
const context = {
  symbol: "BTCUSDT",
  tf: "H1",
  scanner: [],
  candles: [],
  source: "OKX",
  language: "en",
} as const;
const supplied = { ...context, scanner: [], candles: [] };
const valid = {
  direction: "long",
  confidence: 80,
  reason: "Closed candle evidence.",
  levels: { entry: [100, 101], sl: 99, tp: [104] },
  risks: [],
};
const reply = (value: unknown) =>
  Response.json({
    choices: [
      {
        message: {
          content: typeof value === "string" ? value : JSON.stringify(value),
        },
      },
    ],
  });
const slot: Slot = {
  provider: "Groq",
  model: "primary",
  fallbacks: [{ provider: "OpenRouter", model: "backup" }],
};
beforeEach(() => {
  vi.mocked(credential).mockResolvedValue("test-secret-never-log");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});
describe("AI slot fallback", () => {
  it("returns one valid primary vote without calling a fallback", async () => {
    const request = vi.fn().mockResolvedValue(reply(valid));
    vi.stubGlobal("fetch", request);
    const vote = await callSlot({} as Env, slot, supplied);
    expect(vote).toMatchObject({
      provider: "Groq",
      model: "primary",
      direction: "long",
      attempts: [{ provider: "Groq", model: "primary", status: "valid" }],
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("retries invalid JSON once then falls back with identical context and an audited result", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(reply("not JSON"))
      .mockResolvedValueOnce(reply({ ...valid, confidence: 101 }))
      .mockResolvedValueOnce(reply(valid));
    vi.stubGlobal("fetch", request);
    const vote = await callSlot({} as Env, slot, supplied);
    expect(vote.provider).toBe("OpenRouter");
    expect(vote.model).toBe("backup");
    expect(vote.attempts?.map((a) => a.status)).toEqual([
      "invalid_output",
      "invalid_output",
      "valid",
    ]);
    const prompts = request.mock.calls.map(
      (call) => JSON.parse(call[1].body).messages[0].content,
    );
    expect(new Set(prompts).size).toBe(1);
    expect(JSON.stringify(vote)).not.toContain("test-secret");
  });
  it("skips an unavailable binding without retrying and uses a fallback", async () => {
    const request = vi.fn().mockResolvedValue(reply(valid));
    vi.stubGlobal("fetch", request);
    const vote = await callSlot(
      {} as Env,
      { ...slot, provider: "Workers AI" },
      supplied,
    );
    expect(vote.attempts?.map((a) => a.status)).toEqual([
      "unavailable",
      "valid",
    ]);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("skips a disabled or missing credential without charging an HTTP request", async () => {
    vi.mocked(credential)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("test-secret");
    const request = vi.fn().mockResolvedValue(reply(valid));
    vi.stubGlobal("fetch", request);
    const vote = await callSlot({} as Env, slot, supplied);
    expect(vote.attempts?.map((a) => a.status)).toEqual([
      "unavailable",
      "valid",
    ]);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("bounds attempts and returns abstain without leaking exception details", async () => {
    const request = vi
      .fn()
      .mockRejectedValue(new Error("test-secret-never-log"));
    vi.stubGlobal("fetch", request);
    const vote = await callSlot({} as Env, slot, supplied);
    expect(vote.direction).toBe("abstain");
    expect(request).toHaveBeenCalledTimes(4);
    expect(vote.attempts).toHaveLength(4);
    expect(JSON.stringify(vote)).not.toContain("test-secret");
    expect(vote.reason).toContain("fallback");
  });
  it("forwards a deadline to Workers AI and records timeout before fallback", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    const run = vi.fn(
      (_model, _input, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener(
            "abort",
            () => reject(new Error("timeout")),
            { once: true },
          ),
        ),
    );
    const request = vi.fn().mockResolvedValue(reply(valid));
    vi.stubGlobal("fetch", request);
    const pending = callSlot(
      { AI: { run } } as unknown as Env,
      { ...slot, provider: "Workers AI" },
      supplied,
    );
    await vi.advanceTimersByTimeAsync(24001);
    const vote = await pending;
    expect(run).toHaveBeenCalledTimes(2);
    expect(vote.attempts?.map((a) => a.status)).toEqual([
      "timeout",
      "timeout",
      "valid",
    ]);
  });
  it("keeps four independent slots parallel, never generating additional votes", async () => {
    let active = 0;
    let peak = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        return reply(valid);
      }),
    );
    const votes = await Promise.all(
      Array.from({ length: 4 }, () => callSlot({} as Env, slot, supplied)),
    );
    expect(votes).toHaveLength(4);
    expect(peak).toBe(4);
  });
});
describe("AI settings validation", () => {
  it("upgrades existing primary-only slots with an empty fallback list", () => {
    expect(
      aiSettingsSchema.parse({
        slots: defaultSlots.map(({ fallbacks: _, ...primary }) => primary),
      }).slots,
    ).toEqual(defaultSlots);
  });
  it("rejects duplicates, excessive fallbacks, blank models and non-AI providers", () => {
    for (const invalid of [
      { ...slot, fallbacks: [{ provider: "Groq", model: "primary" }] },
      { ...slot, fallbacks: [slot, slot, slot] },
      { ...slot, fallbacks: [{ provider: "Groq", model: " " }] },
      { ...slot, fallbacks: [{ provider: "Discord", model: "x" }] },
    ])
      expect(
        aiSettingsSchema.safeParse({
          slots: [invalid, ...defaultSlots.slice(1)],
        }).success,
      ).toBe(false);
    expect(
      aiSettingsSchema.safeParse({ slots: defaultSlots.slice(1) }).success,
    ).toBe(false);
  });
});

it("passes only fresh gold COT to the AI and excludes stale positioning and BTC context", async () => {
  const request = vi
    .fn()
    .mockImplementation(() => Promise.resolve(reply(valid)));
  vi.stubGlobal("fetch", request);
  const cot = {
    status: "fresh" as const,
    checkedAt: Date.now(),
    warning: null,
    report: {
      reportDate: "2026-10-06",
      fetchedAt: Date.now(),
      source: "https://publicreporting.cftc.gov/resource/72hh-3qpy.json",
      contract: "088691" as const,
      openInterest: 1000,
      managedMoney: { long: 100, short: 40, spreading: 20, net: 60 },
      netChange: 10,
    },
  };
  await callSlot({} as Env, slot, { ...supplied, symbol: "XAUUSD", cot });
  let prompt = JSON.parse(request.mock.calls[0][1].body).messages[0].content;
  expect(prompt).toContain('"net":60');
  expect(prompt).toContain("never change scanner scores");
  await callSlot({} as Env, slot, {
    ...supplied,
    symbol: "XAUUSD",
    cot: { ...cot, status: "stale" },
  });
  prompt = JSON.parse(request.mock.calls[1][1].body).messages[0].content;
  expect(prompt).toContain('"report":null');
  expect(prompt).not.toContain('"net":60');
  await callSlot({} as Env, slot, { ...supplied, cot });
  prompt = JSON.parse(request.mock.calls[2][1].body).messages[0].content;
  expect(prompt).not.toContain('"cot":');
});
