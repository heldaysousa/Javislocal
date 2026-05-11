"use client"

import { useRef, useState, useCallback, useEffect } from "react"

export type VoiceState = "idle" | "wake-listening" | "listening" | "thinking" | "speaking"

interface UseVoiceOptions {
  wakeName?: string
  micDeviceId?: string
  lang?: string
  silenceMs?: number
  onTranscript: (text: string) => void
  onStateChange?: (state: VoiceState) => void
}

export function useVoice({
  wakeName = "dj boy",
  micDeviceId,
  lang = "pt-BR",
  silenceMs = 1600,
  onTranscript,
  onStateChange,
}: UseVoiceOptions) {
  const [state, setState] = useState<VoiceState>("idle")
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const recRef      = useRef<SpeechRecognition | null>(null)
  const silRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const accRef      = useRef("")
  const modeRef     = useRef<"wake" | "command">("wake")
  const ctxRef      = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef      = useRef<number>(0)
  const streamRef   = useRef<MediaStream | null>(null)
  const activeRef   = useRef(false)

  const emit = useCallback(
    (s: VoiceState) => {
      setState(s)
      onStateChange?.(s)
    },
    [onStateChange],
  )

  // ── Audio level analyser ───────────────────────────────────────────────────
  const startAnalyser = useCallback(async (deviceId?: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      })
      streamRef.current = stream
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctxRef.current = new Ctx()
      analyserRef.current = ctxRef.current.createAnalyser()
      analyserRef.current.fftSize = 512
      ctxRef.current.createMediaStreamSource(stream).connect(analyserRef.current)
      const data = new Uint8Array(analyserRef.current.frequencyBinCount)
      const tick = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(data)
        setAudioLevel(data.reduce((a, b) => a + b, 0) / data.length / 128)
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      // mic denied — tratado em start()
    }
  }, [])

  const stopAnalyser = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    analyserRef.current = null
    ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setAudioLevel(0)
  }, [])

  // ── SpeechRecognition factory — BUG-1 fix ────────────────────────────────
  const getSpeechRec = useCallback((): (new () => SpeechRecognition) | null => {
    if (typeof window === "undefined") return null
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognition
      webkitSpeechRecognition?: new () => SpeechRecognition
    }
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
  }, [])

  // ── Session management ────────────────────────────────────────────────────
  const createSession = useCallback(
    (mode: "wake" | "command") => {
      const SpeechRec = getSpeechRec()
      if (!SpeechRec || !activeRef.current) return

      const rec = new SpeechRec()
      rec.lang = lang
      rec.continuous = true
      rec.interimResults = true
      recRef.current = rec
      modeRef.current = mode
      accRef.current = ""

      rec.onresult = (e: SpeechRecognitionEvent) => {
        let interim = ""
        let final = ""
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          e.results[i].isFinal ? (final += t) : (interim += t)
        }

        if (mode === "wake") {
          const all = (accRef.current + " " + final + " " + interim).trim().toLowerCase()
          const variants = [wakeName, wakeName.replace(" ", ""), "dj boi", "dj boy", "deejay boy"]
          if (variants.some((v) => all.includes(v))) {
            rec.stop()
            emit("listening")
            if (silRef.current) clearTimeout(silRef.current)
            setTimeout(() => activeRef.current && createSession("command"), 300)
          } else {
            if (final) accRef.current += " " + final
          }
        } else {
          if (final) accRef.current += " " + final
          if (silRef.current) clearTimeout(silRef.current)
          if (interim || final) {
            silRef.current = setTimeout(() => {
              rec.stop()
              const transcript = accRef.current.trim()
              if (transcript) {
                onTranscript(transcript)
              } else {
                emit("wake-listening")
                if (activeRef.current) setTimeout(() => createSession("wake"), 200)
              }
            }, silenceMs)
          }
        }
      }

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        if (e.error === "no-speech" || e.error === "audio-capture") {
          if (activeRef.current) setTimeout(() => createSession(mode), 300)
          return
        }
        if (e.error === "not-allowed") {
          setError("Permissão de microfone negada.")
          activeRef.current = false
          emit("idle")
          stopAnalyser()
        }
      }

      // BUG-2 fix: command mode onend sempre volta para wake-listening
      rec.onend = () => {
        if (!activeRef.current) return
        if (mode === "wake") {
          setTimeout(() => createSession("wake"), 200)
        } else {
          // Só reabre wake se onTranscript ainda não foi chamado (acc vazio)
          if (!accRef.current.trim()) {
            emit("wake-listening")
            setTimeout(() => createSession("wake"), 200)
          }
        }
      }

      try {
        rec.start()
      } catch {
        /* já iniciado */
      }
      if (mode === "wake") emit("wake-listening")
    },
    [lang, wakeName, silenceMs, onTranscript, emit, getSpeechRec, stopAnalyser],
  )

  // ── Public API ────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (activeRef.current) return
    const SpeechRec = getSpeechRec()
    if (!SpeechRec) {
      setError("Web Speech API não suportada neste navegador. Use Chrome ou Edge.")
      return
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      setError(null)
    } catch {
      setError("Permissão de microfone negada.")
      return
    }
    activeRef.current = true
    await startAnalyser(micDeviceId)
    createSession("wake")
  }, [getSpeechRec, micDeviceId, createSession, startAnalyser])

  const stop = useCallback(() => {
    activeRef.current = false
    if (silRef.current) clearTimeout(silRef.current)
    recRef.current?.stop()
    recRef.current = null
    stopAnalyser()
    emit("idle")
  }, [emit, stopAnalyser])

  const pushToTalk = useCallback(() => {
    if (!activeRef.current) return
    recRef.current?.stop()
    recRef.current = null
    if (silRef.current) clearTimeout(silRef.current)
    emit("listening")
    setTimeout(() => createSession("command"), 200)
  }, [createSession, emit])

  useEffect(
    () => () => {
      activeRef.current = false
      if (silRef.current) clearTimeout(silRef.current)
      recRef.current?.stop()
      stopAnalyser()
    },
    [stopAnalyser],
  )

  return { state, audioLevel, error, start, stop, pushToTalk, isActive: activeRef }
}
