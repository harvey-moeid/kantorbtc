import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../store";
const Screens = createContext<{
  screens: Record<string, THREE.CanvasTexture>;
  shadow: THREE.CanvasTexture;
} | null>(null);
export function SceneScreens({ children }: { children: ReactNode }) {
  const publicView = useStore((s) => s.publicView),
    demo = useStore((s) => s.demo),
    mood = useStore((s) => s.mood),
    quotes = useStore((s) => s.quotes),
    invalidate = useThree((s) => s.invalidate);
  const resources = useMemo(() => {
    const canvases = Object.fromEntries(
      ["BTCUSDT", "XAUUSD"].map((symbol) => {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 288;
        return [symbol, canvas];
      }),
    );
    const screens = Object.fromEntries(
      Object.entries(canvases).map(([symbol, canvas]) => {
        const map = new THREE.CanvasTexture(canvas);
        map.colorSpace = THREE.SRGBColorSpace;
        map.minFilter = THREE.LinearFilter;
        map.generateMipmaps = false;
        return [symbol, map];
      }),
    );
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const c = canvas.getContext("2d")!,
      gradient = c.createRadialGradient(64, 64, 8, 64, 64, 64);
    gradient.addColorStop(0, "rgba(6,12,15,.35)");
    gradient.addColorStop(0.55, "rgba(6,12,15,.12)");
    gradient.addColorStop(1, "rgba(6,12,15,0)");
    c.fillStyle = gradient;
    c.fillRect(0, 0, 128, 128);
    const shadow = new THREE.CanvasTexture(canvas);
    shadow.generateMipmaps = false;
    shadow.minFilter = THREE.LinearFilter;
    return { screens, shadow, canvases };
  }, []);
  useLayoutEffect(() => {
    for (const [symbol, canvas] of Object.entries(resources.canvases)) {
      const quote = quotes.find((q) => q.symbol === symbol),
        c = canvas.getContext("2d")!;
      c.fillStyle = "#0d1920";
      c.fillRect(0, 0, 512, 288);
      c.fillStyle = "#b9cec4";
      c.font = "500 15px sans-serif";
      c.fillText("KANTOR  /  INTELLIGENCE", 24, 28);
      c.fillStyle = "#e9f2ee";
      c.font = "600 22px sans-serif";
      c.fillText(publicView ? "MARKET ATMOSPHERE" : symbol, 24, 64);
      c.strokeStyle = "#243a41";
      c.lineWidth = 1;
      for (let y = 128; y < 262; y += 32) {
        c.beginPath();
        c.moveTo(24, y);
        c.lineTo(486, y);
        c.stroke();
      }
      if (publicView) {
        c.fillStyle = "#c8e8bd";
        c.font = "600 32px sans-serif";
        c.fillText(
          mood === "naik"
            ? "MARKET RISING"
            : mood === "turun"
              ? "MARKET FALLING"
              : "MARKET IS CALM",
          24,
          157,
        );
        c.font = "16px sans-serif";
        c.fillStyle = "#9eb9ba";
        c.fillText("11 analysts + 2 support", 24, 200);
        c.fillText("Private market data", 24, 246);
      } else {
        c.fillStyle = "#eaf3ef";
        c.font = "600 32px sans-serif";
        c.fillText(
          quote
            ? "$" +
                quote.price.toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                })
            : "NO MARKET DATA",
          24,
          104,
        );
        if (demo)
          for (let i = 0; i < 27; i++) {
            const y = 215 - i * 2 + Math.sin(i * 1.4) * 18;
            c.fillStyle = i % 3 ? "#badbb0" : "#e49b86";
            c.fillRect(26 + i * 17, y, 8, 17);
            c.fillRect(29 + i * 17, y - 8, 1, 33);
          }
        c.font = "14px sans-serif";
        c.fillStyle = "#a8bfbf";
        c.fillText(
          demo
            ? "DEMO · illustrative candles"
            : quote
              ? `${quote.source} · ${quote.status.toUpperCase()}`
              : "Connect a market source",
          24,
          270,
        );
      }
      resources.screens[symbol].needsUpdate = true;
    }
    invalidate();
  }, [publicView, demo, mood, quotes, resources, invalidate]);
  useEffect(
    () => () => {
      Object.values(resources.screens).forEach((map) => map.dispose());
      resources.shadow.dispose();
    },
    [resources],
  );
  return <Screens.Provider value={resources}>{children}</Screens.Provider>;
}
export function useScreen(symbol: string) {
  return useContext(Screens)!.screens[symbol];
}
export function GroundShadow({
  at = [0, 0.015, 0],
  scale = [0.7, 0.45],
}: {
  at?: [number, number, number];
  scale?: [number, number];
}) {
  const texture = useContext(Screens)!.shadow;
  return (
    <mesh position={at} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
      <planeGeometry args={scale} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
