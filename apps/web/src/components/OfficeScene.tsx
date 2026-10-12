import { fitOfficeView } from "../../../../packages/shared/src/office-view";
import {
  SceneQuality,
  useSceneQuality,
  AcousticWall,
  CeilingRail,
  InstanceBlocks,
  TimberFloor,
  type Part,
} from "./SceneDetails";
import { GroundShadow, SceneScreens, useScreen } from "./SceneScreens";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  PerspectiveCamera,
  RoundedBox,
} from "@react-three/drei";
import {
  Component,
  Suspense,
  useEffect,
  useCallback,
  useLayoutEffect,
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
  roughness?: number;
}) {
  return (
    <mesh position={at} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.65} {...props} />
    </mesh>
  );
}
function Plant({ x, z, y = 0 }: { x: number; z: number; y?: number }) {
  const quality = useSceneQuality(),
    count = quality === "low" ? 6 : quality === "high" ? 12 : 8;
  const leaves = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const object = new THREE.Object3D(),
      color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const t = i * 2.39996;
      object.position.set(
        Math.sin(t) * (0.16 + i * 0.005),
        0.6 + i * 0.047,
        Math.cos(t) * (0.16 + i * 0.005),
      );
      object.rotation.set(0.3 * Math.sin(t), t, 0.35);
      object.scale.set(0.16, 0.32, 0.13);
      object.updateMatrix();
      leaves.current!.setMatrixAt(i, object.matrix);
      leaves.current!.setColorAt(i, color.set(i % 3 ? "#426952" : "#6b8c67"));
    }
    leaves.current!.instanceMatrix.needsUpdate = true;
    if (leaves.current!.instanceColor)
      leaves.current!.instanceColor.needsUpdate = true;
    leaves.current!.computeBoundingSphere();
  }, [count]);
  return (
    <group position={[x, y, z]}>
      <GroundShadow scale={[0.85, 0.85]} />
      <mesh position={[0, 0.23, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.18, 0.46, 12]} />
        <meshStandardMaterial color="#30413e" roughness={0.65} />
      </mesh>
      <instancedMesh
        ref={leaves}
        args={[undefined, undefined, count]}
        castShadow
      >
        <sphereGeometry
          args={[1, quality === "low" ? 6 : 8, quality === "low" ? 4 : 6]}
        />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
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
  const texture = useScreen(symbol);
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
        <meshBasicMaterial map={texture} toneMapped={false} />
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
  color = "#95765d",
  double = false,
}: {
  x: number;
  z: number;
  y?: number;
  color?: string;
  double?: boolean;
}) {
  const quality = useSceneQuality(),
    width = double ? 2.2 : 1.4;
  const parts = useMemo<Part[]>(
    () => [
      { at: [0, 0.67, 0], size: [width - 0.04, 0.05, 0.68], color: "#2c373b" },
      ...[-width / 2 + 0.13, width / 2 - 0.13].map((a) => ({
        at: [a, 0.35, 0] as [number, number, number],
        size: [0.07, 0.7, 0.58] as [number, number, number],
        color: "#283439",
      })),
      {
        at: [0, 0.17, -0.23],
        size: [width - 0.2, 0.055, 0.055],
        color: "#465359",
      },
      { at: [-0.12, 0.79, 0.2], size: [0.48, 0.025, 0.14], color: "#303e44" },
      { at: [0.24, 0.79, 0.22], size: [0.25, 0.018, 0.23], color: "#223438" },
      { at: [0.25, 0.81, 0.22], size: [0.055, 0.035, 0.08], color: "#849793" },
      { at: [0.5, 0.8, -0.04], size: [0.14, 0.03, 0.19], color: "#d3c7ad" },
      { at: [0, 0.45, 0.69], size: [0.49, 0.12, 0.45], color: "#33444a" },
      { at: [0, 0.74, 0.94], size: [0.5, 0.52, 0.09], color: "#33444a" },
      { at: [0, 0.28, 0.69], size: [0.05, 0.28, 0.05], color: "#9ea8a0" },
      { at: [0, 0.12, 0.69], size: [0.55, 0.035, 0.05], color: "#2a383e" },
      { at: [0, 0.12, 0.69], size: [0.05, 0.035, 0.55], color: "#2a383e" },
      ...[-0.28, 0.28].map((a) => ({
        at: [a, 0.61, 0.7] as [number, number, number],
        size: [0.035, 0.045, 0.38] as [number, number, number],
        color: "#84918e",
      })),
    ],
    [width],
  );
  return (
    <group position={[x, y, z]}>
      <GroundShadow at={[0, 0.018, 0.2]} scale={[width + 0.3, 1.8]} />
      {quality === "low" ? (
        <Box
          at={[0, 0.73, 0]}
          size={[width, 0.09, 0.73]}
          color={color}
          roughness={0.6}
        />
      ) : (
        <RoundedBox
          args={[width, 0.09, 0.73]}
          radius={0.035}
          smoothness={1}
          position={[0, 0.73, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={color} roughness={0.6} />
        </RoundedBox>
      )}
      <InstanceBlocks parts={parts} roughness={0.7} metalness={0.08} />
      <Monitor position={[-0.16, 1.15, -0.12]} />
      <mesh position={[0.49, 0.85, 0.21]} castShadow>
        <cylinderGeometry args={[0.055, 0.045, 0.12, 10]} />
        <meshStandardMaterial color="#e0dacb" roughness={0.9} />
      </mesh>
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
  const accessories = useMemo<Part[]>(
    () => [
      ...[0.08, -0.08].map((x) => ({
        at: [x, 0.075, seated ? 0.5 : 0.06] as [number, number, number],
        size: [0.13, 0.1, 0.23] as [number, number, number],
        color: "#20292e",
      })),
      {
        at: [0, 1.02 + bodyOffset, 0.143],
        size: [0.105, 0.21, 0.015],
        color: "#e4dfd1",
      },
      {
        at: [0, 0.97 + bodyOffset, 0.16],
        size: [0.025, 0.19, 0.015],
        color: person.kind === "boss" ? "#ae8964" : "#32474d",
      },
      ...[-0.045, 0.045].map((x) => ({
        at: [x, 1.275 + bodyOffset, 0.134] as [number, number, number],
        size: [0.021, 0.02, 0.016] as [number, number, number],
        color: "#37362f",
      })),
    ],
    [seated, bodyOffset, person.kind],
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
      name={`staff-${person.id}`}
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
      <GroundShadow scale={[0.65, 0.5]} />
      <mesh position={[0, 1.25 + bodyOffset, 0]} castShadow>
        <sphereGeometry
          args={[0.145, quality === "low" ? 8 : 12, quality === "low" ? 6 : 10]}
        />
        <meshStandardMaterial color={index % 3 ? "#d8ab87" : "#ba8765"} />
      </mesh>
      <mesh position={[0, 1.33 + bodyOffset, -0.025]}>
        <sphereGeometry
          args={[0.145, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58]}
        />
        <meshStandardMaterial color={index % 4 ? "#38312b" : "#b19472"} />
      </mesh>
      <mesh position={[0, 0.91 + bodyOffset, 0]} castShadow>
        <capsuleGeometry
          args={[
            0.15,
            0.32,
            quality === "low" ? 2 : 4,
            quality === "low" ? 6 : 8,
          ]}
        />
        <meshStandardMaterial color={person.color} />
      </mesh>
      <mesh
        ref={arm}
        position={[-0.2, 0.88 + bodyOffset, 0.02]}
        rotation={[0.12, 0, -0.15]}
      >
        <capsuleGeometry
          args={[
            0.052,
            0.34,
            quality === "low" ? 2 : 4,
            quality === "low" ? 4 : 6,
          ]}
        />
        <meshStandardMaterial color={person.color} />
      </mesh>
      <mesh
        position={[0.2, 0.88 + bodyOffset, 0.02]}
        rotation={[0.25, 0, 0.15]}
      >
        <capsuleGeometry
          args={[
            0.052,
            0.34,
            quality === "low" ? 2 : 4,
            quality === "low" ? 4 : 6,
          ]}
        />
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
      <InstanceBlocks parts={accessories} roughness={0.85} />
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
    c.fillStyle = light ? "#d4e8c7" : "#15252d";
    c.beginPath();
    c.roundRect(0, 0, 640, 92, 9);
    c.fill();
    c.fillStyle = light ? "#20382d" : "#d3e1df";
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
        <Box at={[0, -0.15, 0]} size={[12.3, 0.3, 8.4]} color="#c0b9a5" />
        <Box at={[0, -0.34, 0]} size={[12.5, 0.09, 8.6]} color="#23333a" />
        <TimberFloor />
        <AcousticWall />
        <CeilingRail at={[0, 2.99, -3.6]} width={11.5} />
        <Box at={[-6, 1.5, 0]} size={[0.12, 3, 8.2]} color="#c5cec7" />
        <Box at={[0, 1.5, -4.06]} size={[12, 3, 0.13]} color="#526760" />
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
        <Box at={[0, 2.98, -1.6]} size={[12.3, 0.22, 5]} color="#5f6c69" />
        <TimberFloor upstairs />
        <AcousticWall upstairs />
        <CeilingRail at={[0, 6.02, -3.6]} width={11.5} />
        <CeilingRail at={[0, 3.08, 0.86]} width={11.9} />
        <Box at={[0, 2.84, -0.0]} size={[12.25, 0.07, 0.2]} color="#313e39" />
        <Box at={[0, 4.55, -4]} size={[12.2, 3.0, 0.13]} color="#526760" />
        <Box at={[-6, 4.55, -1.6]} size={[0.12, 3, 5]} color="#c5cec7" />
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
        <InstanceBlocks
          parts={[-1, 0, 1, 2].flatMap((x) =>
            [-2.32, -0.54].flatMap((z) => [
              {
                at: [x, 3.57, z] as [number, number, number],
                size: [0.48, 0.1, 0.48] as [number, number, number],
                color: "#344a4c",
              },
              {
                at: [x, 3.81, z + (z < -1 ? -0.23 : 0.23)] as [
                  number,
                  number,
                  number,
                ],
                size: [0.48, 0.54, 0.08] as [number, number, number],
                color: "#344a4c",
              },
              {
                at: [x, 3.3, z] as [number, number, number],
                size: [0.06, 0.44, 0.06] as [number, number, number],
                color: "#9ea9a1",
              },
            ]),
          )}
        />
        <Monitor
          large
          position={[0.3, 4.95, -3.65]}
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
      <group visible={floor !== "2"}>
        {Array.from({ length: 12 }, (_, i) => (
          <Box
            key={i}
            at={[5.7, 0.125 + i * 0.25, 3.7 - i * 0.29]}
            size={[0.9, 0.25, 0.33]}
            color={i % 2 ? "#a99c88" : "#b8aa91"}
          />
        ))}
        <Box at={[5.98, 1.9, 2]} size={[0.035, 0.05, 4.1]} color="#617268" />
      </group>
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
    eye = useRef(new THREE.Vector3()),
    offset = useRef(new THREE.Vector3());
  useEffect(() => {
    if (follow && frame && !frame.complete) return;
    const view = fitOfficeView(floor, size.width / Math.max(1, size.height));
    camera.position.set(...view.position);
    controls.current?.target.set(...view.target);
    controls.current?.update();
  }, [floor, reset, camera, size.width, size.height]);
  useFrame((_, delta) => {
    if (!follow || !frame || frame.complete || !controls.current) return;
    const p =
      frame.speaker === null
        ? [0.3, frame.floor === "2" ? 3.1 : 0, -1.45]
        : seats[frame.speaker] || [1, 3.1, -1.5];
    target.current.set(p[0], p[1] - 0.25, p[2]);
    const fit = size.width / size.height < 1 ? 1.25 : 1;
    eye.current
      .copy(target.current)
      .add(offset.current.set(6.5 * fit, 5.5 * fit, 8 * fit));
    const step = reduced ? 1 : 1 - Math.exp(-delta * 3);
    camera.position.lerp(eye.current, step);
    controls.current.target.lerp(target.current, step);
    controls.current.update();
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      minDistance={8}
      maxDistance={60}
      maxPolarAngle={Math.PI * 0.47}
      minPolarAngle={0.28}
      enablePan={false}
      enableDamping={!reduced}
      dampingFactor={0.08}
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
function OfficeLighting({ high }: { high: boolean }) {
  const key = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    if (!high && key.current?.shadow.map) {
      key.current.shadow.map.dispose();
      key.current.shadow.map = null;
    }
  }, [high]);
  return (
    <>
      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#dceaf0", "#34423c", 0.95]} />
      <directionalLight
        ref={key}
        position={[-5, 12, 8]}
        intensity={2}
        color="#ffefd8"
        castShadow={high}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-normalBias={0.03}
      />
      <directionalLight
        position={[7, 8, -5]}
        intensity={1.05}
        color="#c8dcec"
      />
    </>
  );
}
function RendererLifecycle({ onLost }: { onLost: () => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const lost = (event: Event) => {
      event.preventDefault();
      onLost();
    };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, onLost]);
  return null;
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
    documentVisible = useVisibility(),
    viewportRef = useRef<HTMLDivElement>(null),
    [inViewport, setInViewport] = useState(true),
    publicView = useStore((s) => s.publicView),
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
  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setInViewport(entry.isIntersecting),
      { rootMargin: "80px", threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const visible = documentVisible && inViewport;
  const quality = requested === "auto" ? automatic : requested,
    high = quality === "high";
  useEffect(() => {
    onStats({ quality, fps: null, paused: !visible, onDemand: reduced });
  }, [visible, quality, reduced, onStats]);
  const fallback2d = useCallback(() => {
    useStore.getState().set({ mode2d: true });
    useStore
      .getState()
      .notify("Mode 2D diaktifkan agar kantor tetap responsif.");
  }, []);
  return (
    <div
      className="office-canvas"
      ref={viewportRef}
      aria-label="Kantor trading 3D"
    >
      <SceneBoundary fallback={fallback}>
        <Canvas
          key={publicView ? "public" : "private"}
          frameloop={visible ? (reduced ? "demand" : "always") : "never"}
          shadows={high ? "soft" : false}
          dpr={[1, high ? 1.75 : quality === "low" ? 1 : 1.4]}
          gl={{
            antialias: quality !== "low",
            alpha: true,
            powerPreference: "high-performance",
          }}
          fallback={fallback}
          onCreated={({ gl }) => {
            gl.setClearColor("#10191f", 0);
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.15;
          }}
        >
          <RendererLifecycle onLost={fallback2d} />
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
            onStats={(stats) =>
              onStats({ ...stats, paused: !visible, onDemand: reduced })
            }
            onFallback={fallback2d}
          />
          <OfficeLighting high={high} />
          <Suspense fallback={null}>
            <SceneQuality.Provider value={quality}>
              <SceneScreens>
                <group position={[0, -1.2, 0]}>
                  <Architecture onChart={onChart} />
                  {staff.map((s, i) => (
                    <Person
                      key={s.id}
                      index={i}
                      frame={frame}
                      reduced={reduced}
                      quality={quality}
                    />
                  ))}
                </group>
              </SceneScreens>
            </SceneQuality.Provider>
          </Suspense>
        </Canvas>
      </SceneBoundary>
    </div>
  );
}
