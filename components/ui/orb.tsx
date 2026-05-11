"use client"

import { useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import * as THREE from "three"

// ─── Public Types ─────────────────────────────────────────────────────────────

export type OrbState = "idle" | "wake-listening" | "listening" | "thinking" | "speaking"

type OrbProps = {
  orbState?: OrbState
  audioLevel?: number
  className?: string
}

// ─── State → Visual Config ───────────────────────────────────────────────────
// Perplexity-style: monochromatic teal/cyan at rest, reactive color shifts per state

const STATE_CONFIG: Record<
  OrbState,
  {
    colorCore: THREE.Color    // bright inner particles
    colorMid: THREE.Color     // mid-layer
    colorEdge: THREE.Color    // edge/outer
    pulseSpeed: number        // FBM animation speed
    pulseAmp: number          // radial displacement amplitude
    fbmOctaves: number        // noise complexity (1–4)
    rotSpeedY: number         // Y-axis rotation speed
    rotSpeedX: number         // X-axis wobble amplitude
    spreadFactor: number      // overall sphere scale
    opacityBoost: number      // particle opacity multiplier
    audioMult: number         // audio sensitivity
  }
> = {
  idle: {
    colorCore: new THREE.Color("#5eead4"),   // teal-300
    colorMid:  new THREE.Color("#0d9488"),   // teal-600
    colorEdge: new THREE.Color("#042f2e"),   // teal-950
    pulseSpeed:  0.55,
    pulseAmp:    0.022,
    fbmOctaves:  1,
    rotSpeedY:   0.055,
    rotSpeedX:   0.07,
    spreadFactor: 1.0,
    opacityBoost: 1.0,
    audioMult:    0.15,
  },
  "wake-listening": {
    colorCore: new THREE.Color("#a5b4fc"),   // indigo-300
    colorMid:  new THREE.Color("#6366f1"),   // indigo-500
    colorEdge: new THREE.Color("#1e1b4b"),   // indigo-950
    pulseSpeed:  1.1,
    pulseAmp:    0.048,
    fbmOctaves:  2,
    rotSpeedY:   0.10,
    rotSpeedX:   0.10,
    spreadFactor: 1.05,
    opacityBoost: 1.1,
    audioMult:    0.20,
  },
  listening: {
    colorCore: new THREE.Color("#86efac"),   // green-300
    colorMid:  new THREE.Color("#22d3ee"),   // cyan-400
    colorEdge: new THREE.Color("#052e16"),   // green-950
    pulseSpeed:  1.7,
    pulseAmp:    0.080,
    fbmOctaves:  2,
    rotSpeedY:   0.16,
    rotSpeedX:   0.13,
    spreadFactor: 1.10,
    opacityBoost: 1.2,
    audioMult:    0.35,
  },
  thinking: {
    colorCore: new THREE.Color("#fcd34d"),   // amber-300
    colorMid:  new THREE.Color("#f97316"),   // orange-500
    colorEdge: new THREE.Color("#431407"),   // orange-950
    pulseSpeed:  2.6,
    pulseAmp:    0.120,
    fbmOctaves:  3,
    rotSpeedY:   0.26,
    rotSpeedX:   0.20,
    spreadFactor: 1.07,
    opacityBoost: 1.15,
    audioMult:    0.10,
  },
  speaking: {
    colorCore: new THREE.Color("#f0abfc"),   // fuchsia-300
    colorMid:  new THREE.Color("#a855f7"),   // purple-500
    colorEdge: new THREE.Color("#2e1065"),   // violet-950
    pulseSpeed:  3.2,
    pulseAmp:    0.150,
    fbmOctaves:  3,
    rotSpeedY:   0.20,
    rotSpeedX:   0.16,
    spreadFactor: 1.14,
    opacityBoost: 1.25,
    audioMult:    0.40,
  },
}

// ─── Particle Geometry ────────────────────────────────────────────────────────
// Volumetric sphere: fibonacci surface (80%) + volumetric interior (20%)

const PARTICLE_COUNT = 3600
const BASE_RADIUS    = 1.55

function buildSphereGeometry(count: number): THREE.BufferGeometry {
  const positions  = new Float32Array(count * 3)
  const sizes      = new Float32Array(count)
  const seeds      = new Float32Array(count * 3)    // per-particle noise phase
  const radiusFrac = new Float32Array(count)         // 0=center, 1=surface (for color depth)

  const surfaceCount = Math.floor(count * 0.78)
  const innerCount   = count - surfaceCount

  // Fibonacci lattice — most even spherical distribution possible
  for (let i = 0; i < surfaceCount; i++) {
    const phi   = Math.acos(1 - (2 * (i + 0.5)) / surfaceCount)
    const theta = Math.PI * (1 + Math.sqrt(5)) * i
    const jitter = (Math.random() - 0.5) * 0.055
    const r = BASE_RADIUS + jitter

    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)

    sizes[i]       = 0.011 + Math.random() * 0.016
    radiusFrac[i]  = 0.75 + Math.random() * 0.25   // surface band
    seeds[i * 3]   = Math.random() * 6.28
    seeds[i * 3+1] = Math.random() * 6.28
    seeds[i * 3+2] = Math.random() * 6.28
  }

  // Volumetric interior — random spherical distribution
  for (let i = surfaceCount; i < count; i++) {
    const u = Math.random()
    const v = Math.random()
    const theta = 2 * Math.PI * u
    const phi   = Math.acos(2 * v - 1)
    const r     = BASE_RADIUS * Math.cbrt(Math.random()) * 0.90   // volume-uniform

    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)

    sizes[i]       = 0.006 + Math.random() * 0.010   // interior smaller
    radiusFrac[i]  = r / BASE_RADIUS                  // 0–0.9
    seeds[i * 3]   = Math.random() * 6.28
    seeds[i * 3+1] = Math.random() * 6.28
    seeds[i * 3+2] = Math.random() * 6.28
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position",    new THREE.BufferAttribute(positions,  3))
  geo.setAttribute("aSize",       new THREE.BufferAttribute(sizes,      1))
  geo.setAttribute("aSeed",       new THREE.BufferAttribute(seeds,      3))
  geo.setAttribute("aRadiusFrac", new THREE.BufferAttribute(radiusFrac, 1))
  return geo
}

