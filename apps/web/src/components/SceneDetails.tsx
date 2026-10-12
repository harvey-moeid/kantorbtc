import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import * as THREE from "three";
export const SceneQuality = createContext<"low" | "medium" | "high">("medium");
export const useSceneQuality = () => useContext(SceneQuality);
export interface Part {
  at: [number, number, number];
  size: [number, number, number];
  color: string;
}
export function InstanceBlocks({
  parts,
  roughness = 0.8,
  metalness = 0,
}: {
  parts: Part[];
  roughness?: number;
  metalness?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const object = new THREE.Object3D(),
      color = new THREE.Color();
    parts.forEach((part, i) => {
      object.position.set(...part.at);
      object.scale.set(...part.size);
      object.updateMatrix();
      ref.current!.setMatrixAt(i, object.matrix);
      ref.current!.setColorAt(i, color.set(part.color));
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor)
      ref.current!.instanceColor.needsUpdate = true;
    ref.current!.computeBoundingSphere();
  }, [parts]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, parts.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={roughness} metalness={metalness} />
    </instancedMesh>
  );
}
export function TimberFloor({ upstairs = false }: { upstairs?: boolean }) {
  const parts = useMemo(
    () =>
      Array.from({ length: 32 }, (_, i) => ({
        at: [
          -6.025 + i * 0.385,
          upstairs ? 3.1 : 0.008,
          upstairs ? -1.6 : 0,
        ] as [number, number, number],
        size: [0.374, 0.024, upstairs ? 4.9 : 8.2] as [number, number, number],
        color: ["#92745b", "#9e8065", "#896c55", "#a1846b"][i % 4],
      })),
    [upstairs],
  );
  return <InstanceBlocks parts={parts} />;
}
export function AcousticWall({ upstairs = false }: { upstairs?: boolean }) {
  const parts = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        at: [-5.82 + i * 0.27, upstairs ? 4.52 : 1.5, -3.83] as [
          number,
          number,
          number,
        ],
        size: [0.065, upstairs ? 2.85 : 2.85, 0.095] as [
          number,
          number,
          number,
        ],
        color: i % 3 ? "#9b836c" : "#b0977b",
      })),
    [upstairs],
  );
  return <InstanceBlocks parts={parts} />;
}
export function CeilingRail({
  at,
  width,
}: {
  at: [number, number, number];
  width: number;
}) {
  return (
    <group position={at}>
      <mesh>
        <boxGeometry args={[width, 0.07, 0.12]} />
        <meshStandardMaterial color="#26353a" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, -0.04, 0]}>
        <boxGeometry args={[width - 0.12, 0.012, 0.07]} />
        <meshStandardMaterial
          color="#f3ddb8"
          emissive="#f3d3a1"
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
