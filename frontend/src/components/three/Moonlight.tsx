import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

export type MoonlightState = 'idle' | 'listening' | 'playing';

type MoonlightProps = {
  state: MoonlightState;
  /** 0-1 live input level: mic RMS while listening, playback RMS while playing. */
  amplitude?: number;
  size?: number;
  /** When set (a color pulled from the current track's cover art), overrides
   * the state-based palette so the moon's glow matches what's playing —
   * still gold-paired, still Duskglen, just tuned to this one track. */
  accentColor?: string;
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Duskglen accents: aurora teal, soft violet, star gold.
const TEAL = hexToRgb('#2FBFAA');
const VIOLET = hexToRgb('#9B8FD9');
const GOLD = hexToRgb('#E8C468');
const SILVER = hexToRgb('#E7EBE6');

const PALETTE: Record<MoonlightState, [[number, number, number], [number, number, number]]> = {
  idle: [TEAL, VIOLET],
  listening: [TEAL, GOLD],
  playing: [VIOLET, GOLD],
};

const STAR_COUNT = 42;

/**
 * The app's one signature visual: a moon, softly glowing, drifting stars
 * around it — the same clearing the brand mark stands in. Replaces the old
 * spiky reactive-orb look with something calmer and considerably closer to
 * "a private night sky" than "an AI is listening" cliché.
 */
function MoonMesh({ state, amplitude = 0, accentColor }: MoonlightProps) {
  const accentRgb = useMemo(() => (accentColor ? hexToRgb(accentColor) : null), [accentColor]);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const starsRef = useRef<THREE.Points>(null);
  const starMaterialRef = useRef<THREE.PointsMaterial>(null);

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 96, 96), []);
  const haloGeometry = useMemo(() => new THREE.SphereGeometry(1.14, 32, 32), []);
  const ringGeometry = useMemo(() => new THREE.TorusGeometry(1.55, 0.006, 8, 128), []);

  // Sparse drifting stars at varying distance — fireflies, not a dust cloud.
  const starGeometry = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const seeds = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.7 + Math.random() * 1.1;
      const height = (Math.random() - 0.5) * 2.0;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    return geo;
  }, []);

  const basePositions = useMemo(
    () => Float32Array.from(geometry.attributes.position.array as ArrayLike<number>),
    [geometry],
  );
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    const t = elapsed.current;
    const mesh = meshRef.current;
    if (!mesh) return;

    const speed = state === 'idle' ? 0.035 : state === 'listening' ? 0.07 : 0.1;
    mesh.rotation.y += delta * speed;

    // Gentle breathing terrain — slow, low-amplitude, no spikes.
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const intensity = state === 'idle' ? 0.015 : 0.02 + amplitude * 0.05;
    for (let i = 0; i < posAttr.count; i++) {
      const ix = i * 3;
      const bx = basePositions[ix];
      const by = basePositions[ix + 1];
      const bz = basePositions[ix + 2];
      const len = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
      const nx = bx / len;
      const ny = by / len;
      const nz = bz / len;
      const noise = Math.sin(nx * 3 + t * 0.5) * 0.5 + Math.sin(ny * 4 + t * 0.35) * 0.3 + Math.sin(nz * 3.5 + t * 0.4) * 0.4;
      const displacement = 1 + noise * intensity;
      posAttr.setXYZ(i, bx * displacement, by * displacement, bz * displacement);
    }
    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();

    const [c1, c2] = accentRgb ? [accentRgb, GOLD] : PALETTE[state];
    const mix = (Math.sin(t * 0.35) + 1) / 2;
    const r = SILVER[0] * 0.7 + (c1[0] + (c2[0] - c1[0]) * mix) * 0.3;
    const g = SILVER[1] * 0.7 + (c1[1] + (c2[1] - c1[1]) * mix) * 0.3;
    const b = SILVER[2] * 0.7 + (c1[2] + (c2[2] - c1[2]) * mix) * 0.3;
    const glowR = c1[0] + (c2[0] - c1[0]) * mix;
    const glowG = c1[1] + (c2[1] - c1[1]) * mix;
    const glowB = c1[2] + (c2[2] - c1[2]) * mix;

    if (materialRef.current) {
      materialRef.current.color.setRGB(r, g, b);
      materialRef.current.emissive.setRGB(glowR * 0.35, glowG * 0.35, glowB * 0.35);
      materialRef.current.emissiveIntensity = state === 'idle' ? 0.4 : 0.55 + amplitude * 0.7;
    }

    const scale = state === 'idle' ? 1 + Math.sin(t * 0.6) * 0.015 : 1 + amplitude * 0.06;
    mesh.scale.setScalar(scale);

    if (haloRef.current) {
      const haloMat = haloRef.current.material as THREE.MeshBasicMaterial;
      haloMat.color.setRGB(glowR, glowG, glowB);
      haloMat.opacity = 0.16 + amplitude * 0.22;
      haloRef.current.scale.setScalar(scale * (1.08 + Math.sin(t * 0.9) * 0.02));
    }

    // One slim halo ring, tilted, drifting — a hint of celestial elegance
    // instead of a busy wireframe cage.
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * speed * 0.4;
      ringRef.current.rotation.x = 1.15 + Math.sin(t * 0.2) * 0.05;
    }
    if (ringMaterialRef.current) {
      ringMaterialRef.current.color.setRGB(glowR, glowG, glowB);
      ringMaterialRef.current.opacity = 0.35 + amplitude * 0.35;
    }

    // Sparse stars: slow orbit + gentle twinkle, no dense dust-belt motion.
    if (starsRef.current) {
      starsRef.current.rotation.y += delta * (0.02 + amplitude * 0.15);
    }
    if (starMaterialRef.current) {
      starMaterialRef.current.color.setRGB(SILVER[0], SILVER[1], SILVER[2]);
      starMaterialRef.current.opacity = 0.55 + Math.sin(t * 1.6) * 0.2 + amplitude * 0.2;
      starMaterialRef.current.size = 0.028 + amplitude * 0.012;
    }
  });

  return (
    <group>
      <mesh ref={haloRef} geometry={haloGeometry}>
        <meshBasicMaterial
          transparent
          opacity={0.16}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          color="#2FBFAA"
        />
      </mesh>
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial ref={materialRef} roughness={0.85} metalness={0.04} emissive="#2FBFAA" />
      </mesh>
      <mesh ref={ringRef} geometry={ringGeometry} rotation={[1.15, 0, 0]}>
        <meshBasicMaterial
          ref={ringMaterialRef}
          transparent
          opacity={0.35}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          color="#9B8FD9"
        />
      </mesh>
      <points ref={starsRef} geometry={starGeometry}>
        <pointsMaterial
          ref={starMaterialRef}
          size={0.028}
          sizeAttenuation
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          color="#E7EBE6"
        />
      </points>
    </group>
  );
}

export function Moonlight({ state, amplitude = 0, size = 220, accentColor }: MoonlightProps) {
  return (
    <View style={{ width: size, height: size }}>
      <Canvas camera={{ position: [0, 0, 3.4], fov: 42 }}>
        <ambientLight intensity={0.4} />
        <pointLight position={[2.2, 2.2, 2]} intensity={1.1} color="#E7EBE6" />
        <pointLight position={[-2.2, -1.2, -2]} intensity={0.7} color="#9B8FD9" />
        <pointLight position={[0, -2.4, 1.5]} intensity={0.5} color="#E8C468" />
        <MoonMesh state={state} amplitude={amplitude} accentColor={accentColor} />
      </Canvas>
    </View>
  );
}
