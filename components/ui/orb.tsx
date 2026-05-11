"use client"

import { useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import * as THREE from "three"

// ─── Public Types ─────────────────────────────────────────────────────────────

export type AgentState = null | "thinking" | "listening" | "talking"

export type OrbState = "idle" | "wake-listening" | "listening" | "thinking" | "speaking"

type OrbProps = {
  agentState?: AgentState
  orbState?: OrbState
  audioLevel?: number
  className?: string
}

// ─── State → Visual Mapping ───────────────────────────────────────────────────

const STATE_CONFIG: Record<
  OrbState,
  {
    color1: THREE.Color
    color2: THREE.Color
    pulseSpeed: number
    pulseAmp: number
    noiseScale: number
    rotSpeed: number
    spread: number
  }
> = {
  idle: {
    color1: new THREE.Color("#22d3ee"),
    color2: new THREE.Color("#0e7490"),
    pulseSpeed: 0.6,
    pulseAmp: 0.03,
    noiseScale: 0.8,
    rotSpeed: 0.06,
    spread: 1.0,
  },
  "wake-listening": {
    color1: new THREE.Color("#818cf8"),
    color2: new THREE.Color("#6366f1"),
    pulseSpeed: 1.2,
    pulseAmp: 0.06,
    noiseScale: 1.2,
    rotSpeed: 0.12,
    spread: 1.05,
  },
  listening: {
    color1: new THREE.Color("#4ade80"),
    color2: new THREE.Color("#22d3ee"),
    pulseSpeed: 1.8,
    pulseAmp: 0.10,
    noiseScale: 1.6,
    rotSpeed: 0.18,
    spread: 1.12,
  },
  thinking: {
    color1: new THREE.Color("#fb923c"),
    color2: new THREE.Color("#fbbf24"),
    pulseSpeed: 2.4,
    pulseAmp: 0.14,
    noiseScale: 2.2,
    rotSpeed: 0.28,
    spread: 1.08,
  },
  speaking: {
    color1: new THREE.Color("#e879f9"),
    color2: new THREE.Color("#c084fc"),
    pulseSpeed: 3.0,
    pulseAmp: 0.18,
    noiseScale: 2.8,
    rotSpeed: 0.22,
    spread: 1.14,
  },
}

// ─── Sphere Particle Generation ───────────────────────────────────────────────

const PARTICLE_COUNT = 2400
const BASE_RADIUS = 1.6

function generateSphereParticles(count: number) {
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const noiseSeed = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    // Fibonacci sphere for even distribution
    const phi = Math.acos(1 - (2 * (i + 0.5)) / count)
    const theta = Math.PI * (1 + Math.sqrt(5)) * i

    // Add slight randomness to avoid perfect grid look
    const jitter = 0.06
    const r = BASE_RADIUS + (Math.random() - 0.5) * jitter * 2

    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)

    // Vary particle sizes slightly — surface particles slightly bigger
    sizes[i] = 0.012 + Math.random() * 0.018

    // Per-particle random seeds for noise animation
    noiseSeed[i * 3 + 0] = Math.random() * Math.PI * 2
    noiseSeed[i * 3 + 1] = Math.random() * Math.PI * 2
    noiseSeed[i * 3 + 2] = Math.random() * Math.PI * 2
  }

  return { positions, sizes, noiseSeed }
}

