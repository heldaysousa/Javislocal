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

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const accumulatedRef = useRef("")
  const modeRef = useRef<"wake" | "command">("wake")
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)
  const activeRef = useRef(false)

  const updateState = useCallback(
    (s: VoiceState) => {
      setState(s)
      onStateChange?.(s)
    },
    [onStateChange]
  )

  // Start audio level analyser
  async function startAnalyser(deviceId?: string) {
    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtxRef.current = new AudioCtx()
      analyserRef.current = audioCtxRef.current.createAnalyser()
      analyserRef.current.fftSize = 512
      const source = audioCtxRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)

      const data = new Uint8Array(analyserRef.current.frequencyBinCount)
      const tick = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setAudioLevel(avg / 128)
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
      return true
    } catch {
      return false
    }
  }

  function stopAnalyser() {
    cancelAnimationFrame(rafRef.current)
    analyserRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setAudioLevel(0)
  }

  const getSpeechRec = useCallback(() => {
    const SpeechRec =
      window.SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition: typeof SpeechRecognition })
        .webkitSpeechRecognition
    return SpeechRec || null
  }, [])

  // Create and start a recognition session
  const createSession = useCallback(
    (mode: "wake" | "command") => {
      console.log("[v0] createSession chamado com modo:", mode)
      const SpeechRec = getSpeechRec()
      if (!SpeechRec || !activeRef.current) {
        console.log("[v0] createSession abortado - SpeechRec:", !!SpeechRec, "activeRef:", activeRef.current)
        return
      }

      const rec = new SpeechRec()
      rec.lang = lang
      rec.continuous = true
      rec.interimResults = true
      recognitionRef.current = rec
      modeRef.current = mode
      accumulatedRef.current = ""

      rec.onresult = (e: SpeechRecognitionEvent) => {
        let interim = ""
        let final = ""
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) final += t
          else interim += t
        }

        const all = (accumulatedRef.current + " " + final + " " + interim)
          .trim()
          .toLowerCase()
        console.log("[v0] onresult - mode:", mode, "all:", all, "interim:", interim, "final:", final)

        if (mode === "wake") {
          // Check for wake word in any accumulated text
          const variations = [
            wakeName,
            wakeName.replace(" ", ""),
            "dj boi",
            "dj boy",
            "deejay boy",
          ]
          const detected = variations.some((v) => all.includes(v))
          if (detected) {
            rec.stop()
            updateState("listening")
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
            setTimeout(() => activeRef.current && createSession("command"), 300)
          }
        } else {
          // Command mode — accumulate final transcripts
          if (final) accumulatedRef.current += " " + final

          // Reset silence timer on any speech
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          if (interim || final) {
            silenceTimerRef.current = setTimeout(() => {
              rec.stop()
              const transcript = accumulatedRef.current.trim()
              if (transcript) {
                onTranscript(transcript)
              } else {
                // Nothing captured, go back to wake mode
                if (activeRef.current) createSession("wake")
                updateState("wake-listening")
              }
            }, silenceMs)
          }
        }
      }

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        if (e.error === "no-speech" || e.error === "audio-capture") {
          // Restart silently
          if (activeRef.current) setTimeout(() => createSession(mode), 200)
          return
        }
        if (e.error === "not-allowed") {
          setError("Permissão de microfone negada.")
          setPermissionGranted(false)
          activeRef.current = false
          updateState("idle")
          stopAnalyser()
        }
      }

      rec.onend = () => {
        // Auto-restart in wake mode unless stopping
        if (activeRef.current && mode === "wake") {
          setTimeout(() => createSession("wake"), 200)
        }
      }

      try {
        rec.start()
        if (mode === "wake") updateState("wake-listening")
      } catch {
        // Already started
      }
    },
    [lang, wakeName, silenceMs, onTranscript, updateState, getSpeechRec]
  )

  const start = useCallback(async () => {
    console.log("[v0] useVoice.start() chamado")
    if (activeRef.current) {
      console.log("[v0] start() ignorado - já ativo")
      return
    }
    const SpeechRec = getSpeechRec()
    if (!SpeechRec) {
      console.log("[v0] Web Speech API NÃO suportada")
      setError("Web Speech API não suportada neste navegador.")
      return
    }
    console.log("[v0] Web Speech API disponível, solicitando microfone...")
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      setPermissionGranted(true)
      setError(null)
      console.log("[v0] Permissão de microfone concedida")
    } catch (e) {
      console.log("[v0] Erro ao solicitar microfone:", e)
      setError("Permissão de microfone negada.")
      return
    }
    activeRef.current = true
    await startAnalyser(micDeviceId)
    console.log("[v0] Analyser iniciado, criando sessão wake...")
    createSession("wake")
  }, [getSpeechRec, micDeviceId, createSession])

  const stop = useCallback(() => {
    activeRef.current = false
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    recognitionRef.current?.stop()
    recognitionRef.current = null
    stopAnalyser()
    updateState("idle")
  }, [updateState])

  // Manual push-to-talk trigger (skip wake word)
  const pushToTalk = useCallback(() => {
    if (!activeRef.current) return
    recognitionRef.current?.stop()
    recognitionRef.current = null
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    updateState("listening")
    setTimeout(() => createSession("command"), 200)
  }, [createSession, updateState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      recognitionRef.current?.stop()
      stopAnalyser()
    }
  }, [])

  return {
    state,
    audioLevel,
    permissionGranted,
    error,
    start,
    stop,
    pushToTalk,
    isActive: activeRef,
  }
}
