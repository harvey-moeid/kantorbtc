import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Lounge, RingPendant } from "./OfficeFurniture";
import { SurfaceMaterial, useSurface } from "./OfficeMaterials";

type Point = [number, number, number];
export function Detail({
  at,
  size,
  color = "#c6a878",
  glow = false,
}: {
  at: Point;
  size: Point;
  color?: string;
  glow?: boolean;
}) {
  const wood = useSurface("walnut");
  return (
    <mesh position={at} castShadow={!glow} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        map={color === "#76513c" ? wood : undefined}
        color={color === "#76513c" ? "#ffffff" : color}
        roughness={glow ? 0.3 : 0.45}
        metalness={glow ? 0 : 0.25}
        emissive={glow ? color : "#000000"}
        emissiveIntensity={glow ? 2 : 0}
      />
    </mesh>
  );
}
function Slats({
  at,
  count,
  height,
  spacing = 0.14,
}: {
  at: Point;
  count: number;
  height: number;
  spacing?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      matrix.makeTranslation(at[0] + i * spacing, at[1], at[2]);
      ref.current?.setMatrixAt(i, matrix);
    }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [at[0], at[1], at[2], count, spacing]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow>
      <boxGeometry args={[0.065, height, 0.1]} />
      <SurfaceMaterial surface="walnut" roughness={0.48} />
    </instancedMesh>
  );
}
function WallArt({ at, text, sub }: { at: Point; text: string; sub: string }) {
  const map = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#142a2b";
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = "#c6a878";
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 16, 992, 224);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ecdab5";
    ctx.font = "600 74px sans-serif";
    ctx.fillText(text, 512, 117);
    ctx.fillStyle = "#87aea6";
    ctx.font = "24px sans-serif";
    ctx.fillText(sub, 512, 184);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [text, sub]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh position={at}>
      <planeGeometry args={[3.6, 0.9]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  );
}
function Pendant({ at, wide = 1.8 }: { at: Point; wide?: number }) {
  return (
    <group position={at}>
      {[-wide * 0.35, wide * 0.35].map((x) => (
        <Detail
          key={x}
          at={[x, 0.34, 0]}
          size={[0.015, 0.65, 0.015]}
          color="#303f42"
        />
      ))}
      <Detail at={[0, 0, 0]} size={[wide, 0.08, 0.24]} color="#253c3b" />
      <Detail
        at={[0, -0.048, 0]}
        size={[wide - 0.08, 0.012, 0.18]}
        color="#ffe0a1"
        glow
      />
    </group>
  );
}
function SkylineWindow({ at, width = 3.8 }: { at: Point; width?: number }) {
  const map = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const c = canvas.getContext("2d")!;
    const sky = c.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, "#294d68");
    sky.addColorStop(0.58, "#db9e79");
    sky.addColorStop(1, "#f8d5a3");
    c.fillStyle = sky;
    c.fillRect(0, 0, 1024, 512);
    c.fillStyle = "#ffe4ba";
    c.beginPath();
    c.arc(770, 170, 49, 0, Math.PI * 2);
    c.fill();
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 24; i++) {
        const x = i * 48 + layer * 13;
        const height = 60 + ((i * 73 + layer * 29) % 190);
        const base = 460 + layer * 22;
        c.fillStyle = ["#6f8490", "#435d70", "#263f52"][layer];
        c.fillRect(x, base - height, 37, height);
        if (i % 5 === 0) c.fillRect(x + 17, base - height - 30, 3, 35);
        c.fillStyle = layer === 2 ? "#e9bd86" : "#a2c2c5";
        for (let y = base - height + 12; y < base - 8; y += 19) {
          for (let dx = 7; dx < 31; dx += 10) {
            if ((i + dx + y) % 3) c.fillRect(x + dx, y, 4, 7);
          }
        }
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <group position={at} rotation={[0, Math.PI / 2, 0]}>
      <mesh>
        <planeGeometry args={[width, 1.85]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
      {[-width / 2, 0, width / 2].map((x) => (
        <Detail
          key={x}
          at={[x, 0, 0.03]}
          size={[0.04, 1.95, 0.065]}
          color="#263c40"
        />
      ))}
      {[-0.95, 0.95].map((y) => (
        <Detail
          key={y}
          at={[0, y, 0.03]}
          size={[width + 0.1, 0.05, 0.07]}
          color="#c6a878"
        />
      ))}
    </group>
  );
}
export function PrayerRoom() {
  return (
    <group position={[0.7, 0, 0]} scale={[0.75, 1, 1]}>
      <Detail
        at={[4.8, 0.02, 1.22]}
        size={[1.75, 0.04, 1.75]}
        color="#254b42"
      />
      {/* Solid walls keep the room private; the front doorway remains open. */}
      <Detail
        at={[3.85, 1.12, 1.15]}
        size={[0.12, 2.24, 2.15]}
        color="#d1c3a9"
      />
      <Detail at={[4.8, 1.12, 0.08]} size={[2, 2.24, 0.12]} color="#23463f" />
      <Detail
        at={[5.77, 1.12, 1.15]}
        size={[0.1, 2.24, 2.15]}
        color="#d1c3a9"
      />
      <Detail
        at={[4.16, 1.12, 2.22]}
        size={[0.7, 2.24, 0.12]}
        color="#d1c3a9"
      />
      <Detail
        at={[5.58, 1.12, 2.22]}
        size={[0.4, 2.24, 0.12]}
        color="#d1c3a9"
      />
      <Detail
        at={[4.86, 2.12, 2.22]}
        size={[1.15, 0.25, 0.14]}
        color="#76513c"
      />
      <Slats at={[3.82, 1.15, 2.3]} count={5} height={2.3} />
      <Detail
        at={[4.82, 2.3, 0.1]}
        size={[2.05, 0.035, 0.16]}
        color="#ffe0a1"
        glow
      />
      {[4.35, 5.15].map((x) => (
        <group key={x}>
          <Detail
            at={[x, 0.055, 1.18]}
            size={[0.62, 0.02, 1.2]}
            color="#81a990"
          />
          <Detail
            at={[x, 0.067, 0.66]}
            size={[0.5, 0.006, 0.055]}
            color="#e0c795"
          />
          {[-0.27, 0.27].map((dx) => (
            <Detail
              key={dx}
              at={[x + dx, 0.069, 1.18]}
              size={[0.018, 0.005, 1.1]}
              color="#e0c795"
            />
          ))}
        </group>
      ))}
      <mesh position={[4.8, 1.25, 0.15]}>
        <torusGeometry args={[0.48, 0.025, 6, 24, Math.PI]} />
        <meshStandardMaterial
          color="#dabd82"
          metalness={0.65}
          roughness={0.3}
        />
      </mesh>
      {[-0.48, 0.48].map((x) => (
        <Detail key={x} at={[4.8 + x, 0.95, 0.15]} size={[0.045, 0.6, 0.025]} />
      ))}
      <Detail at={[4.82, 0.24, 2.55]} size={[0.9, 0.48, 0.3]} color="#76513c" />
      <Detail
        at={[4.82, 0.25, 2.72]}
        size={[0.78, 0.035, 0.03]}
        color="#d1c3a9"
      />
    </group>
  );
}
export default function OfficeInterior({
  upstairs,
  downstairs,
}: {
  upstairs: boolean;
  downstairs: boolean;
}) {
  return (
    <>
      <group visible={downstairs}>
        <SkylineWindow at={[-5.92, 1.75, -1.65]} width={3.6} />
        <Detail at={[0, -0.38, 0]} size={[12.65, 0.18, 8.7]} color="#142b30" />
        <Detail
          at={[0, -0.24, 4.22]}
          size={[12.4, 0.025, 0.035]}
          color="#e7c995"
          glow
        />
        <Detail
          at={[6.15, -0.24, 0]}
          size={[0.035, 0.025, 8.4]}
          color="#75c9c0"
          glow
        />
        <Slats at={[-5.8, 1.5, -3.86]} count={83} height={2.9} />
        <Detail
          at={[0, 2.94, -3.8]}
          size={[12, 0.045, 0.12]}
          color="#ffdaa0"
          glow
        />
        <PrayerRoom />
        <WallArt
          at={[2.65, 2.45, -3.77]}
          text="KANTOR."
          sub="MARKET INTELLIGENCE / COFFEE CULTURE"
        />
        <Detail
          at={[2.65, 0.46, -2.28]}
          size={[2.6, 0.8, 0.04]}
          color="#25413d"
        />
        <Detail
          at={[2.65, 0.13, -2.24]}
          size={[2.6, 0.035, 0.035]}
          color="#e7c995"
          glow
        />
        {[-4.2, -0.5].map((x) => (
          <Pendant key={x} at={[x, 2.67, 1.6]} wide={2.6} />
        ))}
        <Lounge />
      </group>
      <group visible={upstairs}>
        <SkylineWindow at={[-5.92, 4.75, -1.6]} width={4.3} />
        <Detail
          at={[0, 2.86, 0.91]}
          size={[12.25, 0.05, 0.05]}
          color="#7fd7cb"
          glow
        />
        <Slats at={[-5.85, 4.55, -3.87]} count={21} height={2.8} />
        <Slats at={[3.3, 4.55, -3.87]} count={19} height={2.8} />
        <Detail
          at={[0.3, 3.115, -1.45]}
          size={[5.6, 0.025, 3.95]}
          color="#466560"
        />
        <Detail
          at={[0.25, 3.82, -1.45]}
          size={[3.5, 0.035, 1.16]}
          color="#b8dfcc"
          glow
        />
        <RingPendant at={[0.3, 5.65, -1.45]} radius={1.25} />
        <WallArt
          at={[-4.48, 5.35, -3.76]}
          text="THE EDGE"
          sub="RISK / DISCIPLINE / PERSPECTIVE"
        />
        <WallArt
          at={[4.5, 5.35, -3.76]}
          text="FOUNDER"
          sub="VISION BEYOND THE CHART"
        />
        {[-3, 3.25].map((x) => (
          <Detail
            key={x}
            at={[x, 5.82, -1.6]}
            size={[0.08, 0.06, 4.7]}
            color="#c6a878"
          />
        ))}
      </group>
    </>
  );
}