// ─── Vertex Shader — FBM Simplex Noise ───────────────────────────────────────

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3  aSeed;
  attribute float aRadiusFrac;

  uniform float uTime;
  uniform float uPulseSpeed;
  uniform float uPulseAmp;
  uniform float uNoiseScale;
  uniform float uSpread;
  uniform float uAudioLevel;
  uniform float uOpacityBoost;

  varying float vDepth;
  varying float vBrightness;
  varying float vRadiusFrac;

  // ── Simplex Noise 3D (Ashima / Ian McEwan) ────────────────────────────────
  vec3 mod289(vec3 x){ return x - floor(x*(1./289.))*289.; }
  vec4 mod289(vec4 x){ return x - floor(x*(1./289.))*289.; }
  vec4 permute(vec4 x){ return mod289(((x*34.)+1.)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }

  float snoise(vec3 v){
    const vec2 C = vec2(1./6., 1./3.);
    const vec4 D = vec4(0., 0.5, 1., 2.);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g  = step(x0.yzx, x0.xyz);
    vec3 l  = 1. - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0., i1.z, i2.z, 1.))
      + i.y + vec4(0., i1.y, i2.y, 1.))
      + i.x + vec4(0., i1.x, i2.x, 1.));
    float n_ = 0.142857142857;
    vec3 ns = n_*D.wyz - D.xzx;
    vec4 j  = p - 49.*floor(p*ns.z*ns.z);
    vec4 x_ = floor(j*ns.z);
    vec4 y_ = floor(j - 7.*x_);
    vec4 x  = x_*ns.x + ns.yyyy;
    vec4 y  = y_*ns.x + ns.yyyy;
    vec4 h  = 1. - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.+1.;
    vec4 s1 = floor(b1)*2.+1.;
    vec4 sh = -step(h, vec4(0.));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.);
    m = m*m;
    return 42.*dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  // ── FBM — 3 octaves of layered noise ─────────────────────────────────────
  float fbm(vec3 p, float speed){
    float t  = uTime * speed;
    float v  = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i=0; i<3; i++){
      v    += amp * snoise(p * freq + vec3(t*0.28, t*0.22, t*0.18));
      amp  *= 0.5;
      freq *= 2.1;
    }
    return v;
  }

  void main(){
    vec3 pos = position;
    vec3 dir = normalize(pos);

    // FBM displacement — organic breathing motion
    float noise = fbm(
      vec3(aSeed.x + pos.x * uNoiseScale,
           aSeed.y + pos.y * uNoiseScale,
           aSeed.z + pos.z * uNoiseScale),
      uPulseSpeed
    );

    // Audio burst — expands sphere radially on beat
    float audioPush = uAudioLevel * 0.30 * aRadiusFrac;

    float disp = noise * uPulseAmp * uSpread + audioPush;
    pos += dir * disp;

    // Depth for fragment color mixing
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vDepth      = clamp((pos.z + 2.5) / 5.0, 0.0, 1.0);
    vRadiusFrac = aRadiusFrac;

    // Brightness peaks where noise is high (sharp local variation)
    vBrightness = clamp(noise * 0.5 + 0.5, 0.0, 1.0) * uOpacityBoost;

    gl_PointSize = aSize * (340.0 / -mvPos.z);
    gl_Position  = projectionMatrix * mvPos;
  }
