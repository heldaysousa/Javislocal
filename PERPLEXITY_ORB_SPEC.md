# Perplexity Voice Orb — Especificacao de Implementacao

Visual de referencia: Perplexity Voice (app iOS) — esfera volumetrica de particulas teal/ciano
que reage ao audio e muda de cor por estado da IA.

---

## Stack obrigatoria

```
@react-three/fiber  ^9.x
@react-three/drei   ^10.x
three               ^0.170.x
```

Nao requer nenhum outro pacote. Nao usar `@react-spring`, `gsap`, nem `lottie`.

---

## Arquitetura do componente

Um unico arquivo: `components/ui/orb.tsx`

```
Orb (public, "use client")
  └─ Canvas (r3f, alpha=true, antialias=false, dpr=[1,2])
       └─ ParticleSphere (r3f scene, zero re-renders)
            ├─ BufferGeometry  (3600 pontos, gerado 1x no useMemo)
            ├─ ShaderMaterial  (uniforms lerp'd no RAF)
            ├─ vertexShader    (snoise 3D + FBM 3 octaves + audio radial push)
            └─ fragmentShader  (soft disc + 3-band depth color + specular glow)
```

**Regra critica de performance:** Todo estado de animacao vive em `useRef`. Zero `useState`
dentro da cena R3F. O RAF loop (`useFrame`) le refs e escreve em uniforms diretamente —
zero re-renders React durante a animacao.

---

## Props publicas

```ts
type OrbState = "idle" | "wake-listening" | "listening" | "thinking" | "speaking"

type OrbProps = {
  orbState?:  OrbState  // default "idle"
  audioLevel?: number   // 0–1, nivel de audio do microfone/TTS em tempo real
  className?: string
}
```

---

## STATE_CONFIG — visual por estado

Cada estado define 8 parametros. Todos os parametros fazem lerp suave no RAF,
nao ha troca abrupta de estado.

```ts
const STATE_CONFIG: Record<OrbState, {
  colorCore:    THREE.Color  // particulas frontais/brilhantes
  colorMid:     THREE.Color  // camada media
  colorEdge:    THREE.Color  // borda/interior escuro
  pulseSpeed:   number       // velocidade do FBM (uTime * pulseSpeed)
  pulseAmp:     number       // amplitude do deslocamento radial (0.02–0.15)
  fbmOctaves:   number       // complexidade do noise (1–3, controla noiseScale)
  rotSpeedY:    number       // velocidade rotacao eixo Y
  rotSpeedX:    number       // amplitude wobble eixo X
  spreadFactor: number       // escala global da esfera (1.0–1.14)
  opacityBoost: number       // multiplicador de opacidade das particulas
  audioMult:    number       // sensibilidade ao audio (0.10–0.40)
}>
```

Valores exatos por estado:

| Estado         | colorCore  | colorMid   | colorEdge  | pulseSpeed | pulseAmp | rotSpeedY | audioMult |
|----------------|------------|------------|------------|------------|----------|-----------|-----------|
| idle           | #5eead4    | #0d9488    | #042f2e    | 0.55       | 0.022    | 0.055     | 0.15      |
| wake-listening | #a5b4fc    | #6366f1    | #1e1b4b    | 1.1        | 0.048    | 0.10      | 0.20      |
| listening      | #86efac    | #22d3ee    | #052e16    | 1.7        | 0.080    | 0.16      | 0.35      |
| thinking       | #fcd34d    | #f97316    | #431407    | 2.6        | 0.120    | 0.26      | 0.10      |
| speaking       | #f0abfc    | #a855f7    | #2e1065    | 3.2        | 0.150    | 0.20      | 0.40      |

---

## Geometria das particulas

```ts
const PARTICLE_COUNT = 3600
const BASE_RADIUS    = 1.55
```

**Distribuicao volumetrica dupla** (nao apenas superficie):

