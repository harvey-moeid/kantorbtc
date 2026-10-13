import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import * as THREE from "three";

type Surface = "walnut" | "oak" | "stone" | "fabric";
const Materials = createContext<Record<Surface, THREE.CanvasTexture> | null>(
  null,
);
function surfaceTexture(surface: Surface) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(512, 512);
  const base =
    surface === "walnut"
      ? [126, 87, 62]
      : surface === "oak"
        ? [192, 162, 127]
        : surface === "stone"
          ? [215, 210, 198]
          : [157, 164, 159];
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const noise = seed - Math.floor(seed) - 0.5;
      const wood = surface === "walnut" || surface === "oak";
      const grain = wood
        ? Math.sin(
            y * 0.42 +
              Math.sin(x * 0.011) * 3 +
              Math.sin(x * 0.039 + y * 0.014),
          ) *
            3 +
          Math.sin(y * 0.077 + Math.sin(x * 0.007) * 2) * 10
        : surface === "fabric"
          ? x % 3 === 0 || y % 3 === 0
            ? -14
            : 4
          : Math.sin(x * 0.017 + Math.sin(y * 0.016) * 3) * 7;
      const offset = (y * 512 + x) * 4;
      for (let channel = 0; channel < 3; channel++)
        image.data[offset + channel] =
          base[channel] + grain + noise * (wood ? 8 : 16);
      image.data[offset + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  if (surface === "oak") {
    ctx.strokeStyle = "#66564750";
    ctx.lineWidth = 2;
    for (let y = 0; y < 512; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
      const x = y % 128 === 0 ? 140 : 365;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 64);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  if (surface === "oak") texture.repeat.set(3, 2);
  if (surface === "fabric") texture.repeat.set(2, 2);
  return texture;
}
export function OfficeMaterials({ children }: { children: ReactNode }) {
  const textures = useMemo(
    () => ({
      walnut: surfaceTexture("walnut"),
      oak: surfaceTexture("oak"),
      stone: surfaceTexture("stone"),
      fabric: surfaceTexture("fabric"),
    }),
    [],
  );
  useEffect(
    () => () => Object.values(textures).forEach((texture) => texture.dispose()),
    [textures],
  );
  return <Materials.Provider value={textures}>{children}</Materials.Provider>;
}
export function useSurface(surface: Surface) {
  return useContext(Materials)?.[surface];
}
export function SurfaceMaterial({
  surface,
  color = "#ffffff",
  roughness = 0.65,
  metalness = 0,
}: {
  surface: Surface;
  color?: string;
  roughness?: number;
  metalness?: number;
}) {
  const map = useSurface(surface);
  return (
    <meshStandardMaterial
      map={map}
      color={color}
      roughness={roughness}
      metalness={metalness}
    />
  );
}
export function SoftShadow({
  at = [0, 0.012, 0],
  scale = [1, 1],
  opacity = 0.3,
}: {
  at?: [number, number, number];
  scale?: [number, number];
  opacity?: number;
}) {
  const uniforms = useMemo(() => ({ opacity: { value: opacity } }), [opacity]);
  return (
    <mesh
      position={at}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[scale[0], scale[1], 1]}
    >
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader="varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}"
        fragmentShader="varying vec2 vUv; uniform float opacity; void main(){float d=length((vUv-.5)*2.);float a=exp(-d*d*5.)*(1.-smoothstep(.65,1.,d));gl_FragColor=vec4(.025,.04,.045,a*opacity);}"
      />
    </mesh>
  );
}
