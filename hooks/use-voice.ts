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
  silenceMs = 1400,
  onTranscript,
  onStateChange,
}: UseVoiceOptions) {
  const [state, setState] = useState<VoiceState>("idle")
  const [audioLevel, setAudioLevel] = useState(0)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Core refs — no useState for session control to avoid stale closures
  const recRef       = useRef<SpeechRecognition | null>(null)
  const modeRef      = useRef<"wake" | "command">("wake")
  const activeRef    = useRef(false)   // true = system is running
  const restarting   = useRef(false)   // mutex to prevent double-start
  const accumulated  = useRef("")
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Audio analyser refs
  const audioCtxRef  = useRef<AudioContext | null>(null)
  const analyserRef  = useRef<AnalyserNode | null>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const rafRef       = useRef<number>(0)

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const updateState = useCallback((s: VoiceState) => {
    setState(s)
    onStateChange?.(s)
  }, [onStateChange])

  const getSpeechRec = useCallback(() => {
    if (typeof window === "undefined") return null
    return (
      window.SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition: typeof SpeechRecognition })
        .webkitSpeechRecognition ||
      null
    )
  }, [])

  const clearSilence = useCallback(() => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current)
      silenceTimer.current = null
    }
  }, [])

  // ─── Audio Analyser ──────────────────────────────────────────────────────────

  const startAnalyser = useCallback(async (deviceId?: string) => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtxRef.current = new AudioCtxClass()
      analyserRef.current = audioCtxRef.current.createAnalyser()
      analyserRef.current.fftSize = 512
      analyserRef.current.smoothingTimeConstant = 0.3

      const src = audioCtxRef.current.createMediaStreamSource(stream)
      src.connect(analyserRef.current)

      const data = new Uint8Array(analyserRef.current.frequencyBinCount)
      const tick = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(data)
        // Focus on voice frequencies — bins 10-40
        let sum = 0
        for (let i = 10; i < 40; i++) sum += data[i]
        setAudioLevel(Math.min(1, sum / (30 * 200)))
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
      return true
    } catch {
      return false
    }
  }, [])

  const stopAnalyser = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    analyserRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setAudioLevel(0)
  }, [])

  // ─── Recognition Session ─────────────────────────────────────────────────────

  const stopCurrentRec = useCallback(() => {
    if (!recRef.current) return
    const rec = recRef.current
    recRef.current = null
    // Remove handlers before stop to prevent onend from restarting
    rec.onresult = null
    rec.onerror  = null
    rec.onend    = null
    try { rec.stop() } catch { /* already stopped */ }
  }, [])

  const startSession = useCallback((mode: "wake" | "command") => {
    // Mutex — never start two sessions simultaneously
    if (restarting.current) return
    if (!activeRef.current) return

    const SpeechRec = getSpeechRec()
    if (!SpeechRec) return

    restarting.current = true
    stopCurrentRec()

    modeRef.current  = mode
    accumulated.current = ""
    clearSilence()

    const rec = new SpeechRec()
    rec.lang            = lang
    rec.continuous      = true
    rec.interimResults  = true
    rec.maxAlternatives = 1
    recRef.current = rec

    // ── onresult ──
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = ""
      let final   = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }

      const currentMode = modeRef.current

      if (currentMode === "wake") {
        const heard = (final + " " + interim).toLowerCase()
        const variants = [wakeName, "dj boi", "deejay boy", "djboy", "dj-boy"]
        const detected  = variants.some(v => heard.includes(v))
        if (detected) {
          // Wake word detected — switch to command immediately
          stopCurrentRec()
          clearSilence()
          updateState("listening")
          // Small gap so the microphone resets cleanly
          setTimeout(() => {
            if (activeRef.current) startSession("command")
          }, 250)
        }
      } else {
        // Command mode — accumulate finals
        if (final) accumulated.current = (accumulated.current + " " + final).trim()

        // Reset silence timer on any speech activity
        clearSilence()
        if (interim || final) {
          silenceTimer.current = setTimeout(() => {
            const transcript = accumulated.current.trim()
            stopCurrentRec()
            if (transcript) {
              onTranscript(transcript)
              // Shell will call updateState("thinking") and then "speaking"
              // We return to wake mode after TTS finishes (shell calls stop()+start())
            } else {
              // Nothing heard — back to wake mode
              updateState("wake-listening")
              if (activeRef.current) startSession("wake")
            }
          }, silenceMs)
        }
      }
    }

    // ── onerror ──
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Permissão de microfone negada.")
        setPermissionGranted(false)
        activeRef.current = false
        stopCurrentRec()
        stopAnalyser()
        updateState("idle")
        restarting.current = false
        return
      }
      // no-speech / audio-capture / network — restart silently
      // onend will handle the restart
    }

    // ── onend ──
    // Fires after every stop(). We only restart when:
    //   1. System is still active
    //   2. We are in wake mode (command mode manages its own lifecycle via silence timer)
    rec.onend = () => {
      restarting.current = false
      if (!activeRef.current) return
      const currentMode = modeRef.current
      if (currentMode === "wake") {
        // Auto-restart wake listener after a small debounce
        setTimeout(() => {
          if (activeRef.current && modeRef.current === "wake") {
            startSession("wake")
          }
        }, 150)
      }
      // command mode: do NOT restart here — silence timer and onresult handle it
    }

    try {
      rec.start()
      restarting.current = false
      if (mode === "wake") updateState("wake-listening")
    } catch {
      restarting.current = false
      // Already running — retry after short delay
      recRef.current = null
      setTimeout(() => {
        if (activeRef.current) startSession(mode)
      }, 300)
    }
  }, [
    getSpeechRec, lang, wakeName, silenceMs,
    onTranscript, updateState,
    stopCurrentRec, clearSilence, stopAnalyser,
  ])

  // ─── Public API ───────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    if (activeRef.current) return

    const SpeechRec = getSpeechRec()
    if (!SpeechRec) {
      setError("Web Speech API não suportada neste navegador. Use Chrome ou Edge.")
      return
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      setPermissionGranted(true)
      setError(null)
    } catch {
      setError("Permissão de microfone negada. Verifique as configurações do navegador.")
      return
    }

    activeRef.current = true
    await startAnalyser(micDeviceId)
    startSession("wake")
  }, [getSpeechRec, micDeviceId, startAnalyser, startSession])

  const stop = useCallback(() => {
    activeRef.current = false
    clearSilence()
    stopCurrentRec()
    stopAnalyser()
    updateState("idle")
    restarting.current = false
  }, [clearSilence, stopCurrentRec, stopAnalyser, updateState])

  // Resume to wake mode after TTS finishes speaking
  const resumeWake = useCallback(() => {
    if (!activeRef.current) return
    modeRef.current = "wake"
    updateState("wake-listening")
    startSession("wake")
  }, [startSession, updateState])

  // Skip wake word — go directly to command mode
  const pushToTalk = useCallback(() => {
    if (!activeRef.current) return
    clearSilence()
    stopCurrentRec()
    updateState("listening")
    setTimeout(() => {
      if (activeRef.current) startSession("command")
    }, 200)
  }, [clearSilence, stopCurrentRec, startSession, updateState])

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      activeRef.current = false
      clearSilence()
      stopCurrentRec()
      stopAnalyser()
    }
  }, [clearSilence, stopCurrentRec, stopAnalyser])

  return {
    state,
    audioLevel,
    permissionGranted,
    error,
    start,
    stop,
    pushToTalk,
    resumeWake,
  }
}
