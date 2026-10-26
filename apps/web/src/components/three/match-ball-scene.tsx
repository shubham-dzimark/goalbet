'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { gsap } from '@/lib/gsap';

const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * Cell centres of a truncated icosahedron (a football): 12 pentagons sit on the icosahedron's
 * vertices, 20 hexagons on its face centres (= dodecahedron vertices). A spherical Voronoi split
 * around these 32 points reproduces the real panel layout.
 */
function ballCenters(): THREE.Vector3[] {
  const pent: number[][] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) pent.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
  const hex: number[][] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) hex.push([x, y, z]);
  const ip = 1 / PHI;
  for (const a of [-1, 1]) for (const b of [-1, 1]) hex.push([0, a * ip, b * PHI], [a * ip, b * PHI, 0], [b * PHI, 0, a * ip]);
  return [...pent, ...hex].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());
}

// Pentagon centres get a small bias so their cells shrink to the real proportions: on a truncated
// icosahedron the pentagon/hexagon border sits ~44% of the way from the pentagon centre, not 50%.
const CELL_LOOP = /* glsl */ `
  float d1 = -2.0; float d2 = -2.0; int idx = 0;
  for (int i = 0; i < 32; i++) {
    float d = dot(p, uCenters[i]) - (i < 12 ? 0.024 : 0.0);
    if (d > d1) { d2 = d1; d1 = d; idx = i; } else if (d > d2) { d2 = d; }
  }
  float edge = d1 - d2;
`;

