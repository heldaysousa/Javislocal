"use client"

import { useRef, useEffect } from "react"
import { motion } from "framer-motion"

export type OrbState = "idle" | "wake-listening" | "listening" | "thinking" | "speaking"

interface FluidOrbProps {
  state: OrbState
  audioLevel: number
  size?: number
}

// Color configs per state
const STATE_COLORS: Record<OrbState, { blobs: string[]; glow: string; core: string }> = {
  idle: {
    blobs: ["#4f46e5", "#7c3aed", "#2563eb"],
    glow: "rgba(99,102,241,0.35)",
    core: "rgba(199,210,254,0.9)",
  },
  "wake-listening": {
    blobs: ["#6366f1", "#818cf8", "#4f46e5"],
    glow: "rgba(129,140,248,0.45)",
    core: "rgba(224,231,255,0.95)",
  },
  listening: {
    blobs: ["#059669", "#10b981", "#34d399"],
    glow: "rgba(16,185,129,0.45)",
    core: "rgba(167,243,208,0.95)",
  },
  thinking: {
    blobs: ["#d97706", "#f59e0b", "#fb923c"],
    glow: "rgba(245,158,11,0.45)",
    core: "rgba(253,230,138,0.95)",
  },
  speaking: {
    blobs: ["#9333ea", "#e879f9", "#ec4899"],
    glow: "rgba(233,121,249,0.45)",
    core: "rgba(240,171,252,0.98)",
  },
}

// Simplex-like smooth noise using sine harmonics
function noise(t: number, seed: number) {
  return (
    Math.sin(t * 1.1 + seed) * 0.40 +
    Math.sin(t * 2.3 + seed * 1.7) * 0.25 +
    Math.sin(t * 3.7 + seed * 0.9) * 0.20 +
    Math.sin(t * 5.1 + seed * 2.3) * 0.10 +
    Math.sin(t * 7.3 + seed * 0.4) * 0.05
  )
}

function buildBlobPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  baseR: number,
  amp: number,
  t: number,
  seed: number,
  points = 96
) {
  ctx.beginPath()
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2
    const n = noise(angle + t, seed)
    const r = baseR + amp * n
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

export function FluidOrb({ state, audioLevel, size = 280 }: FluidOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)
  const tRef      = useRef(0)
  const stateRef  = useRef(state)
  const levelRef  = useRef(audioLevel)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { levelRef.current = audioLevel }, [audioLevel])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W   = size * dpr
    canvas.width  = W
    canvas.height = W
    canvas.style.width  = `${size}px`
    canvas.style.height = `${size}px`
    ctx.scale(dpr, dpr)

    const cx = size / 2
    const cy = size / 2

    function draw() {
      const s   = stateRef.current
      const lvl = Math.min(levelRef.current, 1)
      const cfg = STATE_COLORS[s]

      const speedMul = s === "speaking" ? 2.0 : s === "listening" ? 1.6 : s === "thinking" ? 1.2 : 0.5
      const ampMul   = s === "speaking" ? 1.8 : s === "listening" ? 1.5 : s === "thinking" ? 1.3 : 1.0

      tRef.current += 0.0165 * speedMul

      const t     = tRef.current
      const boost = lvl * size * 0.08

      ctx.clearRect(0, 0, size, size)

      // ── Layer 1: outer diffuse glow ──────────────────────────────────────
      const outerR = size * 0.42 + boost
      const outerAmp = size * 0.07 * ampMul
      buildBlobPath(ctx, cx, cy, outerR, outerAmp, t * 0.5, 0.0)
      const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR + outerAmp)
      g1.addColorStop(0,   cfg.blobs[0] + "55")
      g1.addColorStop(0.5, cfg.blobs[1] + "33")
      g1.addColorStop(1,   cfg.blobs[2] + "00")
      ctx.fillStyle = g1
      ctx.fill()

      // ── Layer 2: mid glow ────────────────────────────────────────────────
      const midR = size * 0.33 + boost * 0.7
      const midAmp = size * 0.06 * ampMul
      buildBlobPath(ctx, cx, cy, midR, midAmp, t * 0.8 + 1.5, 2.4)
      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, midR + midAmp)
      g2.addColorStop(0,   cfg.blobs[1] + "88")
      g2.addColorStop(0.6, cfg.blobs[0] + "55")
      g2.addColorStop(1,   cfg.blobs[2] + "00")
      ctx.fillStyle = g2
      ctx.fill()

      // ── Layer 3: inner bright body ───────────────────────────────────────
      const innerR = size * 0.23 + boost * 0.5
      const innerAmp = size * 0.055 * ampMul
      buildBlobPath(ctx, cx, cy, innerR, innerAmp, t * 1.3 + 3.0, 5.1)
      const g3 = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR + innerAmp)
      g3.addColorStop(0,   cfg.blobs[0] + "cc")
      g3.addColorStop(0.5, cfg.blobs[1] + "99")
      g3.addColorStop(1,   cfg.blobs[2] + "33")
      ctx.fillStyle = g3
      ctx.fill()

      // ── Layer 4: bright nucleus ──────────────────────────────────────────
      const nuclR = size * 0.145 + boost * 0.3
      const nuclAmp = size * 0.04 * ampMul
      buildBlobPath(ctx, cx, cy, nuclR, nuclAmp, t * 2.2 + 5.5, 8.8)
      const g4 = ctx.createRadialGradient(cx, cy, 0, cx, cy, nuclR + nuclAmp)
      g4.addColorStop(0,   cfg.blobs[0] + "ff")
      g4.addColorStop(0.4, cfg.blobs[1] + "dd")
      g4.addColorStop(1,   cfg.blobs[2] + "66")
      ctx.fillStyle = g4
      ctx.fill()

      // ── Core white-hot point ─────────────────────────────────────────────
      const coreR = size * 0.07 + boost * 0.15
      const gc = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 1.8)
      gc.addColorStop(0,   "rgba(255,255,255,1.0)")
      gc.addColorStop(0.3, "rgba(255,255,255,0.85)")
      gc.addColorStop(0.7, cfg.core)
      gc.addColorStop(1,   cfg.blobs[0] + "00")
      ctx.beginPath()
      ctx.arc(cx, cy, coreR * 1.8, 0, Math.PI * 2)
      ctx.fillStyle = gc
      ctx.fill()

      // ── Specular highlight ───────────────────────────────────────────────
      const hlX = cx - size * 0.055
      const hlY = cy - size * 0.065
      const hg = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, size * 0.07)
      hg.addColorStop(0, "rgba(255,255,255,0.55)")
      hg.addColorStop(1, "rgba(255,255,255,0.00)")
      ctx.beginPath()
      ctx.arc(hlX, hlY, size * 0.07, 0, Math.PI * 2)
      ctx.fillStyle = hg
      ctx.fill()

      rafRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ display: "block", imageRendering: "auto" }}
    />
  )
}

// Ambient glow halo rendered behind the orb via CSS — no canvas needed
export function OrbGlow({ state, size = 280 }: { state: OrbState; size?: number }) {
  const cfg = STATE_COLORS[state]
  return (
    <motion.div
      aria-hidden
      className="absolute rounded-full pointer-events-none"
      style={{
        width:  size * 1.55,
        height: size * 1.55,
        top:    "50%",
        left:   "50%",
        x:      "-50%",
        y:      "-50%",
        filter: `blur(${size * 0.28}px)`,
        background: `radial-gradient(circle at 50% 50%, ${cfg.glow} 0%, transparent 70%)`,
        zIndex: 0,
      }}
      animate={{ scale: [1, 1.07, 1], opacity: [0.75, 1, 0.75] }}
      transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
    />
  )
}
