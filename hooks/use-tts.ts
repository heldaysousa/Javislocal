"use client"

import { useCallback, useRef, useState } from "react"

export type TTSProvider = "browser" | "google"

interface UseTTSOptions {
  provider: TTSProvider
  googleApiKey?: string
  lang?: string
  onStart?: () => void
  onEnd?: () => void
}

export function useTTS({ provider, googleApiKey, lang = "pt-BR", onStart, onEnd }: UseTTSOptions) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const stop = useCallback(() => {
    if (provider === "browser") {
      window.speechSynthesis.cancel()
    } else {
      audioRef.current?.pause()
      audioRef.current = null
    }
    setIsSpeaking(false)
    onEnd?.()
  }, [provider, onEnd])

  const speak = useCallback(
    async (text: string) => {
      // Strip markdown and truncate for voice
      const clean = text
        .replace(/#{1,6}\s/g, "")
        .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
        .replace(/`{1,3}[^`]*`{1,3}/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\n{2,}/g, ". ")
        .replace(/\n/g, " ")
        .trim()

      if (!clean) return

      setIsSpeaking(true)
      onStart?.()

      if (provider === "google" && googleApiKey) {
        try {
          const res = await fetch(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleApiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                input: { text: clean },
                voice: {
                  languageCode: lang,
                  name: "pt-BR-Neural2-B",
                  ssmlGender: "MALE",
                },
                audioConfig: {
                  audioEncoding: "MP3",
                  speakingRate: 1.05,
                  pitch: -1,
                  effectsProfileId: ["headphone-class-device"],
                },
              }),
            }
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
            return
          }
        } catch {
          // Fallback to browser TTS if Google fails
        }
      }

      // Browser TTS fallback
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(clean)
      utter.lang = lang
      utter.rate = 1.05
      utter.pitch = 0.92

      // Wait for voices to load
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices()
        const preferred = voices.find(
          (v) =>
            v.lang.startsWith("pt") &&
            (v.name.includes("Google") || v.name.includes("Daniel") || v.name.includes("Luciana"))
        )
        if (preferred) utter.voice = preferred
      }
      if (window.speechSynthesis.getVoices().length > 0) {
        loadVoices()
      } else {
        window.speechSynthesis.onvoiceschanged = loadVoices
      }

      utter.onstart = () => {
        setIsSpeaking(true)
        onStart?.()
      }
      utter.onend = () => {
        setIsSpeaking(false)
        onEnd?.()
      }
      utter.onerror = () => {
        setIsSpeaking(false)
        onEnd?.()
      }
      window.speechSynthesis.speak(utter)
    },
    [provider, googleApiKey, lang, onStart, onEnd]
  )

  return { speak, stop, isSpeaking }
}