const vertexShader = /* glsl */ `
  uniform vec3 uCenters[32];
  varying vec3 vObj;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vec3 p = normalize(position);
    ${CELL_LOOP}
    // panels bulge slightly between the seams
    float puff = smoothstep(0.0, 0.09, edge) * 0.022;
    vec3 pos = position + normal * puff;
    vObj = position;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uCenters[32];
  uniform vec3 uPent;
  uniform vec3 uHex;
  uniform vec3 uRim;
  uniform vec3 uFill;
  varying vec3 vObj;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vec3 p = normalize(vObj);
    ${CELL_LOOP}
    float seam = 1.0 - smoothstep(0.003, 0.011, edge);
    float ao = smoothstep(0.0, 0.07, edge);
    vec3 base = idx < 12 ? uPent : uHex;
    base *= mix(0.78, 1.0, ao);
    base = mix(base, vec3(0.03, 0.05, 0.08), seam);

    vec3 n = normalize(vN);
    vec3 V = normalize(-vView);
    vec3 L = normalize(vec3(-0.55, 0.85, 0.6));
    vec3 H = normalize(L + V);
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(n, H), 0.0), idx < 12 ? 36.0 : 60.0) * (idx < 12 ? 0.35 : 0.75);
    float rim = pow(1.0 - max(dot(n, V), 0.0), 2.6);
    float fill = max(dot(n, normalize(vec3(0.95, -0.25, 0.35))), 0.0);

    vec3 col = base * (0.36 + 0.78 * diff);
    col += base * fill * uFill * 0.22;
    col += spec * (1.0 - seam);
    col += rim * uRim * 0.85;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function Ball({ pointer, scroll }: { pointer: MutableRefObject<{ x: number; y: number }>; scroll: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(
    () => ({
      uCenters: { value: ballCenters() },
      uPent: { value: new THREE.Color('#0c8f5f') },
      uHex: { value: new THREE.Color('#f3f6fa') },
      uRim: { value: new THREE.Color('#16c784') },
      uFill: { value: new THREE.Color('#f5b942') },
    }),
    [],
  );

  useEffect(() => {
    if (!group.current) return;
    const tl = gsap.timeline();
    tl.fromTo(group.current.scale, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1, duration: 1.6, ease: 'elastic.out(1, 0.55)' }).fromTo(
      group.current.rotation,
      { y: -Math.PI * 1.5 },
      { y: 0, duration: 1.8, ease: 'power3.out' },
      0,
    );
    return () => {
      tl.kill();
    };
  }, []);

  useFrame((state, delta) => {
    const g = group.current;
    const b = ball.current;
    if (!g || !b) return;
    const t = state.clock.elapsedTime;
    b.rotation.y += delta * (0.35 + scroll.current * 2.2);
    b.rotation.x += delta * 0.08;
    // tilt toward the pointer, float, and drift with scroll
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, pointer.current.y * 0.35, 0.06);
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, -pointer.current.x * 0.25, 0.06);
    g.position.x = THREE.MathUtils.lerp(g.position.x, pointer.current.x * 0.18, 0.05);
    g.position.y = Math.sin(t * 1.3) * 0.09 - scroll.current * 0.35;
  });

  return (
    <group ref={group}>
      <mesh ref={ball}>
        <sphereGeometry args={[1, 160, 160]} />
        <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} />
      </mesh>
    </group>
  );
}

function OrbitRings({ scroll }: { scroll: MutableRefObject<number> }) {
  const a = useRef<THREE.Mesh>(null);
  const b = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (a.current) a.current.rotation.z += delta * (0.25 + scroll.current);
    if (b.current) b.current.rotation.z -= delta * (0.18 + scroll.current * 0.8);
  });
  return (
    <>
      <mesh ref={a} rotation={[Math.PI / 2.4, 0.2, 0]}>
        <torusGeometry args={[1.42, 0.006, 8, 160]} />
        <meshBasicMaterial color="#16c784" transparent opacity={0.55} />
      </mesh>
      <mesh ref={b} rotation={[Math.PI / 1.8, -0.5, 0]}>
        <torusGeometry args={[1.68, 0.004, 8, 160]} />
        <meshBasicMaterial color="#f5b942" transparent opacity={0.35} />
      </mesh>
    </>
  );
}

/** Floodlight dust: a slow vortex of emerald and gold points. */
function Dust({ count = 340 }: { count?: number }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const emerald = new THREE.Color('#16c784');
    const gold = new THREE.Color('#f5b942');
    // deterministic pseudo-random so server/client and re-mounts look the same
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      const r = 1.6 + rnd() * 1.9;
      const th = rnd() * Math.PI * 2;
      const y = (rnd() - 0.5) * 3.2;
      pos.set([Math.cos(th) * r, y, Math.sin(th) * r - 0.6], i * 3);
      const c = rnd() > 0.72 ? gold : emerald;
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [count]);
  useFrame((state, delta) => {
    if (!points.current) return;
    points.current.rotation.y += delta * 0.05;
    points.current.position.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.1;
  });
  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial size={0.035} vertexColors transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

/** Soft glow "spot" under the ball. */
function GroundGlow() {
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(22,199,132,0.55)');
    g.addColorStop(0.5, 'rgba(22,199,132,0.12)');
    g.addColorStop(1, 'rgba(22,199,132,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.35, 0]}>
      <planeGeometry args={[3.6, 3.6]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

/**
 * React Three Fiber scene for the stadium hero. `scroll` (0–1) is driven by ScrollTrigger in the
 * parent; the pointer is tracked on the window so the ball reacts across the whole hero.
 */
export default function MatchBallScene({ scroll }: { scroll: MutableRefObject<number> }) {
  const pointer = useRef({ x: 0, y: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  // stop rendering frames while the scene is scrolled out of view (hidden tabs already pause rAF)
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      pointer.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);

  return (
    <div ref={wrap} className="h-full w-full">
      <Canvas
        frameloop={visible ? 'always' : 'never'}
        camera={{ position: [0, 0.15, 4.4], fov: 38 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        aria-hidden="true"
      >
        <Dust />
        <GroundGlow />
        <OrbitRings scroll={scroll} />
        <Ball pointer={pointer} scroll={scroll} />
      </Canvas>
    </div>
  );
}
