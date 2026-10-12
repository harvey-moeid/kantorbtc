import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import {
  sampleQuality,
  type QualityState,
  type RenderQuality,
} from "../../../../packages/shared/src/quality";
export interface RenderStats {
  quality: RenderQuality;
  fps: number | null;
  drawCalls?: number;
  triangles?: number;
  textures?: number;
  characters?: number;
  paused: boolean;
  onDemand?: boolean;
}
export default function RenderMonitor({
  automatic,
  quality,
  onQuality,
  onStats,
  onFallback,
}: {
  automatic: boolean;
  quality: RenderQuality;
  onQuality: (quality: RenderQuality) => void;
  onStats: (stats: RenderStats) => void;
  onFallback: () => void;
}) {
  const frames = useRef(0),
    duration = useRef(0),
    time = useRef(0),
    severe = useRef(0),
    state = useRef<QualityState>({
      level: quality,
      slowSeconds: 0,
      fastSeconds: 0,
      lastChange: -15,
    });
  useFrame(({ gl, scene }, delta) => {
    if (document.hidden || delta <= 0 || delta > 1) return;
    duration.current += delta;
    time.current += delta;
    frames.current++;
    if (duration.current < 2) return;
    const fps = Math.round(frames.current / duration.current),
      seconds = duration.current;
    duration.current = 0;
    frames.current = 0;
    if (state.current.level !== quality)
      state.current = {
        level: quality,
        slowSeconds: 0,
        fastSeconds: 0,
        lastChange: time.current,
      };
    if (automatic) {
      state.current = sampleQuality(state.current, fps, seconds, time.current);
      if (state.current.level !== quality) onQuality(state.current.level);
      severe.current =
        quality === "low" && fps < 12 ? severe.current + seconds : 0;
      if (severe.current >= 8) {
        severe.current = 0;
        onFallback();
      }
    }
    let characters = 0;
    scene.traverse((object) => {
      if (object.name.startsWith("staff-")) characters++;
    });
    onStats({
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      textures: gl.info.memory.textures,
      characters,
      quality: automatic ? state.current.level : quality,
      fps,
      paused: false,
    });
  });
  return null;
}
