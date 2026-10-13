import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

export default function CharacterHead({
  index,
  reduced,
  speaking,
}: {
  index: number;
  reduced: boolean;
  speaking: boolean;
}) {
  const eyes = useRef<THREE.Group>(null),
    mouth = useRef<THREE.Group>(null);
  const skin = ["#dcb193", "#c88e6c", "#a46e51", "#e4c4a5"][index % 4];
  const hair = ["#252b32", "#55382b", "#34312d", "#b68b55"][index % 4];
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (eyes.current) {
      const blink = !reduced && (t + index * 0.61) % (3.4 + (index % 3)) < 0.13;
      eyes.current.scale.y = THREE.MathUtils.damp(
        eyes.current.scale.y,
        blink ? 0.08 : 1,
        35,
        dt,
      );
    }
    if (mouth.current)
      mouth.current.scale.y =
        reduced || !speaking ? 1 : 1.1 + Math.sin(t * 11) * 0.4;
  });
  return (
    <group>
      <mesh castShadow scale={[1, 1.08, 0.96]}>
        <sphereGeometry args={[0.215, 24, 18]} />
        <meshStandardMaterial color={skin} roughness={0.82} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.207, -0.01, 0]}
          scale={[0.6, 1, 0.8]}
        >
          <sphereGeometry args={[0.046, 12, 10]} />
          <meshStandardMaterial color={skin} />
        </mesh>
      ))}
      {index % 4 === 1 && (
        <mesh position={[0, -0.015, -0.12]} scale={[1.02, 1.3, 0.6]} castShadow>
          <sphereGeometry args={[0.22, 20, 14]} />
          <meshStandardMaterial color={hair} roughness={0.9} />
        </mesh>
      )}
      <mesh position={[0, 0.03, -0.014]} scale={[1.02, 1, 1]} castShadow>
        <sphereGeometry
          args={[0.22, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.53]}
        />
        <meshStandardMaterial color={hair} roughness={0.85} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[-0.105 + i * 0.085, 0.174 + i * 0.017, 0.088 - i * 0.032]}
          rotation={[0, 0, -0.25]}
          scale={[1.3, 0.75, 0.7]}
          castShadow
        >
          <sphereGeometry args={[0.088, 16, 12]} />
          <meshStandardMaterial color={hair} roughness={0.85} />
        </mesh>
      ))}
      <group ref={eyes} position={[0, 0.015, 0]}>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.078, 0, 0.197]}>
            <mesh scale={[1, 1.15, 0.5]}>
              <sphereGeometry args={[0.037, 16, 12]} />
              <meshStandardMaterial color="#fffbef" roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.001, 0.018]} scale={[1, 1, 0.55]}>
              <sphereGeometry args={[0.019, 12, 10]} />
              <meshStandardMaterial color="#374b45" roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.001, 0.028]}>
              <sphereGeometry args={[0.01, 10, 8]} />
              <meshStandardMaterial color="#13252a" roughness={0.2} />
            </mesh>
            <mesh position={[-0.006, 0.009, 0.035]}>
              <sphereGeometry args={[0.005, 8, 6]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </group>
        ))}
      </group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh
            position={[side * 0.082, 0.077, 0.179]}
            rotation={[0, 0, Math.PI / 2 + side * -0.12]}
          >
            <capsuleGeometry args={[0.009, 0.049, 3, 8]} />
            <meshStandardMaterial color={hair} />
          </mesh>
          <mesh
            position={[side * 0.126, -0.044, 0.174]}
            scale={[1, 0.55, 0.25]}
          >
            <sphereGeometry args={[0.043, 12, 10]} />
            <meshStandardMaterial color="#d89a82" roughness={0.9} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -0.03, 0.211]} scale={[0.85, 1.15, 1]}>
        <sphereGeometry args={[0.028, 16, 12]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      {(index === 0 || index === 10) && (
        <mesh position={[0, -0.07, 0.105]} scale={[0.85, 0.5, 0.6]}>
          <sphereGeometry args={[0.16, 18, 12]} />
          <meshStandardMaterial color={hair} roughness={0.9} />
        </mesh>
      )}
      <group ref={mouth} position={[0, -0.088, 0.213]}>
        <mesh rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.041, 0.009, 6, 18, Math.PI]} />
          <meshStandardMaterial color="#754b42" />
        </mesh>
      </group>
      {index % 3 === 0 && (
        <group>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.08, 0.015, 0.23]}>
              <torusGeometry args={[0.049, 0.008, 6, 18]} />
              <meshStandardMaterial
                color="#9e8153"
                metalness={0.6}
                roughness={0.3}
              />
            </mesh>
          ))}
          <mesh position={[0, 0.025, 0.231]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.005, 0.005, 0.065, 6]} />
            <meshStandardMaterial color="#9e8153" metalness={0.6} />
          </mesh>
        </group>
      )}
      {index >= 4 && index <= 7 && (
        <group>
          <mesh position={[0, 0.026, -0.01]}>
            <torusGeometry args={[0.239, 0.012, 6, 28, Math.PI]} />
            <meshStandardMaterial color="#24393e" roughness={0.4} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 0.233, 0, 0]}
              scale={[0.42, 1, 0.75]}
            >
              <sphereGeometry args={[0.072, 12, 10]} />
              <meshStandardMaterial color="#203a40" roughness={0.35} />
            </mesh>
          ))}
          <mesh position={[0.23, -0.075, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.009, 0.009, 0.19, 6]} />
            <meshStandardMaterial color="#24393e" />
          </mesh>
          <mesh position={[0.195, -0.075, 0.193]}>
            <sphereGeometry args={[0.022, 10, 8]} />
            <meshStandardMaterial color="#24393e" />
          </mesh>
        </group>
      )}
    </group>
  );
}
