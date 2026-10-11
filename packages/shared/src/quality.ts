export type RenderQuality = "low" | "medium" | "high";
export interface QualityState {
  level: RenderQuality;
  slowSeconds: number;
  fastSeconds: number;
  lastChange: number;
}
export function initialQuality(device: {
  cores: number;
  memory?: number;
  smallScreen: boolean;
  reducedMotion: boolean;
}): RenderQuality {
  return device.reducedMotion ||
    device.cores <= 4 ||
    (device.memory !== undefined && device.memory <= 4)
    ? "low"
    : device.smallScreen
      ? "medium"
      : "medium";
}
export function sampleQuality(
  state: QualityState,
  fps: number,
  seconds: number,
  now: number,
): QualityState {
  if (!Number.isFinite(fps) || fps <= 0 || seconds <= 0 || seconds > 5)
    return state;
  const slow = fps < 28 ? state.slowSeconds + seconds : 0,
    fast = fps > 55 ? state.fastSeconds + seconds : 0;
  if (now - state.lastChange < 15)
    return { ...state, slowSeconds: slow, fastSeconds: fast };
  if (slow >= 4 && state.level !== "low")
    return {
      level: state.level === "high" ? "medium" : "low",
      slowSeconds: 0,
      fastSeconds: 0,
      lastChange: now,
    };
  if (fast >= 12 && state.level !== "high")
    return {
      level: state.level === "low" ? "medium" : "high",
      slowSeconds: 0,
      fastSeconds: 0,
      lastChange: now,
    };
  return { ...state, slowSeconds: slow, fastSeconds: fast };
}