// ─── Shader source ────────────────────────────────────────────────────────────

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aNoiseSeed;

  uniform float uTime;
  uniform float uPulseSpeed;
  uniform float uPulseAmp;
  uniform float uNoiseScale;
  uniform float uSpread;
  uniform float uAudioLevel;

  varying float vDepth;
  varying float vNoise;

  // Smooth noise helpers
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vec3 pos = position;

    // Per-particle noise displacement — radial only (stays on sphere surface)
    float t = uTime * uPulseSpeed;
    float n = snoise(vec3(
      aNoiseSeed.x + pos.x * uNoiseScale + t * 0.3,
      aNoiseSeed.y + pos.y * uNoiseScale + t * 0.25,
      aNoiseSeed.z + pos.z * uNoiseScale + t * 0.2
    ));

    // Audio reactivity — expands sphere outward on beat
    float audioBoost = uAudioLevel * 0.25;

    float displacement = n * uPulseAmp + audioBoost;
    vec3 dir = normalize(pos);
    pos += dir * displacement * uSpread;

    vDepth = (pos.z + 2.0) / 4.0;
    vNoise = n * 0.5 + 0.5;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aSize * (320.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform float uOpacity;

  varying float vDepth;
  varying float vNoise;

  void main() {
    // Circular soft point
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;

    float alpha = smoothstep(0.5, 0.1, dist);

    // Depth-based color mix (front particles = color1, back = color2)
    vec3 color = mix(uColor2, uColor1, vDepth * 0.7 + vNoise * 0.3);

    // Slight glow boost at center of each point
    float glow = smoothstep(0.5, 0.0, dist) * 0.4;
    color += glow;

    gl_FragColor = vec4(color, alpha * uOpacity);
  }
`

// ─── Inner R3F Scene ──────────────────────────────────────────────────────────

function ParticleSphere({
  orbState = "idle",
  audioLevel = 0,
}: {
  orbState: OrbState
  audioLevel: number
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const clockRef = useRef(0)

  // Target refs — updated every frame, no re-renders
  const targetColor1 = useRef(new THREE.Color("#22d3ee"))
  const targetColor2 = useRef(new THREE.Color("#0e7490"))
  const targetPulseSpeed = useRef(0.6)
  const targetPulseAmp = useRef(0.03)
  const targetNoiseScale = useRef(0.8)
  const targetRotSpeed = useRef(0.06)
  const targetSpread = useRef(1.0)
  const currentRotY = useRef(0)
  const opacityRef = useRef(0)

  // Snapshot latest orbState into a ref so the RAF loop reads it without stale closure
  const orbStateRef = useRef(orbState)
  const audioRef = useRef(audioLevel)

  orbStateRef.current = orbState
  audioRef.current = audioLevel

  // Geometry + attribute buffers
  const { geometry, uniforms } = useMemo(() => {
    const { positions, sizes, noiseSeed } = generateSphereParticles(PARTICLE_COUNT)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1))
    geo.setAttribute("aNoiseSeed", new THREE.BufferAttribute(noiseSeed, 3))

    const u = {
      uTime: { value: 0 },
      uPulseSpeed: { value: 0.6 },
      uPulseAmp: { value: 0.03 },
      uNoiseScale: { value: 0.8 },
      uSpread: { value: 1.0 },
      uAudioLevel: { value: 0 },
      uColor1: { value: new THREE.Color("#22d3ee") },
      uColor2: { value: new THREE.Color("#0e7490") },
      uOpacity: { value: 0 },
    }

    return { geometry: geo, uniforms: u }
  }, [])

  useFrame((_, delta) => {
    if (!matRef.current || !pointsRef.current) return

    const cfg = STATE_CONFIG[orbStateRef.current]
    const u = matRef.current.uniforms
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    // Fade in
    opacityRef.current = Math.min(1, opacityRef.current + delta * 1.5)
    u.uOpacity.value = opacityRef.current

    // Smooth target transitions
    targetColor1.current.lerp(cfg.color1, 0.04)
    targetColor2.current.lerp(cfg.color2, 0.04)
    targetPulseSpeed.current = lerp(targetPulseSpeed.current, cfg.pulseSpeed, 0.05)
    targetPulseAmp.current = lerp(targetPulseAmp.current, cfg.pulseAmp, 0.05)
    targetNoiseScale.current = lerp(targetNoiseScale.current, cfg.noiseScale, 0.04)
    targetRotSpeed.current = lerp(targetRotSpeed.current, cfg.rotSpeed, 0.04)
    targetSpread.current = lerp(targetSpread.current, cfg.spread, 0.05)

    // Audio reactivity smoothing
    u.uAudioLevel.value = lerp(u.uAudioLevel.value, audioRef.current, 0.15)

    clockRef.current += delta
    u.uTime.value = clockRef.current
    u.uPulseSpeed.value = targetPulseSpeed.current
    u.uPulseAmp.value = targetPulseAmp.current
    u.uNoiseScale.value = targetNoiseScale.current
    u.uSpread.value = targetSpread.current
    u.uColor1.value.copy(targetColor1.current)
    u.uColor2.value.copy(targetColor2.current)

    // Continuous slow rotation — speeds up with activity
    currentRotY.current += delta * targetRotSpeed.current
    pointsRef.current.rotation.y = currentRotY.current
    pointsRef.current.rotation.x = Math.sin(clockRef.current * 0.07) * 0.12
  })

  return (
    <points ref={pointsRef} geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ─── Public Component ─────────────────────────────────────────────────────────

export function Orb({ orbState = "idle", audioLevel = 0, className }: OrbProps) {
  return (
    <div className={className ?? "relative h-full w-full"} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 4.2], fov: 45 }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        }}
        dpr={[1, 1.5]}
      >
        <ParticleSphere orbState={orbState} audioLevel={audioLevel} />
      </Canvas>
    </div>
  )
}
