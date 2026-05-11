"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Mic, MicOff, AlertCircle } from "lucide-react"
import { Orb } from "./orb"
import { ChatMessages, type Message } from "./chat-messages"
import { InputBar } from "./input-bar"
import { Header } from "./header"
import { SettingsPanel, type DJBoySettings, DEFAULT_SYSTEM_PROMPT } from "./settings-panel"
import { useVoice, type VoiceState } from "@/hooks/use-voice"
import { useTTS } from "@/hooks/use-tts"
import { useMemory } from "@/hooks/use-memory"

type OrbState = "idle" | "listening" | "thinking" | "speaking"

const DEFAULT_SETTINGS: DJBoySettings = {
  provider: "deepseek",
  apiKeys: {},
  ttsProvider: "browser",
  googleTTSKey: "",
  micDeviceId: "",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
}

function loadSettings(): DJBoySettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem("djboy_settings")
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

function voiceStateToOrbState(vs: VoiceState, thinking: boolean, speaking: boolean): OrbState {
  if (speaking) return "speaking"
  if (thinking) return "thinking"
  if (vs === "listening") return "listening"
  return "idle"
}

export function DJBoyShell() {
  const [messages, setMessages] = useState<Message[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<DJBoySettings>(DEFAULT_SETTINGS)
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [online, setOnline] = useState(true)
  const [isThinking, setIsThinking] = useState(false)
  const messagesRef = useRef<Message[]>([])
  const settingsRef = useRef<DJBoySettings>(DEFAULT_SETTINGS)

  // Keep refs in sync for stable callbacks
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { settingsRef.current = settings }, [settings])

  // Load settings on mount
  useEffect(() => {
    const s = loadSettings()
    setSettings(s)
    settingsRef.current = s
  }, [])

  // Persist settings
  useEffect(() => {
    localStorage.setItem("djboy_settings", JSON.stringify(settings))
  }, [settings])

  // Online status
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  // Get microphones after permission
  useEffect(() => {
    async function getMics() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
        const devices = await navigator.mediaDevices.enumerateDevices()
        setMicrophones(devices.filter((d) => d.kind === "audioinput"))
      } catch {
        // permission not yet granted
      }
    }
    getMics()
  }, [])

  const callLLM = useCallback(async (content: string, attachments?: Message["attachments"]) => {
    const s = settingsRef.current
    const apiKey = s.apiKeys[s.provider]

    if (!apiKey) {
      return `Nenhuma API key configurada para ${s.provider}. Abra as configurações e adicione sua chave.`
    }

    // Build memory context block and inject into system prompt
    const memCtx = memory.buildContextBlock()
    const systemWithMemory = memCtx
      ? `${s.systemPrompt}\n\n---\n## MEMÓRIA E CONTEXTO ATUAL\n${memCtx}`
      : s.systemPrompt

    let apiUrl = ""
    let model = ""
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    }

    if (s.provider === "deepseek") {
      apiUrl = "https://api.deepseek.com/v1/chat/completions"
      model = "deepseek-chat"
    } else if (s.provider === "openai") {
      apiUrl = "https://api.openai.com/v1/chat/completions"
      model = "gpt-4o-mini"
    } else if (s.provider === "gemini") {
      apiUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      model = "gemini-2.5-flash"
    } else if (s.provider === "anthropic") {
      apiUrl = "https://api.anthropic.com/v1/messages"
      model = "claude-3-5-haiku-20241022"
      headers["anthropic-version"] = "2023-06-01"
      headers["x-api-key"] = apiKey
      delete headers["Authorization"]
    }

    const history = messagesRef.current.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // Append attachment context to message
    let fullContent = content
    if (attachments?.length) {
      const attDesc = attachments
        .map((a) => `[${a.type === "link" ? "Link" : a.type === "image" ? "Imagem" : "Arquivo"}: ${a.name}]`)
        .join(", ")
      fullContent = `${content}\n\nAnexos: ${attDesc}`
    }

    const body =
      s.provider === "anthropic"
        ? {
            model,
            max_tokens: 1024,
            system: systemWithMemory,
            messages: [...history, { role: "user", content: fullContent }],
          }
        : {
            model,
            messages: [
              { role: "system", content: systemWithMemory },
              ...history,
              { role: "user", content: fullContent },
            ],
            max_tokens: 1024,
            temperature: 0.7,
          }

    const res = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => "")
      throw new Error(`API ${res.status}: ${errBody}`)
    }

    const data = await res.json()
    return s.provider === "anthropic"
      ? (data.content?.[0]?.text ?? "Sem resposta.")
      : (data.choices?.[0]?.message?.content ?? "Sem resposta.")
  }, [])

  const memory = useMemory()

  const { speak, stop: stopSpeaking, isSpeaking } = useTTS({
    provider: settings.ttsProvider,
    googleApiKey: settings.googleTTSKey || undefined,
    onStart: () => {},
    onEnd: () => {
      // After speaking, if voice is active go back to wake-listening automatically
    },
  })

  const handleTranscript = useCallback(
    async (text: string) => {
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMsg])
      memory.addEntry("user", text)
      setIsThinking(true)
      try {
        const reply = await callLLM(text)
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, assistantMsg])
        memory.addEntry("assistant", reply)
        speak(reply)
      } catch {
        const errMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Erro ao processar. Verifique sua API key e conexão.",
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errMsg])
        speak(errMsg.content)
      } finally {
        setIsThinking(false)
      }
    },
    [callLLM, speak, memory]
  )

  const { state: voiceState, audioLevel, error: voiceError, start, stop, pushToTalk } = useVoice({
    wakeName: "dj boy",
    micDeviceId: settings.micDeviceId || undefined,
    silenceMs: 1400,
    onTranscript: handleTranscript,
  })

  const orbState = voiceStateToOrbState(voiceState, isThinking, isSpeaking)

  const handleSend = useCallback(
    async (content: string, attachments?: Message["attachments"]) => {
      if (!content.trim() && !attachments?.length) return
      stopSpeaking()
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date(),
        attachments,
      }
      setMessages((prev) => [...prev, userMsg])
      memory.addEntry("user", content)
      setIsThinking(true)
      try {
        const reply = await callLLM(content, attachments)
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, assistantMsg])
        memory.addEntry("assistant", reply)
        speak(reply)
      } catch {
        const errMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Erro ao processar. Verifique sua API key e conexão.",
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errMsg])
        speak(errMsg.content)
      } finally {
        setIsThinking(false)
      }
    },
    [callLLM, speak, stopSpeaking, memory]
  )

  const isVoiceActive = voiceState !== "idle"

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden select-none"
      style={{ background: "oklch(0.07 0.01 230)" }}
    >
      {/* Background grid */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.22 0.04 215 / 0.03) 1px, transparent 1px), linear-gradient(90deg, oklch(0.22 0.04 215 / 0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <Header
        online={online}
        onSettings={() => setSettingsOpen(true)}
        onClear={() => { setMessages([]); stopSpeaking() }}
      />

      <main className="flex-1 flex flex-col min-h-0">
        {/* Orb + voice controls */}
        <div className="flex flex-col items-center gap-4 py-4">
          <button
            onClick={isVoiceActive ? pushToTalk : start}
            className="focus:outline-none"
            aria-label="Pressionar para falar"
          >
            <Orb state={orbState} audioLevel={audioLevel} />
          </button>

          {/* Wake word hint / active indicator */}
          <AnimatePresence mode="wait">
            {voiceState === "wake-listening" && (
              <motion.div
                key="wake"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center gap-2"
              >
                <span
                  className="text-xs font-mono tracking-widest"
                  style={{ color: "oklch(0.38 0.04 215)" }}
                >
                  Aguardando &quot;DJ Boy&quot;...
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Voice toggle button */}
          <div className="flex items-center gap-3">
            <button
              onClick={isVoiceActive ? stop : start}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono tracking-wide transition-all"
              style={{
                background: isVoiceActive
                  ? "oklch(0.72 0.18 210 / 0.15)"
                  : "oklch(0.14 0.015 225)",
                border: isVoiceActive
                  ? "1px solid oklch(0.72 0.18 210 / 0.4)"
                  : "1px solid oklch(0.25 0.04 215)",
                color: isVoiceActive ? "oklch(0.72 0.18 210)" : "oklch(0.5 0.04 215)",
              }}
            >
              {isVoiceActive ? <Mic size={12} /> : <MicOff size={12} />}
              {isVoiceActive ? "Voz ativa" : "Ativar voz"}
            </button>
          </div>

          {/* Error banner */}
          <AnimatePresence>
            {voiceError && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                style={{
                  background: "oklch(0.55 0.22 25 / 0.1)",
                  border: "1px solid oklch(0.55 0.22 25 / 0.3)",
                  color: "oklch(0.7 0.18 25)",
                }}
              >
                <AlertCircle size={12} />
                {voiceError}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          <div
            className="absolute top-0 left-0 right-0 h-8 pointer-events-none z-10"
            style={{
              background: "linear-gradient(to bottom, oklch(0.07 0.01 230), transparent)",
            }}
          />
          <ChatMessages messages={messages} />
        </div>

        <InputBar onSend={handleSend} disabled={isThinking} />
      </main>

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onClose={() => setSettingsOpen(false)}
        microphones={microphones}
        memoryStore={memory.getStore()}
        onUpdateNotes={memory.updateNotes}
        onUpsertProject={memory.upsertProject}
        onClearMemory={() => {
          localStorage.removeItem("djboy_memory")
          window.location.reload()
        }}
      />
    </div>
  )
}