`

// ─── Fragment Shader — Soft Disk + Depth Color + Glow ────────────────────────

const fragmentShader = /* glsl */ `
  uniform vec3  uColorCore;
  uniform vec3  uColorMid;
  uniform vec3  uColorEdge;
  uniform float uOpacity;
  uniform float uAudioLevel;

  varying float vDepth;
  varying float vBrightness;
  varying float vRadiusFrac;

  void main(){
    // Circular soft particle
    vec2  uv   = gl_PointCoord - 0.5;
    float dist = length(uv);
    if(dist > 0.5) discard;

    // Soft disc falloff
    float alpha = smoothstep(0.5, 0.05, dist) * uOpacity;

    // Three-band color: core → mid → edge based on radial depth
    // Surface particles (vRadiusFrac ≈ 1) get mid/edge mix
    // Interior particles (vRadiusFrac ≈ 0) get core color
    vec3 innerColor  = mix(uColorCore, uColorMid,  clamp(vRadiusFrac * 1.6, 0., 1.));
    vec3 depthColor  = mix(innerColor, uColorEdge, clamp((1.0 - vDepth) * 0.7, 0., 1.));

    // Brightness spike for active particles (high noise)
    vec3 color = depthColor + uColorCore * vBrightness * 0.30;

    // Specular glow at center of each point
    float specular = smoothstep(0.5, 0.0, dist) * 0.5;
    color += specular * mix(uColorCore, vec3(1.0), 0.5);

    // Audio pulse — subtle white flare on beats
    color += uAudioLevel * 0.12 * smoothstep(0.3, 0.0, dist);

    gl_FragColor = vec4(color, alpha);
  }
