"use client"

import { useRef, useState, useCallback } from "react"

export type TTSProvider = "browser" | "google" | "gemini-tts"

interface UseTTSOptions {
  provider?: TTSProvider
  googleApiKey?: string
  geminiApiKey?: string
  lang?: string
  onStart?: () => void
  onEnd?: () => void
}

export function useTTS({
  provider = "browser",
  googleApiKey,
  geminiApiKey,
  lang = "pt-BR",
  onStart,
  onEnd,
}: UseTTSOptions = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioRef  = useRef<HTMLAudioElement | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const ctxRef    = useRef<AudioContext | null>(null)

  const stop = useCallback(() => {
    if (provider === "browser") {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel()
    } else {
      try { sourceRef.current?.stop() } catch { /* already stopped */ }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ""
      }
    }
    setIsSpeaking(false)
    onEnd?.()
  }, [provider, onEnd])

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return
      stop()
      setIsSpeaking(true)
      onStart?.()

      // ── Browser TTS (BUG-4 fix: resume + chunking) ──────────────────────
      if (provider === "browser") {
        if (typeof window === "undefined") { setIsSpeaking(false); onEnd?.(); return }

        // Resume se o contexto de áudio estiver suspenso
        if (window.speechSynthesis.paused) window.speechSynthesis.resume()

        const voices = window.speechSynthesis.getVoices()
        const ptVoice = voices.find((v) => v.lang.startsWith("pt")) ?? null

        // Chrome para de falar após ~15s — dividir em chunks
        const chunks = text.match(/.{1,200}(?:\s|$)/g) ?? [text]
        let i = 0
        const speakChunk = () => {
          if (i >= chunks.length) {
            setIsSpeaking(false)
            onEnd?.()
            return
          }
          const u = new SpeechSynthesisUtterance(chunks[i++])
          u.lang = lang
          u.rate = 1.05
          u.pitch = 1.0
          if (ptVoice) u.voice = ptVoice
          u.onend = speakChunk
          u.onerror = () => {
            setIsSpeaking(false)
            onEnd?.()
          }
          window.speechSynthesis.speak(u)
        }
        speakChunk()
        return
      }

      // ── Gemini TTS via /api/tts ──────────────────────────────────────────
      if (provider === "gemini-tts") {
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, apiKey: geminiApiKey || undefined }),
          })
          if (!res.ok) throw new Error(`TTS HTTP ${res.status}`)
          const buf = await res.arrayBuffer()

          const Ctx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
          const ctx = new Ctx()
          ctxRef.current = ctx
          const decoded = await ctx.decodeAudioData(buf)
          const source = ctx.createBufferSource()
          source.buffer = decoded
          source.connect(ctx.destination)
          sourceRef.current = source
          source.onended = () => {
            setIsSpeaking(false)
            onEnd?.()
          }
          source.start()
        } catch {
          // Fallback silencioso ao browser TTS
          setIsSpeaking(false)
          onEnd?.()
        }
        return
      }

      // ── Google Neural TTS ────────────────────────────────────────────────
      if (provider === "google" && googleApiKey) {
        try {
          const res = await fetch(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleApiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                input: { text },
                voice: { languageCode: lang, ssmlGender: "NEUTRAL" },
                audioConfig: { audioEncoding: "MP3" },
              }),
            },
          )
          const data = await res.json()
          if (data.audioContent) {
            const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`)
            audioRef.current = audio
            audio.onended = () => {
              setIsSpeaking(false)
              onEnd?.()
            }
            audio.onerror = () => {
              setIsSpeaking(false)
              onEnd?.()
            }
            await audio.play()
          } else {
            setIsSpeaking(false)
            onEnd?.()
          }
        } catch {
          setIsSpeaking(false)
          onEnd?.()
        }
        return
      }

      // Provider não configurado
      setIsSpeaking(false)
      onEnd?.()
    },
    [provider, lang, googleApiKey, geminiApiKey, stop, onStart, onEnd],
  )

  return { speak, stop, isSpeaking }
}
