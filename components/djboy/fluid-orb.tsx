"use client"

import { useRef, useEffect } from "react"

export type OrbState = "idle" | "wake-listening" | "listening" | "thinking" | "speaking"

interface FluidOrbProps {
  state: OrbState
  audioLevel: number
  size?: number
}

// Color palettes per state — Apple-grade indigo/violet/teal
const PALETTES: Record<OrbState, [string, string, string]> = {
  idle:             ["#5e6ad2", "#7c5cfc", "#4f8ef7"],
  "wake-listening": ["#818cf8", "#6366f1", "#a5b4fc"],
  listening:        ["#34d399", "#10b981", "#6ee7b7"],
  thinking:         ["#f59e0b", "#f97316", "#fbbf24"],
  speaking:         ["#e879f9", "#a855f7", "#ec4899"],
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function FluidOrb({ state, audioLevel, size = 240 }: FluidOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timeRef = useRef(0)
  const rafRef = useRef<number>(0)
  const stateRef = useRef(state)
  const levelRef = useRef(audioLevel)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { levelRef.current = audioLevel }, [audioLevel])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const S = size * dpr
    canvas.width = S
    canvas.height = S
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.scale(dpr, dpr)

    const cx = size / 2
    const cy = size / 2

    function getBlobPath(t: number, radius: number, amp: number, freqMult: number, boost: number) {
      const count = 80
      const points: [number, number][] = []
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2
        const n =
          Math.sin(a * 3 * freqMult + t) * 0.45 +
          Math.sin(a * 5 * freqMult - t * 0.7) * 0.3 +
          Math.sin(a * 7 * freqMult + t * 1.3) * 0.15 +
          Math.sin(a * 2 * freqMult - t * 0.4) * 0.1
        const r = radius + amp * n + boost * 22 * Math.max(0, n)
        points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
      }
      return points
    }

    function drawBlobLayer(
      pts: [number, number][],
      colors: [string, string, string],
      alpha: number,
      glowR: number
    ) {
      if (pts.length < 3) return
      ctx.save()
      ctx.globalAlpha = alpha

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
      grad.addColorStop(0,   hexToRgba(colors[0], 0.9))
      grad.addColorStop(0.4, hexToRgba(colors[1], 0.55))
      grad.addColorStop(0.75,hexToRgba(colors[2], 0.2))
      grad.addColorStop(1,   hexToRgba(colors[2], 0))
      ctx.fillStyle = grad

      ctx.beginPath()
      const last = pts[pts.length - 1]
      ctx.moveTo((last[0] + pts[0][0]) / 2, (last[1] + pts[0][1]) / 2)
      for (let i = 0; i < pts.length; i++) {
        const curr = pts[i]
        const next = pts[(i + 1) % pts.length]
        ctx.quadraticCurveTo(curr[0], curr[1], (curr[0] + next[0]) / 2, (curr[1] + next[1]) / 2)
      }
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    const animate = () => {
      const s = stateRef.current
      const lvl = Math.min(levelRef.current, 1)
      const colors = PALETTES[s]

      const speed  = s === "speaking" ? 2.2 : s === "listening" ? 1.8 : s === "thinking" ? 1.4 : 0.55
      const ampMul = s === "speaking" ? 1.9 : s === "listening" ? 1.5 : s === "thinking" ? 1.2 : 0.75

      timeRef.current += 0.016 * speed

      const t = timeRef.current

      ctx.clearRect(0, 0, size, size)

      // Layer 1 — outer glow halo
      drawBlobLayer(
        getBlobPath(t * 0.6, size * 0.39, size * 0.065 * ampMul, 1, lvl),
        colors, 0.13, size * 0.52
      )
      // Layer 2 — mid volume
      drawBlobLayer(
        getBlobPath(t * 0.9 + 1.2, size * 0.29, size * 0.055 * ampMul, 1.2, lvl),
        colors, 0.28, size * 0.40
      )
      // Layer 3 — inner body
      drawBlobLayer(
        getBlobPath(t * 1.4 + 2.5, size * 0.19, size * 0.045 * ampMul, 1.5, lvl),
        colors, 0.55, size * 0.28
      )
      // Layer 4 — bright core
      drawBlobLayer(
        getBlobPath(t * 2.0 + 4.0, size * 0.11, size * 0.03 * ampMul, 2, lvl),
        colors, 0.85, size * 0.17
      )

      // White hot center
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.1)
      coreGrad.addColorStop(0,   "rgba(255,255,255,0.92)")
      coreGrad.addColorStop(0.4, hexToRgba(colors[0], 0.6))
      coreGrad.addColorStop(1,   hexToRgba(colors[1], 0))
      ctx.globalAlpha = 1
      ctx.fillStyle = coreGrad
      ctx.beginPath()
      ctx.arc(cx, cy, size * 0.10, 0, Math.PI * 2)
      ctx.fill()

      rafRef.current = requestAnimationFrame(animate)
    }

    animate()
    return () => cancelAnimationFrame(rafRef.current)
  }, [size]) // only re-init on size change — state/level use refs

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ imageRendering: "auto", display: "block" }}
    />
  )
}
