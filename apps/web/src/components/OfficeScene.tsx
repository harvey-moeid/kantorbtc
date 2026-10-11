import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  PerspectiveCamera,
} from "@react-three/drei";
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { staff } from "../../../../packages/shared/src/domain";
import { useStore } from "../store";
import {
  homes,
  seats,
  meetingPosition,
  idleRoutine,
} from "../../../../packages/shared/src/office-motion";
import {
  presentationProgress,
  type PresentationFrame,
} from "../../../../packages/shared/src/presentation";
import {
  initialQuality,
  type RenderQuality,
} from "../../../../packages/shared/src/quality";
import { useVisibility, useReducedMotion } from "../hooks/useVisibility";
import RenderMonitor, { type RenderStats } from "./RenderMonitor";

function Box({
  at,
  size,
  color,
  ...props
}: {
  at: [number, number, number];
  size: [number, number, number];
  color: string;
  transparent?: boolean;
  opacity?: number;
  metalness?: number;
}) {
  return (
    <mesh position={at} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.65} {...props} />
    </mesh>
  );
}
function Plant({ x, z, y = 0 }: { x: number; z: number; y?: number }) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.16, 0.44, 10]} />
        <meshStandardMaterial color="#b6ac99" />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[
            Math.sin(i * 2) * 0.12,
            0.6 + i * 0.08,
            Math.cos(i * 2) * 0.12,
          ]}
          rotation={[i * 0.3, i, 0.35]}
        >
          <sphereGeometry args={[0.24, 8, 6]} />
          <meshStandardMaterial color={i % 2 ? "#496850" : "#618367"} />
        </mesh>
      ))}
    </group>
  );
}
function Monitor({
  position,
  large = false,
  symbol = "BTCUSDT",
  onClick,
}: {
  position: [number, number, number];
  large?: boolean;
  symbol?: string;
  onClick?: () => void;
}) {
  const publicView = useStore((s) => s.publicView),
    demo = useStore((s) => s.demo),
    mood = useStore((s) => s.mood),
    quote = useStore((s) => s.quotes.find((q) => q.symbol === symbol));
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 280;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#101b1e";
    c.fillRect(0, 0, 512, 280);
    c.fillStyle = "#a5b7a4";
    c.font = "600 22px sans-serif";
    c.fillText(
      publicView
        ? "KANTOR / MARKET MOOD"
        : `${symbol} / ${demo ? "DEMO" : quote?.status?.toUpperCase() || "OFFLINE"}`,
      26,
      38,
    );
    c.strokeStyle = "#253237";
    c.lineWidth = 1;
    for (let y = 70; y < 260; y += 40) {
      c.beginPath();
      c.moveTo(24, y);
      c.lineTo(485, y);
      c.stroke();
    }
    if (!publicView) {
      if (demo)
        for (let i = 0; i < 27; i++) {
          const y = 190 - i * 3 + Math.sin(i * 1.4) * 24;
          c.fillStyle = i % 3 ? "#b6d88a" : "#da8a6e";
          c.fillRect(28 + i * 17, y, 9, 20);
          c.fillRect(32 + i * 17, y - 9, 1, 36);
        }
      c.fillStyle = "#e4eddc";
      c.font = "bold 38px sans-serif";
      c.fillText(
        quote
          ? "$" +
              quote.price.toLocaleString("en-US", { maximumFractionDigits: 2 })
          : "NO MARKET DATA",
        26,
        92,
      );
      if (!demo) {
        c.font = "16px sans-serif";
        c.fillStyle = "#8ca496";
        c.fillText(quote ? quote.source : "Connect a market source", 26, 220);
      }
    } else {
      c.fillStyle = "#c7dc96";
      c.font = "bold 42px sans-serif";
      c.fillText(
        mood === "naik"
          ? "MARKET RISING"
          : mood === "turun"
            ? "MARKET FALLING"
            : "MARKET IS CALM",
        26,
        145,
      );
      c.font = "20px sans-serif";
      c.fillText("11 analysts. One perspective.", 26, 198);
    }
    return new THREE.CanvasTexture(canvas);
  }, [
    symbol,
    publicView,
    demo,
    mood,
    quote?.price,
    quote?.status,
    quote?.source,
  ]);
  useEffect(() => () => texture.dispose(), [texture]);
  const w = large ? 2.5 : 0.64,
    h = large ? 1.4 : 0.38;
  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onPointerOver={() => {
        if (onClick) document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <Box at={[0, 0, 0]} size={[w + 0.09, h + 0.08, 0.09]} color="#101716" />
      <mesh position={[0, 0, 0.051]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={texture} />
      </mesh>
      {!large && (
        <>
          <Box at={[0, -0.26, 0]} size={[0.04, 0.18, 0.04]} color="#23292b" />
          <Box at={[0, -0.35, 0.03]} size={[0.3, 0.02, 0.16]} color="#23292b" />
        </>
      )}
    </group>
  );
}
function Desk({
  x,
  z,
  y = 0,
  color = "#988474",
  double = false,
}: {
  x: number;
  z: number;
  y?: number;
  color?: string;
  double?: boolean;
}) {
  return (
    <group position={[x, y, z]}>
      <Box
        at={[0, 0.73, 0]}
        size={[double ? 2.2 : 1.4, 0.09, 0.73]}
        color={color}
      />
      {[-0.58, 0.58].map((a) => (
        <Box
          key={a}
          at={[a, 0.36, 0]}
          size={[0.06, 0.7, 0.55]}
          color="#3d4644"
        />
      ))}
      <Monitor position={[-0.16, 1.15, -0.12]} />
      <Box at={[-0.15, 0.8, 0.2]} size={[0.48, 0.018, 0.16]} color="#303939" />
      <Box at={[0.48, 0.83, 0.13]} size={[0.11, 0.17, 0.11]} color="#d6d0be" />
      <Box at={[0, 0.41, 0.64]} size={[0.43, 0.08, 0.42]} color="#343e3b" />
      <Box at={[0, 0.66, 0.88]} size={[0.44, 0.5, 0.07]} color="#343e3b" />
      <Box at={[0, 0.2, 0.64]} size={[0.06, 0.4, 0.06]} color="#626a64" />
    </group>
  );
}
function Person({
  index,
  frame,
  reduced,
  quality,
}: {
  index: number;
  frame: PresentationFrame | null;
  reduced: boolean;
  quality: RenderQuality;
}) {
  const person = staff[index],
    ref = useRef<THREE.Group>(null),
    arm = useRef<THREE.Mesh>(null),
    leg = useRef<THREE.Mesh>(null),
    rightLeg = useRef<THREE.Mesh>(null),
    publicView = useStore((s) => s.publicView),
    selected = useStore((s) => s.selectedStaff === person.id),
    floor = useStore((s) => s.floor),
    mood = useStore((s) => s.mood);
  const position = useRef(new THREE.Vector3(...homes[index])),
    destination = useRef(new THREE.Vector3()),
    idleClock = useRef(0),
    lastRoutine = useRef(-1),
    routine = useRef(idleRoutine(index, 0));
  const progress = frame ? presentationProgress(frame, index) : 0,
    participating =
      !!frame &&
      !frame.complete &&
      index < 11 &&
      (progress > 0 || (frame.stage === "scanner_travel" && index < 4));
  const seated = participating && progress >= 0.99;
  const bodyOffset = seated ? -0.15 : 0;
  const meetingTarget = useMemo(
    () =>
      meetingPosition(
        index,
        reduced ||
          (quality === "low" && index !== frame?.speaker && index % 4 > 1)
          ? progress >= 0.5
            ? 1
            : 0
          : progress,
      ),
    [index, progress, reduced, quality, frame?.speaker],
  );
  useFrame(({ clock }, dt) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    idleClock.current += Math.min(dt, 0.1);
    if (Math.floor(idleClock.current * 2) !== lastRoutine.current) {
      lastRoutine.current = Math.floor(idleClock.current * 2);
      routine.current = idleRoutine(index, idleClock.current);
    }
    const target = participating
      ? meetingTarget
      : reduced
        ? homes[index]
        : routine.current.position;
    destination.current.set(...target);
    position.current.lerp(
      destination.current,
      reduced ? 1 : Math.min(1, dt * 5),
    );
    ref.current.position.copy(position.current);
    const walking =
      !reduced &&
      (participating ? progress > 0 && progress < 1 : routine.current.moving);
    ref.current.position.y +=
      Math.sin(t * (walking ? 8 : 1.7) + index) *
      (reduced ? 0 : walking ? 0.045 : 0.012);
    if (arm.current)
      arm.current.rotation.x = walking
        ? Math.sin(t * 8 + index) * 0.55
        : reduced
          ? 0
          : frame?.speaker === index
            ? 0.55 + Math.sin(t * 3) * 0.1
            : mood === "naik" && index > 10
              ? -0.9
              : mood === "turun" && index > 10
                ? 0.9
                : Math.sin(t * 2 + index) * 0.1;
    if (leg.current)
      leg.current.rotation.x = seated
        ? -Math.PI / 2
        : walking
          ? -Math.sin(t * 8 + index) * 0.3
          : 0;
    if (rightLeg.current)
      rightLeg.current.rotation.x = seated
        ? -Math.PI / 2
        : walking
          ? Math.sin(t * 8 + index) * 0.3
          : 0;
    if (seated)
      ref.current.rotation.y =
        index < 4
          ? 0
          : index < 8
            ? Math.PI
            : index < 10
              ? -Math.PI / 2
              : Math.PI / 2;
    else if (
      walking &&
      position.current.distanceToSquared(destination.current) > 0.001
    )
      ref.current.rotation.y = Math.atan2(
        destination.current.x - position.current.x,
        destination.current.z - position.current.z,
      );
    ref.current.visible =
      floor === "all" ||
      (floor === "1" ? position.current.y < 2 : position.current.y > 2);
  });
  return (
    <group
      ref={ref}
      position={homes[index]}
      onClick={(e) => {
        e.stopPropagation();
        if (!publicView) useStore.getState().set({ selectedStaff: person.id });
      }}
      onPointerOver={() => {
        if (!publicView) document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <mesh position={[0, 1.25 + bodyOffset, 0]} castShadow>
        <sphereGeometry args={[0.145, 12, 10]} />
        <meshStandardMaterial color={index % 3 ? "#d8ab87" : "#ba8765"} />
      </mesh>
      <mesh position={[0, 1.33 + bodyOffset, -0.025]}>
        <sphereGeometry
          args={[0.145, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58]}
        />
        <meshStandardMaterial color={index % 4 ? "#38312b" : "#b19472"} />
      </mesh>
      <mesh position={[0, 0.91 + bodyOffset, 0]} castShadow>
        <capsuleGeometry args={[0.15, 0.32, 4, 8]} />
        <meshStandardMaterial color={person.color} />
      </mesh>
      <mesh
        ref={arm}
        position={[-0.2, 0.88 + bodyOffset, 0.02]}
        rotation={[0.12, 0, -0.15]}
      >
        <capsuleGeometry args={[0.052, 0.34, 4, 6]} />
        <meshStandardMaterial color={person.color} />
      </mesh>
      <mesh
        position={[0.2, 0.88 + bodyOffset, 0.02]}
        rotation={[0.25, 0, 0.15]}
      >
        <capsuleGeometry args={[0.052, 0.34, 4, 6]} />
        <meshStandardMaterial color={person.color} />
      </mesh>
      <mesh
        ref={leg}
        position={[-0.08, seated ? 0.53 : 0.38, seated ? 0.2 : 0]}
      >
        <capsuleGeometry args={[0.065, 0.5, 4, 6]} />
        <meshStandardMaterial color="#30373b" />
      </mesh>
      <mesh
        ref={rightLeg}
        position={[0.08, seated ? 0.53 : 0.38, seated ? 0.2 : 0]}
      >
        <capsuleGeometry args={[0.065, 0.5, 4, 6]} />
        <meshStandardMaterial color="#30373b" />
      </mesh>
      <group visible={seated}>
        {[-0.08, 0.08].map((x) => (
          <mesh key={x} position={[x, 0.28, 0.46]}>
            <capsuleGeometry args={[0.06, 0.25, 4, 6]} />
            <meshStandardMaterial color="#30373b" />
          </mesh>
        ))}
      </group>
      {[0.08, -0.08].map((a) => (
        <Box
          key={a}
          at={[a, 0.075, seated ? 0.5 : 0.06]}
          size={[0.13, 0.1, 0.23]}
          color="#222728"
        />
      ))}
      {(selected || frame?.speaker === index) && (
        <LabelSprite
          at={[0, 1.72, 0]}
          text={
            frame?.speaker === index
              ? frame.shortMessage
              : `${person.name} / ${person.role}`
          }
          light
        />
      )}
    </group>
  );
}
function LabelSprite({
  at,
  text,
  light = false,
}: {
  at: [number, number, number];
  text: string;
  light?: boolean;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 92;
    const c = canvas.getContext("2d")!;
    c.fillStyle = light ? "#d6e7b4" : "#263324";
    c.beginPath();
    c.roundRect(0, 0, 640, 92, 9);
    c.fill();
    c.fillStyle = light ? "#24331b" : "#e6ecda";
    c.font = "500 34px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 320, 47, 600);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, [text, light]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={at} scale={[2.05, 0.3, 1]} renderOrder={20}>
      <spriteMaterial
        map={texture}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}
function RoomLabel({
  position,
  children,
}: {
  position: [number, number, number];
  children: ReactNode;
}) {
  return <LabelSprite at={position} text={String(children)} />;
}

function Architecture({ onChart }: { onChart: (s: string) => void }) {
  const floor = useStore((s) => s.floor),
    upstairs = floor !== "1",
    downstairs = floor !== "2";
  return (
    <>
      <group visible={downstairs}>
        <Box at={[0, -0.15, 0]} size={[12.3, 0.3, 8.4]} color="#c9bfa8" />
        <Box at={[0, -0.34, 0]} size={[12.5, 0.09, 8.6]} color="#666d5f" />
        {Array.from({ length: 17 }, (_, i) => (
          <Box
            key={i}
            at={[-5.8 + i * 0.72, 0.005, 0]}
            size={[0.016, 0.01, 8.1]}
            color="#b7ad98"
          />
        ))}
        <Box at={[-6, 1.5, 0]} size={[0.12, 3, 8.2]} color="#a9b1a2" />
        <Box at={[0, 1.5, -4.06]} size={[12, 3, 0.13]} color="#c5cab9" />
        {[-4.7, -2.35, 0, 2.35, 4.7].map((x) => (
          <group key={x}>
            <Box
              at={[x, 1.75, -3.94]}
              size={[1.9, 2.25, 0.04]}
              color="#657878"
            />
            <Box
              at={[x, 1.75, -3.88]}
              size={[0.04, 2.25, 0.07]}
              color="#cad3bf"
            />
            <Box
              at={[x, 1.75, -3.88]}
              size={[1.9, 0.04, 0.07]}
              color="#cad3bf"
            />
          </group>
        ))}
        <Box at={[-2, 0.015, 1.85]} size={[7.9, 0.025, 4.65]} color="#737a68" />
        {homes.slice(0, 8).map(([x, y, z], i) => (
          <Desk key={i} x={x} y={y} z={z - 0.72} />
        ))}
        <Desk x={-4.5} z={-2.4} double />
        <Box at={[2.65, 0.9, -2.7]} size={[2.7, 1.8, 0.7]} color="#b19b81" />
        <Box at={[2.65, 1.84, -2.7]} size={[2.8, 0.1, 0.76]} color="#ddd5bd" />
        <Box at={[2.25, 2.1, -2.7]} size={[0.4, 0.5, 0.37]} color="#363d38" />
        <RoomLabel position={[2.65, 2.65, -2.8]}>PANTRY / COFFEE</RoomLabel>
        <Box at={[4.95, 0.02, 1.35]} size={[1.7, 0.04, 1.65]} color="#719285" />
        <RoomLabel position={[5, 1, 1.4]}>MUSOLLA</RoomLabel>
        <Monitor
          large
          position={[-3.9, 2.4, -3.8]}
          onClick={() => onChart("btcusdt")}
        />
        <Monitor
          large
          symbol="XAUUSD"
          position={[-0.85, 2.4, -3.8]}
          onClick={() => onChart("xauusd")}
        />
        <Plant x={-5.6} z={3.55} />
        <Plant x={2.9} z={2.8} />
        <Plant x={-5.5} z={-3.4} />
      </group>
      <group visible={upstairs}>
        <Box at={[0, 2.98, -1.6]} size={[12.3, 0.22, 5]} color="#b5a994" />
        <Box at={[0, 2.84, -0.0]} size={[12.25, 0.07, 0.2]} color="#313e39" />
        <Box at={[0, 4.55, -4]} size={[12.2, 3.0, 0.13]} color="#bfc6b6" />
        <Box at={[-6, 4.55, -1.6]} size={[0.12, 3, 5]} color="#a3b4aa" />
        {[-3, 3.25].map((x) => (
          <group key={x}>
            <Box
              at={[x, 4.4, -1.6]}
              size={[0.06, 2.6, 4.8]}
              color="#a5c9bd"
              transparent
              opacity={0.13}
            />
            {[-3.95, 0.72].map((z) => (
              <Box
                key={z}
                at={[x, 4.5, z]}
                size={[0.05, 2.7, 0.07]}
                color="#65766b"
              />
            ))}
          </group>
        ))}
        <Box at={[0.25, 3.9, -1.45]} size={[3.6, 0.12, 1.2]} color="#9d7b59" />
        <Box at={[0.25, 3.46, -1.45]} size={[1.7, 0.8, 0.65]} color="#47493e" />
        {[-1.0, 0, 1, 2].flatMap((x) =>
          [-2.32, -0.54].map((z) => (
            <group key={`${x}:${z}`}>
              <Box
                at={[x, 3.57, z]}
                size={[0.47, 0.09, 0.48]}
                color="#3f4c45"
              />
              <Box
                at={[x, 3.79, z + (z < -1 ? -0.23 : 0.23)]}
                size={[0.48, 0.51, 0.07]}
                color="#3f4c45"
              />
              <Box at={[x, 3.3, z]} size={[0.07, 0.44, 0.07]} color="#738173" />
            </group>
          )),
        )}
        <Monitor
          large
          position={[0.3, 4.95, -3.85]}
          onClick={() => onChart("btcusdt")}
        />
        <Desk x={-4.5} z={-2.5} y={3.1} />
        <Desk x={-4.5} z={-0.9} y={3.1} />
        <Desk x={4.55} z={-2.2} y={3.1} color="#8c7057" double />
        <RoomLabel position={[-4.5, 4.9, -0.2]}>RISK & REWARD</RoomLabel>
        <RoomLabel position={[0.3, 5.75, -3.8]}>THE WAR ROOM</RoomLabel>
        <RoomLabel position={[4.6, 5, -0.3]}>DIRECTOR</RoomLabel>
        <Plant x={-5.55} z={0.3} y={3.1} />
        <Plant x={3.65} z={-3.4} y={3.1} />
        <Box
          at={[0, 3.7, 0.85]}
          size={[12.0, 1.2, 0.04]}
          color="#b1c9ba"
          transparent
          opacity={0.17}
        />
        {[-6, -3, 0, 3, 6].map((x) => (
          <Box
            key={x}
            at={[x, 3.68, 0.85]}
            size={[0.045, 1.25, 0.045]}
            color="#617367"
          />
        ))}
        <Box at={[0, 4.32, 0.85]} size={[12.15, 0.045, 0.07]} color="#809182" />
      </group>
      {Array.from({ length: 12 }, (_, i) => (
        <Box
          key={i}
          at={[5.7, 0.125 + i * 0.25, 3.7 - i * 0.29]}
          size={[0.9, 0.25, 0.33]}
          color={i % 2 ? "#a99c88" : "#b8aa91"}
        />
      ))}
      <Box at={[5.98, 1.9, 2]} size={[0.035, 0.05, 4.1]} color="#617268" />
    </>
  );
}
function CameraRig({
  reset,
  frame,
  follow,
  onManual,
  reduced,
}: {
  reset: number;
  frame: PresentationFrame | null;
  follow: boolean;
  onManual: () => void;
  reduced: boolean;
}) {
  const camera = useThree((s) => s.camera),
    size = useThree((s) => s.size),
    controls = useRef<React.ComponentRef<typeof OrbitControls>>(null),
    floor = useStore((s) => s.floor),
    target = useRef(new THREE.Vector3()),
    eye = useRef(new THREE.Vector3());
  useEffect(() => {
    if (follow && frame && !frame.complete) return;
    const fit = size.width / size.height < 1 ? 1.2 : 1;
    camera.position.set(14 * fit, (floor === "1" ? 10 : 13.3) * fit, 17 * fit);
    controls.current?.target.set(
      0,
      floor === "1" ? 0.7 : floor === "2" ? 4 : 2,
      0,
    );
    controls.current?.update();
  }, [floor, reset, camera, size.width, size.height]);
  useFrame((_, delta) => {
    if (!follow || !frame || frame.complete || !controls.current) return;
    const p =
      frame.speaker === null
        ? [1, 2, -0.3]
        : seats[frame.speaker] || [1, 3.1, -1.5];
    target.current.set(p[0], frame.floor === "2" ? p[1] - 0.1 : 1.7, p[2]);
    const fit = size.width / size.height < 1 ? 1.25 : 1;
    eye.current
      .copy(target.current)
      .add(new THREE.Vector3(6.5 * fit, 5.5 * fit, 8 * fit));
    const step = reduced ? 1 : Math.min(1, delta * 2);
    camera.position.lerp(eye.current, step);
    controls.current.target.lerp(target.current, step);
    controls.current.update();
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      minDistance={8}
      maxDistance={34}
      maxPolarAngle={Math.PI * 0.47}
      minPolarAngle={0.28}
      enablePan={false}
      onStart={onManual}
    />
  );
}
class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}
export default function OfficeScene({
  onChart,
  reset = 0,
  frame = null,
  follow = false,
  onManual = () => {},
  onStats = () => {},
  fallback,
}: {
  onChart: (s: string) => void;
  reset?: number;
  frame?: PresentationFrame | null;
  follow?: boolean;
  onManual?: () => void;
  onStats?: (stats: RenderStats) => void;
  fallback: ReactNode;
}) {
  const requested = useStore((s) => s.settings.quality),
    visible = useVisibility(),
    reduced = useReducedMotion(),
    [automatic, setAutomatic] = useState<RenderQuality>(() =>
      initialQuality({
        cores: navigator.hardwareConcurrency || 4,
        memory: (navigator as Navigator & { deviceMemory?: number })
          .deviceMemory,
        smallScreen: window.innerWidth < 760,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches,
      }),
    );
  const quality = requested === "auto" ? automatic : requested,
    high = quality === "high";
  useEffect(() => {
    onStats({ quality, fps: null, paused: !visible, onDemand: reduced });
  }, [visible, quality, reduced, onStats]);
  const fallback2d = () => {
    useStore.getState().set({ mode2d: true });
    useStore
      .getState()
      .notify("Mode 2D diaktifkan agar kantor tetap responsif.");
  };
  return (
    <SceneBoundary fallback={fallback}>
      <Canvas
        frameloop={visible ? (reduced ? "demand" : "always") : "never"}
        shadows={high}
        dpr={[1, high ? 1.75 : quality === "low" ? 1 : 1.4]}
        gl={{
          antialias: quality !== "low",
          alpha: true,
          powerPreference: "high-performance",
        }}
        fallback={fallback}
        onCreated={({ gl }) => {
          gl.setClearColor("#1b211c", 0);
          gl.domElement.addEventListener("webglcontextlost", fallback2d, {
            once: true,
          });
        }}
      >
        <PerspectiveCamera makeDefault fov={39} position={[14, 13.3, 17]} />
        <CameraRig
          reset={reset}
          frame={frame}
          follow={follow}
          onManual={onManual}
          reduced={reduced}
        />
        <RenderMonitor
          automatic={requested === "auto" && !reduced}
          quality={quality}
          onQuality={setAutomatic}
          onStats={(stats) => onStats({ ...stats, onDemand: reduced })}
          onFallback={fallback2d}
        />
        <ambientLight intensity={1.1} />
        <hemisphereLight args={["#fff1d6", "#344c42", 1.5]} />
        <directionalLight
          position={[-5, 12, 8]}
          intensity={2.5}
          color="#ffdfb7"
          castShadow={high}
          shadow-mapSize={[2048, 2048]}
        />
        <directionalLight
          position={[7, 8, -5]}
          intensity={1.5}
          color="#bdcdb8"
        />
        <Suspense fallback={null}>
          <group position={[0, -1.2, 0]}>
            <Architecture onChart={onChart} />
            {staff.map((s, i) =>
              quality === "low" && i > 10 ? null : (
                <Person
                  key={s.id}
                  index={i}
                  frame={frame}
                  reduced={reduced}
                  quality={quality}
                />
              ),
            )}
            {high && (
              <ContactShadows
                position={[0, -0.4, 0]}
                opacity={0.5}
                scale={30}
                blur={2.7}
                far={10}
                resolution={256}
              />
            )}
          </group>
        </Suspense>
      </Canvas>
    </SceneBoundary>
  );
}
