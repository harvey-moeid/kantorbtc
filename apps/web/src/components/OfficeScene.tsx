import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  PerspectiveCamera,
  RoundedBox,
  Environment,
  Lightformer,
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
import OfficeInterior from "./OfficeInterior";
import { Chair, CoffeeBarDetails, MeetingAccessories } from "./OfficeFurniture";
import OfficeEffects from "./OfficeEffects";
import CharacterHead from "./OfficeCharacterHead";
import {
  OfficeMaterials,
  SurfaceMaterial,
  SoftShadow,
  useSurface,
} from "./OfficeMaterials";
import RenderMonitor, { type RenderStats } from "./RenderMonitor";

function Box({
  at,
  size,
  color,
  surface,
  ...props
}: {
  at: [number, number, number];
  size: [number, number, number];
  color: string;
  transparent?: boolean;
  opacity?: number;
  metalness?: number;
  roughness?: number;
  surface?: "walnut" | "oak" | "stone" | "fabric";
}) {
  const map = useSurface(surface || "stone");
  return (
    <mesh position={at} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        map={surface ? map : undefined}
        roughness={0.65}
        depthWrite={!props.transparent}
        {...props}
      />
    </mesh>
  );
}
function Plant({ x, z, y = 0 }: { x: number; z: number; y?: number }) {
  return (
    <group position={[x, y, z]}>
      <SoftShadow scale={[0.85, 0.85]} opacity={0.35} />
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.23, 0.17, 0.44, 24]} />
        <meshStandardMaterial color="#d1c9b4" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.435, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.215, 24]} />
        <meshStandardMaterial color="#403729" />
      </mesh>
      <mesh position={[0, 0.43, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.222, 0.014, 6, 24]} />
        <meshStandardMaterial color="#e4dcc5" />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const a = i * 2.4,
          height = 0.55 + (i % 4) * 0.15;
        return (
          <group key={i} rotation={[0, a, 0]}>
            <mesh
              position={[0, height * 0.5 + 0.38, 0.035]}
              rotation={[0.16, 0, 0]}
            >
              <cylinderGeometry args={[0.009, 0.012, height, 6]} />
              <meshStandardMaterial color="#517452" />
            </mesh>
            <mesh
              position={[0, height + 0.32, 0.13]}
              rotation={[0.55 + (i % 3) * 0.15, 0, 0]}
              scale={[0.12, 0.36, 0.045]}
              castShadow
            >
              <sphereGeometry args={[1, 16, 12]} />
              <meshStandardMaterial
                color={i % 2 ? "#4d805b" : "#2c6048"}
                roughness={0.68}
              />
            </mesh>
          </group>
        );
      })}
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
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
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
      <RoundedBox
        position={[0, 0.73, 0]}
        args={[double ? 2.2 : 1.4, 0.09, 0.73]}
        radius={0.035}
        smoothness={2}
        castShadow
        receiveShadow
      >
        <SurfaceMaterial surface="walnut" roughness={0.34} color="#f5e6d7" />
      </RoundedBox>
      <Box
        at={[0, 0.685, 0.33]}
        size={[double ? 2.1 : 1.3, 0.018, 0.025]}
        color="#c8b084"
        metalness={0.6}
      />
      <Box
        at={[-0.15, 0.785, 0.14]}
        size={[0.8, 0.009, 0.35]}
        color="#244245"
      />
      <Box
        at={[0.39, 0.797, 0.21]}
        size={[0.09, 0.026, 0.13]}
        color="#788888"
      />
      <Box
        at={[-0.52, 0.94, -0.17]}
        size={[0.022, 0.32, 0.022]}
        color="#c8b084"
        metalness={0.7}
      />
      <Box at={[-0.52, 1.1, -0.08]} size={[0.18, 0.025, 0.2]} color="#d3c4a3" />
      <Box at={[0.49, 0.805, -0.13]} size={[0.2, 0.04, 0.27]} color="#cfb998" />
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
      <Chair at={[0, 0, 0.64]} executive={double} />
      <SoftShadow at={[0, 0.012, 0]} scale={[1.7, 1.05]} opacity={0.26} />
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
    arm = useRef<THREE.Group>(null),
    rightArm = useRef<THREE.Group>(null),
    leftElbow = useRef<THREE.Group>(null),
    rightElbow = useRef<THREE.Group>(null),
    mug = useRef<THREE.Group>(null),
    head = useRef<THREE.Group>(null),
    body = useRef<THREE.Group>(null),
    leg = useRef<THREE.Group>(null),
    rightLeg = useRef<THREE.Group>(null),
    publicView = useStore((s) => s.publicView),
    selected = useStore((s) => s.selectedStaff === person.id),
    floor = useStore((s) => s.floor);
  const position = useRef(new THREE.Vector3(...homes[index])),
    destination = useRef(new THREE.Vector3()),
    idleClock = useRef(0),
    lastRoutine = useRef(-1),
    routine = useRef(idleRoutine(index, 0));
  const joints = useMemo(
    () => [arm, rightArm, leftElbow, rightElbow, leg, rightLeg],
    [],
  );
  const previousPose = useRef(new Float32Array(6));
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
    joints.forEach((joint, i) => {
      previousPose.current[i] = joint.current?.rotation.x || 0;
    });
    idleClock.current += Math.min(dt, 0.25);
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
    const phase = t * 6.5 + index * 0.7;
    const activity = routine.current.activity;
    const speaking = participating && frame?.speaker === index;
    const working = !participating && activity === "work" && !walking;
    const sitting = seated || (working && index < 11);
    if (body.current) {
      const poseY = seated ? -0.15 : sitting ? -0.2 : 0;
      body.current.position.y = THREE.MathUtils.damp(
        body.current.position.y,
        poseY,
        reduced ? 100 : 8,
        dt,
      );
      body.current.rotation.z = reduced
        ? 0
        : walking
          ? Math.sin(phase) * 0.035
          : Math.sin(t * 1.3 + index) * 0.012;
      body.current.rotation.x = reduced
        ? 0
        : working
          ? 0.06
          : speaking
            ? Math.sin(t * 2.2) * 0.025
            : 0;
    }
    if (head.current && !reduced) {
      head.current.rotation.y = speaking
        ? Math.sin(t * 0.9) * 0.22
        : Math.sin(t * 0.55 + index) * 0.12;
      head.current.rotation.x = working
        ? 0.12 + Math.sin(t * 1.5 + index) * 0.035
        : Math.sin(t * 1.1 + index) * 0.035;
    }
    if (arm.current) {
      arm.current.rotation.x = reduced
        ? working
          ? -0.9
          : seated
            ? -0.2
            : 0
        : walking
          ? Math.sin(phase) * 0.6
          : speaking
            ? -0.8 + Math.sin(t * 2.8) * 0.22
            : working
              ? -0.9 + Math.sin(t * 7 + index) * 0.025
              : activity === "coffee"
                ? -0.95 + Math.sin(t * 0.7 + index) * 0.4
                : -0.1;
      arm.current.rotation.z =
        speaking && !reduced ? -0.35 + Math.sin(t * 2) * 0.12 : -0.08;
    }
    if (rightArm.current) {
      rightArm.current.rotation.x = reduced
        ? working
          ? -0.9
          : seated
            ? -0.2
            : 0
        : walking
          ? -Math.sin(phase) * 0.6
          : activity === "phone"
            ? -1.8
            : working
              ? -0.9 + Math.cos(t * 7 + index) * 0.025
              : speaking
                ? -0.3 + Math.cos(t * 2.2) * 0.15
                : -0.1;
    }
    if (leftElbow.current)
      leftElbow.current.rotation.x = reduced
        ? working
          ? -0.9
          : -0.15
        : working
          ? -0.9 + Math.sin(t * 7 + index) * 0.03
          : speaking
            ? -0.6 + Math.sin(t * 2.8) * 0.2
            : activity === "coffee" && !walking
              ? -1.2
              : -0.15;
    if (rightElbow.current)
      rightElbow.current.rotation.x = reduced
        ? working
          ? -0.9
          : -0.15
        : working
          ? -0.9 + Math.cos(t * 7 + index) * 0.03
          : activity === "phone"
            ? -0.85
            : -0.15;
    if (leg.current)
      leg.current.rotation.x = sitting
        ? -1.0
        : walking
          ? -Math.sin(phase) * 0.55
          : 0;
    if (rightLeg.current)
      rightLeg.current.rotation.x = sitting
        ? -1.0
        : walking
          ? Math.sin(phase) * 0.55
          : 0;
    for (const [limb, sign] of [
      [leg, -1],
      [rightLeg, 1],
    ] as const) {
      const knee = limb.current?.children[1];
      if (knee)
        knee.rotation.x = sitting
          ? 1.0
          : walking
            ? Math.max(0, Math.sin(phase) * sign) * 0.75
            : 0;
    }
    if (!reduced)
      joints.forEach((joint, i) => {
        if (joint.current)
          joint.current.rotation.x = THREE.MathUtils.damp(
            previousPose.current[i],
            joint.current.rotation.x,
            14,
            dt,
          );
      });
    if (mug.current) {
      mug.current.visible = !participating && !walking && activity === "coffee";
      mug.current.rotation.x =
        -(arm.current?.rotation.x || 0) - (leftElbow.current?.rotation.x || 0);
    }
    if (!walking && !seated && !participating) {
      const facing = Math.PI;
      ref.current.rotation.y +=
        Math.atan2(
          Math.sin(facing - ref.current.rotation.y),
          Math.cos(facing - ref.current.rotation.y),
        ) * Math.min(1, dt * 5);
    }
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
    ) {
      const facing = Math.atan2(
        destination.current.x - position.current.x,
        destination.current.z - position.current.z,
      );
      ref.current.rotation.y +=
        Math.atan2(
          Math.sin(facing - ref.current.rotation.y),
          Math.cos(facing - ref.current.rotation.y),
        ) * Math.min(1, dt * 9);
    }
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
      <group ref={body} position={[0, bodyOffset, 0]}>
        <group ref={head} position={[0, 1.34, 0]}>
          <CharacterHead
            index={index}
            reduced={reduced}
            speaking={participating && frame?.speaker === index}
          />
        </group>
        <mesh position={[0, 0.98, 0]} scale={[1.12, 1, 0.82]} castShadow>
          <capsuleGeometry args={[0.155, 0.18, 6, 16]} />
          <meshStandardMaterial color={person.color} roughness={0.84} />
        </mesh>
        <mesh position={[0, 1.205, 0]}>
          <cylinderGeometry args={[0.068, 0.075, 0.09, 12]} />
          <meshStandardMaterial
            color={["#dcb193", "#c88e6c", "#a46e51", "#e4c4a5"][index % 4]}
          />
        </mesh>
        <Box at={[0, 1.105, 0.125]} size={[0.09, 0.16, 0.02]} color="#f0e5d2" />
        <Box
          at={[0, 0.98, 0.142]}
          size={[0.028, 0.15, 0.012]}
          color={index < 4 ? "#e1bd7f" : "#253a42"}
        />
        <Box
          at={[0.11, 1.015, 0.13]}
          size={[0.055, 0.045, 0.014]}
          color="#c5ddcc"
        />
        {[-1, 1].map((side) => (
          <group
            key={side}
            ref={side < 0 ? arm : rightArm}
            position={[side * 0.225, 1.12, 0]}
          >
            <mesh position={[0, -0.12, 0]} castShadow>
              <capsuleGeometry args={[0.06, 0.17, 4, 8]} />
              <meshStandardMaterial color={person.color} />
            </mesh>
            <group
              ref={side < 0 ? leftElbow : rightElbow}
              position={[0, -0.25, 0]}
              rotation={[-0.25, 0, 0]}
            >
              <mesh position={[0, -0.09, 0]}>
                <capsuleGeometry args={[0.047, 0.14, 4, 8]} />
                <meshStandardMaterial color={person.color} />
              </mesh>
              <mesh position={[0, -0.21, 0]}>
                <sphereGeometry args={[0.055, 10, 8]} />
                <meshStandardMaterial
                  color={
                    ["#dcb193", "#c88e6c", "#a46e51", "#e4c4a5"][index % 4]
                  }
                />
              </mesh>
              {side < 0 && (
                <Box
                  at={[0, -0.16, 0]}
                  size={[0.103, 0.035, 0.103]}
                  color="#d0b680"
                />
              )}
              {side < 0 && (
                <group ref={mug} position={[0, -0.21, 0.07]} visible={false}>
                  <mesh position={[0, 0.065, 0]}>
                    <cylinderGeometry args={[0.068, 0.055, 0.13, 16]} />
                    <meshStandardMaterial color="#f4e6d0" roughness={0.28} />
                  </mesh>
                  <mesh
                    position={[0, 0.132, 0]}
                    rotation={[-Math.PI / 2, 0, 0]}
                  >
                    <circleGeometry args={[0.056, 16]} />
                    <meshStandardMaterial color="#4a2d1a" />
                  </mesh>
                  <mesh
                    position={[-0.068, 0.07, 0]}
                    rotation={[0, Math.PI / 2, 0]}
                  >
                    <torusGeometry args={[0.033, 0.009, 6, 12]} />
                    <meshStandardMaterial color="#f4e6d0" />
                  </mesh>
                </group>
              )}
              {side > 0 && index === 10 && (
                <Box
                  at={[0, -0.2, 0.045]}
                  size={[0.07, 0.12, 0.02]}
                  color="#152e35"
                />
              )}
            </group>
          </group>
        ))}
        {[-1, 1].map((side) => (
          <group
            key={side}
            ref={side < 0 ? leg : rightLeg}
            position={[side * 0.095, 0.74, 0]}
          >
            <mesh position={[0, -0.145, 0]} castShadow>
              <capsuleGeometry args={[0.073, 0.21, 4, 8]} />
              <meshStandardMaterial color={index % 2 ? "#293d49" : "#38403d"} />
            </mesh>
            <group
              position={[0, -0.32, 0]}
              rotation={[seated ? Math.PI / 2 : 0, 0, 0]}
            >
              <mesh position={[0, -0.15, 0]}>
                <capsuleGeometry args={[0.057, 0.23, 4, 8]} />
                <meshStandardMaterial
                  color={index % 2 ? "#293d49" : "#38403d"}
                />
              </mesh>
              <RoundedBox
                position={[0, -0.31, 0.04]}
                args={[0.14, 0.11, 0.25]}
                radius={0.04}
                smoothness={2}
              >
                <meshStandardMaterial color="#17252a" roughness={0.45} />
              </RoundedBox>
              <Box
                at={[0, -0.35, 0.04]}
                size={[0.145, 0.025, 0.25]}
                color="#b7b4a2"
              />
            </group>
          </group>
        ))}
      </group>
      <SoftShadow scale={[0.65, 0.65]} opacity={0.48} />
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
          <ringGeometry args={[0.29, 0.33, 32]} />
          <meshBasicMaterial color="#b8dfcc" transparent opacity={0.8} />
        </mesh>
      )}
      {(selected || frame?.speaker === index) && (
        <LabelSprite
          at={[0, 1.92, 0]}
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
  width = 2.05,
}: {
  at: [number, number, number];
  text: string;
  light?: boolean;
  width?: number;
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
    <sprite position={at} scale={[width, width * 0.145, 1]} renderOrder={20}>
      <spriteMaterial
        map={texture}
        depthTest={!light}
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
  return <LabelSprite at={position} text={String(children)} width={1.55} />;
}

function Architecture({ onChart }: { onChart: (s: string) => void }) {
  const floor = useStore((s) => s.floor),
    upstairs = floor !== "1",
    downstairs = floor !== "2";
  return (
    <>
      <group visible={downstairs}>
        <Box
          at={[0, -0.15, 0]}
          size={[12.3, 0.3, 8.4]}
          color="#ffffff"
          surface="oak"
          roughness={0.72}
        />
        <Box at={[0, -0.34, 0]} size={[12.5, 0.09, 8.6]} color="#666d5f" />
        <Box at={[-6, 1.5, 0]} size={[0.12, 3, 8.2]} color="#d5d0be" />
        <Box at={[0, 1.5, -4.06]} size={[12, 3, 0.13]} color="#213c40" />
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
        <Box
          at={[-2, 0.015, 1.85]}
          size={[7.9, 0.025, 4.65]}
          color="#35565b"
          surface="fabric"
        />
        {homes.slice(0, 8).map(([x, y, z], i) => (
          <Desk key={i} x={x} y={y} z={z - 0.72} />
        ))}
        <Desk x={-4.5} z={-2.4} double />
        <Box
          at={[2.65, 0.45, -2.7]}
          size={[2.7, 0.9, 0.7]}
          color="#ffffff"
          surface="walnut"
        />
        <RoundedBox
          position={[2.65, 0.94, -2.7]}
          args={[2.8, 0.08, 0.76]}
          radius={0.025}
          smoothness={2}
          castShadow
        >
          <SurfaceMaterial surface="stone" roughness={0.28} />
        </RoundedBox>
        <CoffeeBarDetails />
        <RoomLabel position={[2.65, 2.65, -2.8]}>PANTRY / COFFEE</RoomLabel>
        <RoomLabel position={[4.4, 2.6, 2.22]}>MUSALA / QUIET SPACE</RoomLabel>
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
        <Box
          at={[0, 2.98, -1.6]}
          size={[12.3, 0.22, 5]}
          color="#ffffff"
          surface="oak"
          roughness={0.72}
        />
        <Box at={[0, 2.84, -0.0]} size={[12.25, 0.07, 0.2]} color="#313e39" />
        <Box at={[0, 4.55, -4]} size={[12.2, 3.0, 0.13]} color="#253e42" />
        <Box at={[-6, 4.55, -1.6]} size={[0.12, 3, 5]} color="#d5d0be" />
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
        <RoundedBox
          position={[0.25, 3.9, -1.45]}
          args={[3.6, 0.12, 1.35]}
          radius={0.06}
          smoothness={3}
          castShadow
          receiveShadow
        >
          <SurfaceMaterial surface="walnut" roughness={0.3} />
        </RoundedBox>
        <Box at={[0.25, 3.46, -1.45]} size={[1.7, 0.8, 0.65]} color="#47493e" />
        <MeetingAccessories />
        {[-1.0, 0, 1, 2].flatMap((x) =>
          [-2.32, -0.54].map((z) => (
            <Chair
              key={`${x}:${z}`}
              at={[x, 3.1, z]}
              rotation={z < -1 ? Math.PI : 0}
              color="#405751"
            />
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
      <OfficeInterior upstairs={upstairs} downstairs={downstairs} />
      {Array.from({ length: 12 }, (_, i) => (
        <RoundedBox
          key={i}
          position={[5.7, 0.25 + i * 0.25, 3.7 - i * 0.29]}
          args={[0.95, 0.065, 0.35]}
          radius={0.018}
          smoothness={2}
          castShadow
          receiveShadow
        >
          <SurfaceMaterial surface="oak" />
        </RoundedBox>
      ))}
      {[5.34, 6.06].map((x) => (
        <mesh
          key={x}
          position={[x, 1.48, 2.1]}
          rotation={[0.71, 0, 0]}
          castShadow
        >
          <boxGeometry args={[0.065, 0.16, 4.5]} />
          <meshStandardMaterial
            color="#253c43"
            metalness={0.5}
            roughness={0.35}
          />
        </mesh>
      ))}
      <mesh position={[6.04, 2.45, 2]} rotation={[0.71, 0, 0]}>
        <boxGeometry args={[0.05, 0.06, 4.7]} />
        <meshStandardMaterial
          color="#c6a878"
          metalness={0.65}
          roughness={0.3}
        />
      </mesh>
      {[0, 3, 6, 9, 11].map((i) => (
        <Box
          key={`rail-${i}`}
          at={[6.04, 0.6 + i * 0.25, 3.7 - i * 0.29]}
          size={[0.035, 1, 0.035]}
          color="#354e50"
        />
      ))}
    </>
  );
}
function CameraRig({
  reset,
  view,
  frame,
  follow,
  onManual,
  reduced,
}: {
  reset: number;
  view: "overview" | "interior";
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
    const fit = Math.max(1, 1.1 / (size.width / size.height));
    const close = view === "interior";
    const centerY = floor === "1" ? 0.35 : floor === "2" ? 2.85 : 1.65;
    camera.position.set(
      (close ? 8.4 : 11.8) * fit,
      centerY + (close ? 4.8 : 9.3) * fit,
      (close ? 9.5 : 14.3) * fit,
    );
    controls.current?.target.set(close ? -0.7 : 0, centerY, close ? 0.15 : 0);
    controls.current?.update();
  }, [floor, reset, view, camera, size.width, size.height]);
  useFrame((_, delta) => {
    if (!follow || !frame || frame.complete || !controls.current) return;
    const p =
      frame.speaker === null
        ? [1, 2, -0.3]
        : seats[frame.speaker] || [1, 3.1, -1.5];
    target.current.set(p[0], frame.floor === "2" ? p[1] - 0.1 : 1.7, p[2]);
    const fit = Math.max(1, 1.1 / (size.width / size.height));
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
      minDistance={4}
      maxDistance={60}
      maxPolarAngle={Math.PI * 0.47}
      minPolarAngle={0.28}
      enablePan={true}
      screenSpacePanning={false}
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
  view = "overview",
  frame = null,
  follow = false,
  onManual = () => {},
  onStats = () => {},
  fallback,
}: {
  onChart: (s: string) => void;
  reset?: number;
  view?: "overview" | "interior";
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
        shadows={quality !== "low"}
        dpr={[1, high ? 1.75 : quality === "low" ? 1 : 1.4]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
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
          view={view}
          frame={frame}
          follow={follow}
          onManual={onManual}
          reduced={reduced}
        />
        {high && <OfficeEffects />}
        <RenderMonitor
          automatic={requested === "auto" && !reduced}
          quality={quality}
          onQuality={setAutomatic}
          onStats={(stats) => onStats({ ...stats, onDemand: reduced })}
          onFallback={fallback2d}
        />
        <ambientLight intensity={0.28} />
        <hemisphereLight args={["#d7e9ef", "#202b30", 0.65]} />
        <directionalLight
          position={[-3, 11, 7]}
          intensity={3.5}
          color="#ffe1b3"
          castShadow={quality !== "low"}
          shadow-mapSize={high ? [2048, 2048] : [1024, 1024]}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-camera-near={1}
          shadow-camera-far={35}
          shadow-bias={-0.00015}
          shadow-normalBias={0.04}
        />
        <directionalLight
          position={[7, 5, -3]}
          intensity={1.1}
          color="#83c7d4"
        />
        <pointLight
          position={[-2, 1.7, 2]}
          intensity={18}
          distance={8}
          decay={2}
          color="#ffcb88"
        />
        <pointLight
          position={[0.3, 4.1, -1.45]}
          intensity={15}
          distance={6}
          decay={2}
          color="#ffdcb1"
        />
        <Environment resolution={64} frames={1}>
          <Lightformer
            position={[-4, 8, 1]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[8, 6, 1]}
            color="#ffe3ba"
            intensity={2}
          />
          <Lightformer
            position={[6, 3, 3]}
            rotation={[0, -Math.PI / 2, 0]}
            scale={[6, 4, 1]}
            color="#b0dbea"
            intensity={1.2}
          />
          <Lightformer
            position={[0, 3, -7]}
            scale={[6, 3, 1]}
            color="#ffdcb0"
            intensity={1}
          />
        </Environment>
        <Suspense fallback={null}>
          <OfficeMaterials>
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
                  frames={1}
                  resolution={256}
                />
              )}
            </group>
          </OfficeMaterials>
        </Suspense>
      </Canvas>
    </SceneBoundary>
  );
}
