import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

export type OrbState = 'idle' | 'listening' | 'playing';

type OrbProps = {
  state: OrbState;
  /** 0-1 live input level: mic RMS while listening, playback RMS while playing. */
  amplitude?: number;
  size?: number;
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Wavecairn accents: copper signal, teal wave, terracotta bloom.
const PALETTE: Record<OrbState, [[number, number, number], [number, number, number]]> = {
  idle: [hexToRgb('#E0954F'), hexToRgb('#46A69C')],
  listening: [hexToRgb('#E0954F'), hexToRgb('#B8735C')],
  playing: [hexToRgb('#46A69C'), hexToRgb('#B8735C')],
};

const PARTICLE_COUNT = 110;

function OrbMesh({ state, amplitude = 0 }: OrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const wireRef = useRef<THREE.Mesh>(null);
  const wireMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const particleMaterialRef = useRef<THREE.PointsMaterial>(null);

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 3), []);
  const wireGeometry = useMemo(() => new THREE.IcosahedronGeometry(1.28, 1), []);
  const haloGeometry = useMemo(() => new THREE.SphereGeometry(1.12, 32, 32), []);

  // A ring-biased particle cloud: most points hug an equatorial belt so the
  // orb reads as a tiny planet with orbiting dust, not random static.
  const particleGeometry = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.45 + Math.random() * 0.55;
      const belt = (Math.random() - 0.5) * (Math.random() < 0.75 ? 0.35 : 1.4);
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = belt;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
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

    const speed = state === 'idle' ? 0.08 : state === 'listening' ? 0.18 : 0.28;
    mesh.rotation.y += delta * speed;
    mesh.rotation.x = Math.sin(t * 0.15) * 0.15;

    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const intensity = state === 'idle' ? 0.05 : 0.07 + amplitude * 0.38;

    // Layered sine displacement turns a single scalar amplitude into organic
    // blob motion — there's no true per-frequency-band split here (that would
    // need an FFT), but `amplitude` itself is real signal, not simulated: RMS
    // of live mic PCM frames while listening, and RMS of the player's own
    // audioSampleUpdate PCM frames while playing (see PlayerService).
    for (let i = 0; i < posAttr.count; i++) {
      const ix = i * 3;
      const bx = basePositions[ix];
      const by = basePositions[ix + 1];
      const bz = basePositions[ix + 2];
      const len = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
      const nx = bx / len;
      const ny = by / len;
      const nz = bz / len;

      const noise =
        Math.sin(nx * 4 + t * 2.2) * 0.5 + Math.sin(ny * 6 + t * 3.1) * 0.3 + Math.sin(nz * 5 + t * 1.7) * 0.4;

      const displacement = 1 + noise * intensity;
      posAttr.setXYZ(i, bx * displacement, by * displacement, bz * displacement);
    }
    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();

    const [c1, c2] = PALETTE[state];
    const mix = (Math.sin(t * 0.6) + 1) / 2;
    const r = c1[0] + (c2[0] - c1[0]) * mix;
    const g = c1[1] + (c2[1] - c1[1]) * mix;
    const b = c1[2] + (c2[2] - c1[2]) * mix;

    if (materialRef.current) {
      materialRef.current.color.setRGB(r, g, b);
      materialRef.current.emissive.setRGB(r * 0.6, g * 0.6, b * 0.6);
      materialRef.current.emissiveIntensity = state === 'idle' ? 0.55 : 0.75 + amplitude * 1.1;
    }

    const scale = state === 'idle' ? 1 + Math.sin(t * 0.9) * 0.03 : 1 + amplitude * 0.12;
    mesh.scale.setScalar(scale);

    // Wireframe cage counter-rotates slowly and breathes against the core.
    if (wireRef.current) {
      wireRef.current.rotation.y -= delta * speed * 0.6;
      wireRef.current.rotation.z = Math.sin(t * 0.2) * 0.25;
      wireRef.current.scale.setScalar(1 + Math.sin(t * 0.7) * 0.02 + amplitude * 0.08);
    }
    if (wireMaterialRef.current) {
      wireMaterialRef.current.color.setRGB(r, g, b);
      wireMaterialRef.current.opacity = 0.16 + amplitude * 0.3 + (state === 'idle' ? 0.02 : 0.08);
    }

    // Soft additive halo behind the core for the rim-glow read.
    if (haloRef.current) {
      const haloMat = haloRef.current.material as THREE.MeshBasicMaterial;
      haloMat.color.setRGB(r, g, b);
      haloMat.opacity = 0.14 + amplitude * 0.2;
      haloRef.current.scale.setScalar(scale * (1.06 + Math.sin(t * 1.4) * 0.015));
    }

    // Orbiting dust belt speeds up with the music.
    if (particlesRef.current) {
      particlesRef.current.rotation.y += delta * (0.12 + amplitude * 0.9 + (state === 'idle' ? 0 : 0.1));
      particlesRef.current.rotation.x = Math.sin(t * 0.1) * 0.22;
    }
    if (particleMaterialRef.current) {
      particleMaterialRef.current.color.setRGB(r, g, b);
      particleMaterialRef.current.opacity = 0.45 + amplitude * 0.5;
      particleMaterialRef.current.size = 0.035 + amplitude * 0.03;
    }
  });

  return (
    <group>
      <mesh ref={haloRef} geometry={haloGeometry}>
        <meshBasicMaterial
          transparent
          opacity={0.14}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          color="#E0954F"
        />
      </mesh>
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          ref={materialRef}
          roughness={0.18}
          metalness={0.5}
          emissive="#E0954F"
          flatShading
        />
      </mesh>
      <mesh ref={wireRef} geometry={wireGeometry}>
        <meshBasicMaterial
          ref={wireMaterialRef}
          wireframe
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          color="#46A69C"
        />
      </mesh>
      <points ref={particlesRef} geometry={particleGeometry}>
        <pointsMaterial
          ref={particleMaterialRef}
          size={0.035}
          sizeAttenuation
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          color="#E0954F"
        />
      </points>
    </group>
  );
}

export function Orb({ state, amplitude = 0, size = 220 }: OrbProps) {
  return (
    <View style={{ width: size, height: size }}>
      <Canvas camera={{ position: [0, 0, 3.4], fov: 42 }}>
        <ambientLight intensity={0.35} />
        <pointLight position={[2.2, 2.2, 2]} intensity={1.4} color="#7DD3FC" />
        <pointLight position={[-2.2, -1.2, -2]} intensity={0.8} color="#46A69C" />
        <pointLight position={[0, -2.4, 1.5]} intensity={0.4} color="#B8735C" />
        <OrbMesh state={state} amplitude={amplitude} />
      </Canvas>
    </View>
  );
}
