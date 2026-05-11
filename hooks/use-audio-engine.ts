"use client"

import { useRef, useCallback } from "react"

export function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null)

  const getCtx = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null
    try {
      if (!ctxRef.current || ctxRef.current.state === "closed") {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        ctxRef.current = new Ctx()
      }
      if (ctxRef.current.state === "suspended") ctxRef.current.resume()
      return ctxRef.current
    } catch {
      return null
    }
  }, [])

  const tone = useCallback(
    (
      freq: number,
      duration: number,
      volume = 0.15,
      type: OscillatorType = "sine",
    ) => {
      try {
        const ctx = getCtx()
        if (!ctx) return
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(freq, ctx.currentTime)
        gain.gain.setValueAtTime(0, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + duration + 0.05)
      } catch {
        /* AudioContext não disponível */
      }
    },
    [getCtx],
  )

  const ready = useCallback(() => {
    tone(440, 0.12, 0.12)
    setTimeout(() => tone(660, 0.18, 0.10), 100)
  }, [tone])

  const wakeDetected = useCallback(() => {
    tone(880, 0.08, 0.12)
    setTimeout(() => tone(1100, 0.12, 0.08), 60)
  }, [tone])

  const listeningStart = useCallback(() => {
    tone(520, 0.15, 0.08, "triangle")
  }, [tone])

  const thinking = useCallback(() => {
    tone(280, 0.25, 0.06, "sine")
  }, [tone])

  const speakingStart = useCallback(() => {
    tone(660, 0.08, 0.10)
    setTimeout(() => tone(880, 0.10, 0.08), 50)
    setTimeout(() => tone(1100, 0.14, 0.06), 110)
  }, [tone])

  const done = useCallback(() => {
    tone(523, 0.12, 0.12)
    setTimeout(() => tone(659, 0.12, 0.10), 90)
    setTimeout(() => tone(784, 0.20, 0.08), 180)
  }, [tone])

  return { ready, wakeDetected, listeningStart, thinking, speakingStart, done }
}
