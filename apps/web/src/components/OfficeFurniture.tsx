import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoundedBox } from "@react-three/drei";
import { SoftShadow, SurfaceMaterial } from "./OfficeMaterials";

type Point = [number, number, number];
function ChairFrame() {
  const parts = useMemo(() => {
    const metal: THREE.BufferGeometry[] = [],
      trim: THREE.BufferGeometry[] = [];
    const add = (
      list: THREE.BufferGeometry[],
      geometry: THREE.BufferGeometry,
      at: Point,
      rotation: Point = [0, 0, 0],
      parentAngle = 0,
    ) => {
      const local = new THREE.Matrix4().compose(
        new THREE.Vector3(...at),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(1, 1, 1),
      );
      local.premultiply(new THREE.Matrix4().makeRotationY(parentAngle));
      const prepared = geometry.index ? geometry.toNonIndexed() : geometry;
      if (prepared !== geometry) geometry.dispose();
      prepared.applyMatrix4(local);
      list.push(prepared);
    };
    add(metal, new THREE.CylinderGeometry(0.03, 0.045, 0.36, 10), [0, 0.24, 0]);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 0.4;
      add(
        metal,
        new RoundedBoxGeometry(0.045, 0.035, 0.3, 2, 0.014),
        [0, 0.065, 0.145],
        [0, 0, 0],
        angle,
      );
      add(
        trim,
        new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10),
        [0, 0.04, 0.29],
        [0, 0, Math.PI / 2],
        angle,
      );
    }
    for (const x of [-0.28, 0.28]) {
      add(metal, new THREE.CylinderGeometry(0.016, 0.016, 0.24, 8), [
        x,
        0.49,
        0.05,
      ]);
      add(trim, new RoundedBoxGeometry(0.055, 0.045, 0.29, 2, 0.02), [
        x,
        0.62,
        0.01,
      ]);
    }
    // Bake static parts into two meshes rather than a draw call per caster and leg.
    const frame = mergeGeometries(metal)!;
    const details = mergeGeometries(trim)!;
    [...metal, ...trim].forEach((geometry) => geometry.dispose());
    return { frame, details };
  }, []);
  useEffect(
    () => () => {
      parts.frame.dispose();
      parts.details.dispose();
    },
    [parts],
  );
  return (
    <>
      <mesh geometry={parts.frame} castShadow>
        <meshStandardMaterial
          color="#627772"
          metalness={0.7}
          roughness={0.28}
        />
      </mesh>
      <mesh geometry={parts.details}>
        <meshStandardMaterial color="#21353a" roughness={0.65} />
      </mesh>
    </>
  );
}
export function Chair({
  at,
  rotation = 0,
  color = "#335456",
  executive = false,
}: {
  at: Point;
  rotation?: number;
  color?: string;
  executive?: boolean;
}) {
  return (
    <group position={at} rotation={[0, rotation, 0]}>
      <SoftShadow scale={[0.75, 0.75]} opacity={0.4} />
      <ChairFrame />
      <RoundedBox
        position={[0, 0.43, 0]}
        args={[0.49, 0.12, 0.47]}
        radius={0.065}
        smoothness={3}
        castShadow
      >
        <SurfaceMaterial surface="fabric" color={color} />
      </RoundedBox>
      <group position={[0, 0.68, 0.23]} rotation={[-0.1, 0, 0]}>
        <RoundedBox
          args={[0.46, executive ? 0.62 : 0.48, 0.1]}
          radius={0.045}
          smoothness={3}
          castShadow
        >
          <SurfaceMaterial surface="fabric" color={color} />
        </RoundedBox>
        <RoundedBox
          position={[0, -0.07, -0.056]}
          args={[0.37, 0.075, 0.025]}
          radius={0.012}
          smoothness={2}
        >
          <meshStandardMaterial color="#709188" />
        </RoundedBox>
        {executive && (
          <RoundedBox
            position={[0, 0.37, 0]}
            args={[0.28, 0.13, 0.1]}
            radius={0.045}
            smoothness={2}
          >
            <SurfaceMaterial surface="fabric" color={color} />
          </RoundedBox>
        )}
      </group>
    </group>
  );
}
export function RingPendant({
  at,
  radius = 1.25,
}: {
  at: Point;
  radius?: number;
}) {
  return (
    <group position={at}>
      {[0, Math.PI * 0.66, Math.PI * 1.33].map((angle) => (
        <mesh
          key={angle}
          position={[
            Math.cos(angle) * radius * 0.7,
            0.38,
            Math.sin(angle) * radius * 0.7,
          ]}
        >
          <cylinderGeometry args={[0.006, 0.006, 0.75, 6]} />
          <meshStandardMaterial color="#5c5c52" />
        </mesh>
      ))}
      {[radius, radius * 0.7].map((r, i) => (
        <group key={r} position={[0, -i * 0.15, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r, 0.055, 8, 64]} />
            <meshStandardMaterial
              color="#c4a979"
              metalness={0.72}
              roughness={0.24}
            />
          </mesh>
          <mesh position={[0, -0.025, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r, 0.025, 6, 64]} />
            <meshStandardMaterial
              color="#ffe5b3"
              emissive="#ffd29a"
              emissiveIntensity={3}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
export function Lounge() {
  return (
    <group position={[6.2, 0, -1.1]}>
      <SoftShadow scale={[1.6, 1.25]} opacity={0.45} />
      <RoundedBox
        position={[0, 0.075, 0]}
        args={[1.48, 0.024, 1.3]}
        radius={0.01}
        smoothness={2}
      >
        <SurfaceMaterial surface="fabric" color="#7c9996" />
      </RoundedBox>
      <group position={[-0.02, 0, 0.23]}>
        <RoundedBox
          position={[0, 0.3, 0]}
          args={[1.25, 0.27, 0.62]}
          radius={0.12}
          smoothness={3}
          castShadow
        >
          <meshStandardMaterial color="#b07850" roughness={0.85} />
        </RoundedBox>
        <RoundedBox
          position={[0, 0.57, 0.27]}
          args={[1.25, 0.44, 0.18]}
          radius={0.085}
          smoothness={3}
          castShadow
        >
          <meshStandardMaterial color="#b07850" roughness={0.85} />
        </RoundedBox>
        {[-0.58, 0.58].map((x) => (
          <RoundedBox
            key={x}
            position={[x, 0.47, 0]}
            args={[0.16, 0.37, 0.6]}
            radius={0.075}
            smoothness={3}
          >
            <meshStandardMaterial color="#b07850" roughness={0.85} />
          </RoundedBox>
        ))}
        {[-0.28, 0.28].map((x) => (
          <RoundedBox
            key={x}
            position={[x, 0.46, -0.03]}
            args={[0.47, 0.12, 0.46]}
            radius={0.05}
            smoothness={3}
          >
            <meshStandardMaterial color="#c49365" roughness={0.95} />
          </RoundedBox>
        ))}
        <RoundedBox
          position={[-0.35, 0.6, 0.12]}
          rotation={[0.15, 0, -0.14]}
          args={[0.3, 0.3, 0.1]}
          radius={0.04}
          smoothness={2}
        >
          <SurfaceMaterial surface="fabric" color="#455f58" />
        </RoundedBox>
        <RoundedBox
          position={[0.3, 0.6, 0.12]}
          rotation={[0.12, 0, 0.1]}
          args={[0.3, 0.3, 0.1]}
          radius={0.04}
          smoothness={2}
        >
          <SurfaceMaterial surface="fabric" color="#e0c395" />
        </RoundedBox>
        {[-0.46, 0.46].flatMap((x) =>
          [-0.16, 0.4].map((z) => (
            <mesh key={`${x}:${z}`} position={[x, 0.11, z]}>
              <cylinderGeometry args={[0.018, 0.025, 0.17, 8]} />
              <meshStandardMaterial color="#bba47a" metalness={0.65} />
            </mesh>
          )),
        )}
      </group>
      <mesh position={[0.12, 0.34, -0.48]} castShadow>
        <cylinderGeometry args={[0.31, 0.31, 0.045, 32]} />
        <SurfaceMaterial surface="stone" roughness={0.3} />
      </mesh>
      <mesh position={[0.12, 0.18, -0.48]}>
        <cylinderGeometry args={[0.05, 0.08, 0.31, 12]} />
        <meshStandardMaterial
          color="#9b855b"
          metalness={0.7}
          roughness={0.22}
        />
      </mesh>
      <RoundedBox
        position={[0.16, 0.373, -0.48]}
        args={[0.15, 0.02, 0.19]}
        radius={0.006}
        smoothness={2}
      >
        <meshStandardMaterial color="#355451" />
      </RoundedBox>
    </group>
  );
}

export function CoffeeBarDetails() {
  return (
    <group>
      <RoundedBox
        position={[2.28, 1.14, -2.7]}
        args={[0.48, 0.38, 0.38]}
        radius={0.035}
        smoothness={2}
        castShadow
      >
        <meshStandardMaterial
          color="#293c3f"
          metalness={0.55}
          roughness={0.28}
        />
      </RoundedBox>
      <RoundedBox
        position={[2.28, 1.15, -2.5]}
        args={[0.34, 0.22, 0.025]}
        radius={0.012}
        smoothness={2}
      >
        <meshStandardMaterial
          color="#98a6a1"
          metalness={0.75}
          roughness={0.2}
        />
      </RoundedBox>
      <mesh position={[2.28, 1.11, -2.47]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.12, 10]} />
        <meshStandardMaterial color="#c1aa80" metalness={0.7} roughness={0.2} />
      </mesh>
      <mesh position={[2.28, 0.98, -2.46]}>
        <cylinderGeometry args={[0.048, 0.04, 0.07, 16]} />
        <meshStandardMaterial color="#e3d4b8" roughness={0.25} />
      </mesh>
      <RoundedBox
        position={[3.14, 0.956, -2.7]}
        args={[0.45, 0.017, 0.31]}
        radius={0.04}
        smoothness={3}
      >
        <meshStandardMaterial color="#263d43" metalness={0.6} roughness={0.2} />
      </RoundedBox>
      <mesh position={[3.14, 1.075, -2.8]}>
        <torusGeometry args={[0.1, 0.012, 8, 20, Math.PI]} />
        <meshStandardMaterial color="#c1aa80" metalness={0.7} roughness={0.2} />
      </mesh>
      <RoundedBox
        position={[2.65, 1.84, -3.68]}
        args={[2.4, 0.055, 0.32]}
        radius={0.025}
        smoothness={2}
      >
        <SurfaceMaterial surface="walnut" />
      </RoundedBox>
      {[1.9, 2.16, 2.42, 2.68].map((x) => (
        <group key={x} position={[x, 1.93, -3.6]}>
          <mesh>
            <cylinderGeometry args={[0.06, 0.047, 0.13, 14]} />
            <meshStandardMaterial color="#e1d5ba" roughness={0.3} />
          </mesh>
          <mesh position={[0.065, 0, 0]}>
            <torusGeometry args={[0.027, 0.008, 6, 12]} />
            <meshStandardMaterial color="#e1d5ba" />
          </mesh>
        </group>
      ))}
      {[-0.52, 0.52].map((dx) => (
        <mesh
          key={dx}
          position={[2.65 + dx, 0.59, -2.32]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.01, 0.01, 0.3, 8]} />
          <meshStandardMaterial color="#c1aa80" metalness={0.7} />
        </mesh>
      ))}
    </group>
  );
}
export function MeetingAccessories() {
  return (
    <group>
      {[-0.9, 0.05, 1, 1.95].flatMap((x) =>
        [-1.92, -0.98].map((z) => (
          <group
            key={`${x}:${z}`}
            position={[x, 3.985, z]}
            rotation={[-0.16, 0, 0]}
          >
            <RoundedBox
              args={[0.31, 0.018, 0.23]}
              radius={0.008}
              smoothness={2}
            >
              <meshStandardMaterial
                color="#223c42"
                metalness={0.25}
                roughness={0.35}
              />
            </RoundedBox>
            <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.27, 0.19]} />
              <meshStandardMaterial
                color="#457d83"
                emissive="#457d83"
                emissiveIntensity={0.25}
              />
            </mesh>
          </group>
        )),
      )}
      <mesh position={[0.5, 4.06, -1.45]}>
        <cylinderGeometry args={[0.065, 0.085, 0.18, 16]} />
        <meshStandardMaterial
          color="#c4d8d1"
          transparent
          opacity={0.5}
          roughness={0.2}
          metalness={0.2}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0.25, 4.015, -1.45]}>
        <cylinderGeometry args={[0.035, 0.03, 0.09, 12]} />
        <meshStandardMaterial
          color="#c4d8d1"
          transparent
          opacity={0.5}
          roughness={0.2}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