```ts
// 78% — Fibonacci lattice na superficie (distribuicao mais uniforme possivel)
const surfaceCount = Math.floor(count * 0.78)
for (let i = 0; i < surfaceCount; i++) {
  const phi   = Math.acos(1 - (2 * (i + 0.5)) / surfaceCount)
  const theta = Math.PI * (1 + Math.sqrt(5)) * i   // golden angle
  const jitter = (Math.random() - 0.5) * 0.055
  const r = BASE_RADIUS + jitter
  // x = r * sin(phi) * cos(theta)
  // y = r * sin(phi) * sin(theta)
  // z = r * cos(phi)
}

// 22% — interior volumetrico (distribuicao uniforme no volume)
for (let i = surfaceCount; i < count; i++) {
  const r = BASE_RADIUS * Math.cbrt(Math.random()) * 0.90  // cbrt para densidade uniforme
  // distribuicao esferica aleatoria padrao
}
```

Atributos por particula (BufferAttribute):
- `position` — vec3, posicao inicial
- `aSize` — float, tamanho do ponto (0.011–0.027 superficie, 0.006–0.016 interior)
- `aSeed` — vec3, fase de noise independente por particula (random 0–2pi)
- `aRadiusFrac` — float, 0=centro, 1=superficie (usado para color mixing no fragment)

---

## Vertex Shader — GLSL completo

```glsl
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

// Simplex Noise 3D — Ashima/Ian McEwan (algoritmo completo)
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

// FBM — 3 octaves
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

  float noise = fbm(
    vec3(aSeed.x + pos.x * uNoiseScale,
         aSeed.y + pos.y * uNoiseScale,
         aSeed.z + pos.z * uNoiseScale),
    uPulseSpeed
  );

  float audioPush = uAudioLevel * 0.30 * aRadiusFrac;
  float disp = noise * uPulseAmp * uSpread + audioPush;
  pos += dir * disp;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  vDepth      = clamp((pos.z + 2.5) / 5.0, 0.0, 1.0);
  vRadiusFrac = aRadiusFrac;
  vBrightness = clamp(noise * 0.5 + 0.5, 0.0, 1.0) * uOpacityBoost;

  gl_PointSize = aSize * (340.0 / -mvPos.z);
  gl_Position  = projectionMatrix * mvPos;
}
```

---

## Fragment Shader — GLSL completo

```glsl
uniform vec3  uColorCore;
uniform vec3  uColorMid;
uniform vec3  uColorEdge;
uniform float uOpacity;
uniform float uAudioLevel;

varying float vDepth;
varying float vBrightness;
varying float vRadiusFrac;

void main(){
  vec2  uv   = gl_PointCoord - 0.5;
  float dist = length(uv);
  if(dist > 0.5) discard;

  float alpha = smoothstep(0.5, 0.05, dist) * uOpacity;

  vec3 innerColor = mix(uColorCore, uColorMid,  clamp(vRadiusFrac * 1.6, 0., 1.));
  vec3 depthColor = mix(innerColor, uColorEdge, clamp((1.0 - vDepth) * 0.7, 0., 1.));
  vec3 color      = depthColor + uColorCore * vBrightness * 0.30;

  float specular = smoothstep(0.5, 0.0, dist) * 0.5;
  color += specular * mix(uColorCore, vec3(1.0), 0.5);

  color += uAudioLevel * 0.12 * smoothstep(0.3, 0.0, dist);

  gl_FragColor = vec4(color, alpha);
}
```

---

## RAF Loop — useFrame (regras criticas)

```ts
useFrame((_, delta) => {
  const cfg = STATE_CONFIG[orbStateRef.current]  // sempre ref, nunca prop direta
  const u   = matRef.current.uniforms

  // Lerp factor: delta * 60 * 0.032 = ~0.032 a 60fps (cinematico)
  const s = Math.min(delta * 60 * 0.032, 1)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  // Fade in no mount
  opacityRef.current = Math.min(1, opacityRef.current + delta * 1.2)
  u.uOpacity.value   = opacityRef.current

  // Cores: lerp com velocidades diferentes por camada (core mais rapido, edge mais lento)
  tColorCore.current.lerp(cfg.colorCore, s * 1.1)
  tColorMid.current.lerp(cfg.colorMid,   s * 0.9)
  tColorEdge.current.lerp(cfg.colorEdge, s * 0.8)

  // Audio: rapido na subida, lento na descida
  const audioTarget = audioRef.current * cfg.audioMult
  const audioLerp   = audioTarget > u.uAudioLevel.value ? 0.35 : 0.08
  u.uAudioLevel.value = lerp(u.uAudioLevel.value, audioTarget, audioLerp)

  // Rotacao acelera com audio
  const audioBoostRot = u.uAudioLevel.value * 0.4
  tRotY.current += delta * (cfg.rotSpeedY + audioBoostRot)
  tRotX.current  = Math.sin(clockRef.current * cfg.rotSpeedX) * 0.15
})
```

