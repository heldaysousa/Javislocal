"use client"

import { useEffect, useRef } from "react"
import { motion } from "framer-motion"

type OrbState = "idle" | "listening" | "thinking" | "speaking"

interface OrbProps {
  state: OrbState
  audioLevel?: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  alpha: number
  hue: number
  life: number
  maxLife: number
}

export function Orb({ state, audioLevel = 0 }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number>(0)
  const timeRef = useRef(0)

  const stateColors: Record<OrbState, { h: number; s: number }> = {
    idle: { h: 210, s: 70 },
    listening: { h: 195, s: 90 },
    thinking: { h: 260, s: 80 },
    speaking: { h: 180, s: 90 },
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const SIZE = 280
    canvas.width = SIZE * dpr
    canvas.height = SIZE * dpr
    canvas.style.width = `${SIZE}px`
    canvas.style.height = `${SIZE}px`
    ctx.scale(dpr, dpr)

    const cx = SIZE / 2
    const cy = SIZE / 2

    function spawnParticle() {
      const angle = Math.random() * Math.PI * 2
      const dist = 60 + Math.random() * 20
      const { h, s } = stateColors[state]
      particlesRef.current.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 1.2,
        vy: (Math.random() - 0.5) * 1.2,
        radius: Math.random() * 2.5 + 0.5,
        alpha: Math.random() * 0.8 + 0.2,
        hue: h + (Math.random() - 0.5) * 30,
        life: 0,
        maxLife: 80 + Math.random() * 80,
      })
    }

    function draw() {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, SIZE, SIZE)
      timeRef.current += 0.016

      const t = timeRef.current
      const pulse = state === "listening" ? 1 + audioLevel * 0.4 : 1
      const { h, s } = stateColors[state]

      // Outer glow rings
      for (let i = 3; i >= 1; i--) {
        const ringR = (55 + i * 14) * pulse
        const ringAlpha = state === "idle" ? 0.04 : 0.07 - i * 0.015
        ctx.beginPath()
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
        ctx.strokeStyle = `hsla(${h}, ${s}%, 70%, ${ringAlpha})`
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Rotating arc (listening/speaking)
      if (state !== "idle") {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(t * (state === "thinking" ? 1.5 : 0.8))
        ctx.beginPath()
        ctx.arc(0, 0, 70 * pulse, 0, Math.PI * 1.2)
        ctx.strokeStyle = `hsla(${h}, ${s}%, 75%, 0.5)`
        ctx.lineWidth = 1.5
        ctx.lineCap = "round"
        ctx.stroke()
        ctx.restore()

        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(-t * 0.6)
        ctx.beginPath()
        ctx.arc(0, 0, 75 * pulse, 0, Math.PI * 0.7)
        ctx.strokeStyle = `hsla(${h + 20}, ${s}%, 80%, 0.3)`
        ctx.lineWidth = 1
        ctx.lineCap = "round"
        ctx.stroke()
        ctx.restore()
      }

      // Core orb
      const coreGrad = ctx.createRadialGradient(cx - 10, cy - 10, 4, cx, cy, 50 * pulse)
      coreGrad.addColorStop(0, `hsla(${h}, ${s}%, 85%, 0.95)`)
      coreGrad.addColorStop(0.4, `hsla(${h}, ${s}%, 60%, 0.8)`)
      coreGrad.addColorStop(1, `hsla(${h}, ${s}%, 40%, 0.3)`)
      ctx.beginPath()
      ctx.arc(cx, cy, 50 * pulse, 0, Math.PI * 2)
      ctx.fillStyle = coreGrad
      ctx.fill()

      // Inner highlight
      const hiGrad = ctx.createRadialGradient(cx - 15, cy - 15, 2, cx, cy, 30)
      hiGrad.addColorStop(0, `hsla(0, 0%, 100%, 0.4)`)
      hiGrad.addColorStop(1, `hsla(0, 0%, 100%, 0)`)
      ctx.beginPath()
      ctx.arc(cx, cy, 50 * pulse, 0, Math.PI * 2)
      ctx.fillStyle = hiGrad
      ctx.fill()

      // Particles
      const spawnRate = state === "listening" ? 3 + Math.floor(audioLevel * 4) : state === "idle" ? 0.5 : 2
      if (Math.random() < spawnRate / 60) spawnParticle()

      particlesRef.current = particlesRef.current.filter((p) => p.life < p.maxLife)
      for (const p of particlesRef.current) {
        p.life++
        p.x += p.vx
        p.y += p.vy
        p.vx *= 0.98
        p.vy *= 0.98
        const progress = p.life / p.maxLife
        const alpha = p.alpha * (1 - progress)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius * (1 - progress * 0.5), 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 90%, 75%, ${alpha})`
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [state, audioLevel])

  const labelMap: Record<OrbState, string> = {
    idle: "Em espera",
    listening: "Ouvindo...",
    thinking: "Processando...",
    speaking: "Respondendo...",
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.div
        className="relative"
        animate={{ scale: state === "listening" ? 1.05 : 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <canvas ref={canvasRef} className="block" />
      </motion.div>
      <motion.p
        key={state}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.3 }}
        className="text-xs tracking-widest uppercase font-mono"
        style={{ color: "oklch(0.65 0.15 210)" }}
      >
        {labelMap[state]}
      </motion.p>
    </div>
  )
}