`

// ─── R3F Scene — full RAF loop, zero re-renders ───────────────────────────────

function ParticleSphere({
  orbState = "idle",
  audioLevel = 0,
}: {
  orbState: OrbState
  audioLevel: number
}) {
  const pointsRef  = useRef<THREE.Points>(null)
  const matRef     = useRef<THREE.ShaderMaterial>(null)
  const clockRef   = useRef(0)
  const orbStateRef = useRef(orbState)
  const audioRef    = useRef(audioLevel)

  // Always-current refs — read inside RAF without stale closure
  orbStateRef.current = orbState
  audioRef.current    = audioLevel

  // Lerp targets — stored as refs to avoid re-renders
  const tColorCore    = useRef(new THREE.Color(STATE_CONFIG.idle.colorCore))
  const tColorMid     = useRef(new THREE.Color(STATE_CONFIG.idle.colorMid))
  const tColorEdge    = useRef(new THREE.Color(STATE_CONFIG.idle.colorEdge))
  const tPulseSpeed   = useRef(STATE_CONFIG.idle.pulseSpeed)
  const tPulseAmp     = useRef(STATE_CONFIG.idle.pulseAmp)
  const tNoiseScale   = useRef(0.75)
  const tRotY         = useRef(0)
  const tRotX         = useRef(0)
  const tSpread       = useRef(1.0)
  const tOpacityBoost = useRef(1.0)
  const opacityRef    = useRef(0)

  // Build geometry once
  const { geometry, uniforms } = useMemo(() => {
    const geo = buildSphereGeometry(PARTICLE_COUNT)
    const u = {
      uTime:         { value: 0 },
      uPulseSpeed:   { value: 0.55 },
      uPulseAmp:     { value: 0.022 },
      uNoiseScale:   { value: 0.75 },
      uSpread:       { value: 1.0 },
      uAudioLevel:   { value: 0 },
      uOpacityBoost: { value: 1.0 },
      uColorCore:    { value: new THREE.Color(STATE_CONFIG.idle.colorCore) },
      uColorMid:     { value: new THREE.Color(STATE_CONFIG.idle.colorMid) },
      uColorEdge:    { value: new THREE.Color(STATE_CONFIG.idle.colorEdge) },
      uOpacity:      { value: 0 },
    }
    return { geometry: geo, uniforms: u }
  }, [])

  useFrame((_, delta) => {
    if (!matRef.current || !pointsRef.current) return

    const cfg = STATE_CONFIG[orbStateRef.current]
    const u   = matRef.current.uniforms

    // Smooth lerp factor — slower = more cinematic
    const s = Math.min(delta * 60 * 0.032, 1)
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    // Fade in on mount
    opacityRef.current = Math.min(1, opacityRef.current + delta * 1.2)
    u.uOpacity.value   = opacityRef.current

    // Color transitions
    tColorCore.current.lerp(cfg.colorCore, s * 1.1)
    tColorMid.current.lerp(cfg.colorMid,   s * 0.9)
    tColorEdge.current.lerp(cfg.colorEdge, s * 0.8)

    // Numeric transitions
    tPulseSpeed.current   = lerp(tPulseSpeed.current,   cfg.pulseSpeed,   s)
    tPulseAmp.current     = lerp(tPulseAmp.current,     cfg.pulseAmp,     s)
    tNoiseScale.current   = lerp(tNoiseScale.current,   0.75 + cfg.fbmOctaves * 0.18, s * 0.7)
    tSpread.current       = lerp(tSpread.current,       cfg.spreadFactor, s)
    tOpacityBoost.current = lerp(tOpacityBoost.current, cfg.opacityBoost, s)

    // Audio — fast in (react immediately), slow out (graceful decay)
    const audioTarget = audioRef.current * cfg.audioMult
    const audioLerp   = audioTarget > u.uAudioLevel.value ? 0.35 : 0.08
    u.uAudioLevel.value = lerp(u.uAudioLevel.value, audioTarget, audioLerp)

    clockRef.current += delta
    u.uTime.value        = clockRef.current
    u.uPulseSpeed.value  = tPulseSpeed.current
    u.uPulseAmp.value    = tPulseAmp.current
    u.uNoiseScale.value  = tNoiseScale.current
    u.uSpread.value      = tSpread.current
    u.uOpacityBoost.value = tOpacityBoost.current
    u.uColorCore.value.copy(tColorCore.current)
    u.uColorMid.value.copy(tColorMid.current)
    u.uColorEdge.value.copy(tColorEdge.current)

    // Rotation — smoothly accelerates with state energy
    const audioBoostRot = u.uAudioLevel.value * 0.4
    tRotY.current += delta * (cfg.rotSpeedY + audioBoostRot)
    tRotX.current  = Math.sin(clockRef.current * cfg.rotSpeedX) * 0.15

    pointsRef.current.rotation.y = tRotY.current
    pointsRef.current.rotation.x = tRotX.current
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
        vertexColors={false}
      />
    </points>
  )
}

// ─── Public Component ─────────────────────────────────────────────────────────

export function Orb({ orbState = "idle", audioLevel = 0, className }: OrbProps) {
  return (
    <div
      className={className ?? "relative h-full w-full"}
      aria-hidden="true"
    >
      <Canvas
        camera={{ position: [0, 0, 4.0], fov: 44 }}
        gl={{
          alpha: true,
          antialias: false,          // disabled for perf — AdditiveBlending hides aliasing anyway
          powerPreference: "high-performance",
          preserveDrawingBuffer: false,
        }}
        dpr={[1, 2]}
      >
        <ParticleSphere orbState={orbState} audioLevel={audioLevel} />
      </Canvas>
    </div>
  )
}