---

## Canvas config

```tsx
<Canvas
  camera={{ position: [0, 0, 4.0], fov: 44 }}
  gl={{
    alpha: true,
    antialias: false,        // desligado — AdditiveBlending esconde aliasing
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  }}
  dpr={[1, 2]}
>
```

## ShaderMaterial config

```tsx
<shaderMaterial
  transparent
  depthWrite={false}
  blending={THREE.AdditiveBlending}
  vertexColors={false}
/>
```

`AdditiveBlending` e obrigatorio — e ele que cria o efeito de brilho acumulado nas areas
de sobreposicao de particulas (identico ao Perplexity).

---

## Integracao com audio real (Web Audio API)

O componente recebe `audioLevel: number` (0–1). Quem alimenta esse valor e
o hook `use-voice.ts` via `AnalyserNode`:

```ts
// No hook de voz:
const analyser = audioCtx.createAnalyser()
analyser.fftSize = 512
analyser.smoothingTimeConstant = 0.7

function getAudioLevel(): number {
  const data = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(data)
  // bins 10-40 = faixa de voz humana (600Hz – 2.5kHz)
  const slice = data.slice(10, 40)
  const avg = slice.reduce((a, b) => a + b, 0) / slice.length
  return avg / 255   // normalizado 0–1
}

// No RAF do hook (requestAnimationFrame):
setAudioLevel(getAudioLevel())
```

---

## Glow ambiente no container (CSS/Framer Motion)

Envolver o `<Orb>` em um container com glow radial que troca por estado:

```tsx
<motion.div
  style={{
    background: state === "listening"
      ? "radial-gradient(circle at 50% 50%, rgba(134,239,172,0.18) 0%, rgba(34,211,238,0.12) 35%, transparent 72%)"
      : state === "speaking"
      ? "radial-gradient(circle at 50% 50%, rgba(240,171,252,0.20) 0%, rgba(168,85,247,0.12) 35%, transparent 72%)"
      : state === "thinking"
      ? "radial-gradient(circle at 50% 50%, rgba(252,211,77,0.18) 0%, rgba(249,115,22,0.12) 35%, transparent 72%)"
      : "radial-gradient(circle at 50% 50%, rgba(94,234,212,0.14) 0%, rgba(13,148,136,0.08) 35%, transparent 72%)",
    margin: "-40px",
    borderRadius: "50%",
  }}
  animate={{
    opacity: isActive ? [0.6, 1.0, 0.6] : [0.2, 0.38, 0.2],
    scale:   isActive ? [0.96, 1.04, 0.96] : [0.98, 1.01, 0.98],
  }}
  transition={{ duration: isActive ? 2.2 : 4.0, repeat: Infinity, ease: "easeInOut" }}
/>
```

---

## Anti-patterns a evitar

- Nao usar `useState` dentro do componente R3F para animacao — quebra o RAF loop
- Nao animar `width/height` — usar apenas `transform: scale()` via Framer Motion no container
- Nao usar `antialias: true` — `AdditiveBlending` ja suaviza tudo e antialias custa GPU
- Nao usar `SphereGeometry` com `ShaderMaterial` (mesh solido) — o efeito e completamente diferente
- Nao usar `preserveDrawingBuffer: true` — desnecessario e custa performance
- Nao passar funcoes como props para o ParticleSphere — usar refs

---

## Resultado visual esperado

- Esfera de 3600 particulas teal/ciano em repouso, com respiracao lenta organica (FBM)
- Idle: particulas estaticas com pulso lento, cor teal escura, rotacao suave
- Listening: expansao leve, verde/ciano, rotacao mais rapida, reativa ao microfone
- Thinking: turbulencia amber/laranja, noise rapido, rotacao intensa
- Speaking: fuchsia/roxo, maxima amplitude, particulas pulsam com o audio da TTS
- Transicoes entre estados sao cinematicas (~30 frames de lerp) — nao ha troca abrupta
- Particulas na superficie sao maiores e mais brilhantes que as do interior
- Sobreposicao de particulas cria glow acumulado via AdditiveBlending (efeito chave)
