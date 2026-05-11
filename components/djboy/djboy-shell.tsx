"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Mic, MicOff, Settings, Paperclip, Link2, Send, X, Trash2, Eye, EyeOff, ChevronDown, Plus } from "lucide-react"
import { Orb } from "@/components/ui/orb"
import { useVoice } from "@/hooks/use-voice"
import { useTTS } from "@/hooks/use-tts"
import { useMemory, type MemoryStore, type ProjectContext } from "@/hooks/use-memory"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  attachments?: { type: "file" | "image" | "link"; name: string; url?: string }[]
}

interface Settings {
  provider: "deepseek" | "gemini" | "openai" | "anthropic"
  apiKeys: Record<string, string>
  ttsProvider: "browser" | "google"
  googleTTSKey: string
  micDeviceId: string
  systemPrompt: string
}

// ─── Types ────────────────────────────────────────────────────────────────────

type OrbState = "idle" | "wake-listening" | "listening" | "thinking" | "speaking"

// ─── Constants ────────────────────────────────────────────────────────────────


const PROVIDERS = [
  { id: "deepseek",  label: "DeepSeek",  url: "https://api.deepseek.com/v1/chat/completions",                              model: "deepseek-chat",          placeholder: "sk-..." },
  { id: "gemini",    label: "Gemini",    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",  model: "gemini-2.0-flash",       placeholder: "AIza..." },
  { id: "openai",    label: "OpenAI",    url: "https://api.openai.com/v1/chat/completions",                               model: "gpt-4o-mini",            placeholder: "sk-..." },
  { id: "anthropic", label: "Anthropic", url: "https://api.anthropic.com/v1/messages",                                    model: "claude-3-5-haiku-20241022", placeholder: "sk-ant-..." },
] as const

const DEFAULT_PROMPT = `Você é DJ Boy, assistente pessoal de alto nível.

COMPORTAMENTO: Direto e conciso — suas respostas são lidas em voz alta. Linguagem natural.

HARDWARE: MacBook Pro 2017, macOS Sequoia via OpenCore. Ferramentas: Gemini CLI, Obsidian, Graphify, v0.

Se não souber algo, pesquise. Confirme antes de executar ações.`

const DEFAULT_SETTINGS: Settings = {
  provider: "deepseek",
  apiKeys: {},
  ttsProvider: "browser",
  googleTTSKey: "",
  micDeviceId: "",
  systemPrompt: DEFAULT_PROMPT,
}

const STATE_LABEL: Record<OrbState, string> = {
  idle:             "Inativo",
  "wake-listening": 'Aguardando "DJ Boy"',
  listening:        "Ouvindo...",
  thinking:         "Processando...",
  speaking:         "Respondendo",
}

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem("djboy_settings_v2")
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch { return DEFAULT_SETTINGS }
}

// ─── Main Shell ───────────────────────────────────────────────────────────────

export function DJBoyShell() {
  const [messages, setMessages]         = useState<Message[]>([])
  const [settings, setSettingsState]    = useState<Settings>(DEFAULT_SETTINGS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isThinking, setIsThinking]     = useState(false)
  const [isActive, setIsActive]         = useState(false)
  const [orbState, setOrbState]         = useState<OrbState>("idle")
  const [inputText, setInputText]       = useState("")
  const [attachments, setAttachments]   = useState<Message["attachments"]>([])
  const [showLink, setShowLink]         = useState(false)
  const [linkText, setLinkText]         = useState("")
  const [microphones, setMics]          = useState<MediaDeviceInfo[]>([])
  const [showChat, setShowChat]         = useState(false)

  const settingsRef  = useRef(settings)
  const messagesRef  = useRef(messages)
  const messagesEnd  = useRef<HTMLDivElement>(null)
  const fileRef      = useRef<HTMLInputElement>(null)
  const memory       = useMemory()

  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Load settings on mount
  useEffect(() => {
    const s = loadSettings()
    setSettingsState(s)
    settingsRef.current = s
    navigator.mediaDevices?.enumerateDevices()
      .then(devs => setMics(devs.filter(d => d.kind === "audioinput")))
      .catch(() => {})
  }, [])

  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s)
    settingsRef.current = s
    localStorage.setItem("djboy_settings_v2", JSON.stringify(s))
  }, [])

  // Auto-scroll
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  // ─── LLM call ───────────────────────────────────────────────────────────────

  const callLLM = useCallback(async (content: string, atts?: Message["attachments"]): Promise<string> => {
    const s = settingsRef.current
    const key = s.apiKeys[s.provider]
    if (!key) return `Configure a API key do ${s.provider} nas configurações.`

    const prov = PROVIDERS.find(p => p.id === s.provider)!
    const memCtx = memory.buildContextBlock()
    const sys = memCtx ? `${s.systemPrompt}\n\n---\n## MEMÓRIA\n${memCtx}` : s.systemPrompt

    const history = messagesRef.current.slice(-14).map(m => ({ role: m.role, content: m.content }))
    let msg = content
    if (atts?.length) msg += "\n\n" + atts.map(a => a.type === "link" ? `[Link: ${a.url}]` : `[${a.name}]`).join("\n")

    const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${key}` }
    let body: object

    if (s.provider === "anthropic") {
      headers["anthropic-version"] = "2023-06-01"
      headers["x-api-key"] = key
      delete headers.Authorization
      body = { model: prov.model, max_tokens: 1024, system: sys, messages: [...history, { role: "user", content: msg }] }
    } else {
      body = { model: prov.model, messages: [{ role: "system", content: sys }, ...history, { role: "user", content: msg }], max_tokens: 1024, temperature: 0.7 }
    }

    const res = await fetch(prov.url, { method: "POST", headers, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return s.provider === "anthropic" ? data.content?.[0]?.text ?? "" : data.choices?.[0]?.message?.content ?? ""
  }, [memory])

  // ─── TTS ────────────────────────────────────────────────────────────────────

  const { speak, stop: stopSpeaking, isSpeaking } = useTTS({
    provider: settings.ttsProvider,
    googleApiKey: settings.googleTTSKey || undefined,
    lang: "pt-BR",
    onStart: () => setOrbState("speaking"),
    onEnd:   () => setOrbState(isActive ? "wake-listening" : "idle"),
  })

  // ─── Send message ────��───────────────────────────────────────────────────────

  const handleSend = useCallback(async (content: string, atts?: Message["attachments"]) => {
    if (!content.trim() && !atts?.length) return
    stopSpeaking()

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content, timestamp: new Date(), attachments: atts }
    setMessages(prev => [...prev, userMsg])
    memory.addEntry("user", content)
    if (!showChat) setShowChat(true)
    setIsThinking(true)
    setOrbState("thinking")

    try {
      const reply = await callLLM(content, atts)
      const aMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: reply, timestamp: new Date() }
      setMessages(prev => [...prev, aMsg])
      memory.addEntry("assistant", reply)
      speak(reply)
    } catch {
      const errMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: "Erro ao processar. Verifique sua API key.", timestamp: new Date() }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setIsThinking(false)
    }
  }, [callLLM, speak, stopSpeaking, memory, showChat])

  // ─── Voice ──────────────────────────────────────────────────────────────────

  const { audioLevel, error: voiceError, start, stop } = useVoice({
    wakeName:    "dj boy",
    micDeviceId: settings.micDeviceId || undefined,
    lang:        "pt-BR",
    silenceMs:   1400,
    onTranscript: text => handleSend(text),
    onStateChange: vs => {
      if (vs === "listening")           setOrbState("listening")
      else if (vs === "wake-listening") setOrbState("wake-listening")
    },
  })

  const toggleVoice = useCallback(async () => {
    if (isActive) {
      stop(); stopSpeaking(); setIsActive(false); setOrbState("idle")
    } else {
      setIsActive(true); setOrbState("wake-listening"); await start()
    }
  }, [isActive, start, stop, stopSpeaking])

  // ─── Input helpers ───────────────────────────────────────────────────────────

  const handleTextSend = useCallback(() => {
    if (!inputText.trim() && !attachments?.length) return
    handleSend(inputText, attachments)
    setInputText("")
    setAttachments([])
  }, [inputText, attachments, handleSend])

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    setAttachments(prev => [
      ...(prev ?? []),
      ...files.map(f => ({ type: f.type.startsWith("image/") ? "image" as const : "file" as const, name: f.name }))
    ])
    e.target.value = ""
  }, [])

  const addLink = useCallback(() => {
    if (!linkText.trim()) return
    setAttachments(prev => [...(prev ?? []), { type: "link", name: linkText, url: linkText }])
    setLinkText(""); setShowLink(false)
  }, [linkText])

  const effectiveOrb: OrbState = isThinking ? "thinking" : isSpeaking ? "speaking" : orbState

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex flex-col h-screen w-full overflow-hidden font-sans" style={{ background: "#000" }}>

      {/* Full-screen ambient glow — reacts to state */}
      <motion.div
        className="pointer-events-none absolute"
        style={{ inset: 0, zIndex: 0 }}
        animate={{
          background:
            effectiveOrb === "speaking"
              ? "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(168,85,247,0.18) 0%, transparent 70%)"
              : effectiveOrb === "listening"
              ? "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(16,185,129,0.18) 0%, transparent 70%)"
              : effectiveOrb === "thinking"
              ? "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(245,158,11,0.16) 0%, transparent 70%)"
              : "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(79,70,229,0.16) 0%, transparent 70%)",
        }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
      />

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <motion.div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: isActive ? "#34d399" : "rgba(255,255,255,0.2)" }}
            animate={isActive ? { opacity: [1, 0.35, 1] } : { opacity: 0.5 }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
          <span className="text-[11px] font-medium tracking-[0.14em] uppercase" style={{ color: "rgba(255,255,255,0.32)" }}>
            {isActive ? "Ativo" : "Offline"}
          </span>
        </div>

        <span className="text-[13px] font-semibold tracking-[0.28em] uppercase" style={{ color: "rgba(255,255,255,0.45)" }}>
          DJ&nbsp;BOY
        </span>

        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <motion.button
              onClick={() => { setMessages([]); setShowChat(false); stopSpeaking() }}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-white/5"
              style={{ color: "rgba(255,255,255,0.28)" }}
              whileTap={{ scale: 0.9 }}
              aria-label="Limpar"
            >
              <Trash2 size={14} />
            </motion.button>
          )}
          <motion.button
            onClick={() => setSettingsOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-white/5"
            style={{ color: "rgba(255,255,255,0.28)" }}
            whileTap={{ scale: 0.9 }}
            aria-label="Configurações"
          >
            <Settings size={14} />
          </motion.button>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col items-center overflow-hidden">

        {/* Orb area */}
        <AnimatePresence mode="wait">
          {!showChat ? (
            <motion.div
              key="full"
              className="flex flex-col items-center gap-8 mt-6"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.button
                onClick={toggleVoice}
                className="relative outline-none"
                whileTap={{ scale: 0.95 }}
                aria-label={isActive ? "Pausar" : "Ativar DJ Boy"}
              >
                {/* Ambient glow — color matches orb STATE_CONFIG */}
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      effectiveOrb === "listening"
                        ? "radial-gradient(circle at 50% 50%, rgba(134,239,172,0.18) 0%, rgba(34,211,238,0.12) 35%, transparent 72%)"
                        : effectiveOrb === "speaking"
                        ? "radial-gradient(circle at 50% 50%, rgba(240,171,252,0.20) 0%, rgba(168,85,247,0.12) 35%, transparent 72%)"
                        : effectiveOrb === "thinking"
                        ? "radial-gradient(circle at 50% 50%, rgba(252,211,77,0.18) 0%, rgba(249,115,22,0.12) 35%, transparent 72%)"
                        : effectiveOrb === "wake-listening"
                        ? "radial-gradient(circle at 50% 50%, rgba(165,180,252,0.16) 0%, rgba(99,102,241,0.10) 35%, transparent 72%)"
                        : "radial-gradient(circle at 50% 50%, rgba(94,234,212,0.14) 0%, rgba(13,148,136,0.08) 35%, transparent 72%)",
                    margin: "-40px",
                    borderRadius: "50%",
                  }}
                  animate={{
                    opacity: isActive ? [0.6, 1.0, 0.6] : [0.2, 0.38, 0.2],
                    scale:   isActive ? [0.96, 1.04, 0.96] : [0.98, 1.01, 0.98],
                  }}
                  transition={{ duration: isActive ? 2.2 : 4.0, repeat: Infinity, ease: "easeInOut" }}
                />
                <Orb
                  className="w-[300px] h-[300px]"
                  orbState={effectiveOrb}
                  audioLevel={audioLevel}
                />
              </motion.button>

              {/* Status label + action */}
              <div className="flex flex-col items-center gap-5 mt-2">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={effectiveOrb}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="text-[15px] font-light tracking-[0.08em]"
                    style={{ color: "rgba(255,255,255,0.52)" }}
                  >
                    {STATE_LABEL[effectiveOrb]}
                  </motion.p>
                </AnimatePresence>

                <motion.button
                  onClick={toggleVoice}
                  className="flex items-center gap-2.5 px-6 py-3 rounded-full text-[14px] font-medium transition-all"
                  style={{
                    background: isActive
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: isActive ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.55)",
                    backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    letterSpacing: "0.01em",
                  }}
                  whileHover={{
                    background: "rgba(255,255,255,0.11)",
                    borderColor: "rgba(255,255,255,0.18)",
                  }}
                  whileTap={{ scale: 0.96 }}
                >
                  {isActive ? <Mic size={14} /> : <MicOff size={14} />}
                  {isActive ? 'Ouvindo — toque para pausar' : 'Ativar voz'}
                </motion.button>

                {voiceError && (
                  <p className="text-[12px] font-medium" style={{ color: "#ff453a" }}>{voiceError}</p>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="mini"
              className="flex flex-col items-center gap-2 pt-2 pb-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35 }}
            >
              <motion.button onClick={toggleVoice} whileTap={{ scale: 0.94 }} aria-label="Toggle voz"
                className="relative outline-none"
              >
                <Orb
                  className="w-[88px] h-[88px]"
                  orbState={effectiveOrb}
                  audioLevel={audioLevel}
                />
              </motion.button>
              <p className="text-[10px] tracking-[0.16em] uppercase font-medium" style={{ color: "rgba(255,255,255,0.28)" }}>
                {STATE_LABEL[effectiveOrb]}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat messages */}
        <AnimatePresence>
          {showChat && (
            <motion.div
              className="w-full max-w-[680px] flex-1 overflow-y-auto px-5 pb-3 pt-2 space-y-2.5"
              style={{ scrollbarWidth: "none" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35, delay: 0.1 }}
            >
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className="max-w-[76%] px-4 py-3 text-[14px] leading-relaxed"
                    style={msg.role === "user" ? {
                      background: "rgba(255,255,255,0.09)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      color: "rgba(255,255,255,0.90)",
                      borderRadius: "18px 18px 4px 18px",
                      backdropFilter: "blur(16px)",
                    } : {
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.72)",
                      borderRadius: "18px 18px 18px 4px",
                      backdropFilter: "blur(16px)",
                    }}
                  >
                    {msg.content}
                    {msg.attachments?.map((a, i) => (
                      <span key={i} className="block mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                        {a.type === "link" ? "↗" : "⊕"} {a.name}
                      </span>
                    ))}
                  </div>
                </motion.div>
              ))}

              {/* Thinking indicator */}
              <AnimatePresence>
                {isThinking && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex justify-start"
                  >
                    <div
                      className="px-4 py-3 flex gap-1.5 items-center"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: "18px 18px 18px 4px",
                      }}
                    >
                      {[0, 1, 2].map(i => (
                        <motion.div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: "rgba(255,255,255,0.45)" }}
                          animate={{ opacity: [0.25, 1, 0.25], scale: [0.7, 1, 0.7] }}
                          transition={{ duration: 0.85, repeat: Infinity, delay: i * 0.18 }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEnd} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Input bar ──────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 pb-6 pt-2 w-full max-w-[680px] mx-auto">
        {/* Attachments */}
        <AnimatePresence>
          {!!attachments?.length && (
            <motion.div
              className="flex flex-wrap gap-1.5 mb-2 px-1"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              {attachments.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
                  style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.09)" }}
                >
                  {a.name.length > 22 ? a.name.slice(0, 22) + "…" : a.name}
                  <button onClick={() => setAttachments(prev => prev?.filter((_, j) => j !== i))} aria-label="Remover">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Link input */}
        <AnimatePresence>
          {showLink && (
            <motion.div
              className="flex gap-2 mb-2"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <input
                value={linkText}
                onChange={e => setLinkText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addLink()}
                placeholder="Cole o link..."
                autoFocus
                className="flex-1 px-4 py-2.5 rounded-full text-[13px] outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.85)" }}
              />
              <button
                onClick={addLink}
                className="px-4 py-2 rounded-full text-[12px] font-medium"
                style={{ background: "rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.85)" }}
              >
                OK
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main input */}
        <div
          className="flex items-center gap-2 px-4 py-3.5 rounded-2xl"
          style={{
            background: "rgba(255,255,255,0.045)",
            border: "1px solid rgba(255,255,255,0.09)",
            backdropFilter: "blur(28px)",
          }}
        >
          <input type="file" ref={fileRef} onChange={handleFile} multiple className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors"
            style={{ color: "rgba(255,255,255,0.28)" }}
            aria-label="Anexar"
          >
            <Paperclip size={15} />
          </button>
          <button
            onClick={() => setShowLink(v => !v)}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors"
            style={{ color: "rgba(255,255,255,0.28)" }}
            aria-label="Link"
          >
            <Link2 size={15} />
          </button>
          <input
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSend() } }}
            placeholder='Digite ou diga "DJ Boy"...'
            className="flex-1 bg-transparent outline-none text-[14px]"
            style={{ color: "rgba(255,255,255,0.85)", caretColor: "white" }}
          />
          <motion.button
            onClick={handleTextSend}
            className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
            style={{
              background: (inputText.trim() || !!attachments?.length) ? "rgba(255,255,255,0.14)" : "transparent",
              color: (inputText.trim() || !!attachments?.length) ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)",
            }}
            whileTap={{ scale: 0.88 }}
            aria-label="Enviar"
          >
            <Send size={14} />
          </motion.button>
        </div>

        <p className="text-center text-[11px] mt-2.5" style={{ color: "rgba(255,255,255,0.14)" }}>
          DJ Boy pode cometer erros — verifique informações críticas
        </p>
      </div>

      {/* ── Settings Panel ─────────────────────────────────────────────────── */}
      <SettingsDrawer
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onClose={() => setSettingsOpen(false)}
        microphones={microphones}
        memoryStore={memory.getStore()}
        onUpdateNotes={memory.updateNotes}
        onUpsertProject={memory.upsertProject}
        onClearMemory={() => { localStorage.removeItem("djboy_memory"); window.location.reload() }}
      />
    </div>
  )
}

// ─── Settings Drawer ──────────────────────────────────────────────────────────

interface SettingsDrawerProps {
  open: boolean
  settings: Settings
  onChange: (s: Settings) => void
  onClose: () => void
  microphones: MediaDeviceInfo[]
  memoryStore?: MemoryStore
  onUpdateNotes?: (v: string) => void
  onUpsertProject?: (p: ProjectContext) => void
  onClearMemory?: () => void
}

type Tab = "ai" | "voice" | "prompt" | "memory"

const TABS: { id: Tab; label: string }[] = [
  { id: "ai",     label: "IA & API" },
  { id: "voice",  label: "Voz" },
  { id: "prompt", label: "Prompt" },
  { id: "memory", label: "Memória" },
]

function SettingsDrawer({ open, settings, onChange, onClose, microphones, memoryStore, onUpdateNotes, onUpsertProject, onClearMemory }: SettingsDrawerProps) {
  const [tab, setTab]         = useState<Tab>("ai")
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [notes, setNotes]     = useState(memoryStore?.persistentNotes ?? "")
  const [newProj, setNewProj] = useState<Partial<ProjectContext>>({})

  useEffect(() => { setNotes(memoryStore?.persistentNotes ?? "") }, [memoryStore?.persistentNotes])

  const glass = {
    background: "rgba(12,12,14,0.92)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(40px)",
  }

  const inputStyle = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.85)",
    borderRadius: "10px",
  }

  const label = (text: string) => (
    <p className="text-[10px] font-semibold tracking-[0.15em] uppercase mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
      {text}
    </p>
  )

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[400px] flex flex-col overflow-hidden"
            style={glass}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 280 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>Configurações</p>
              <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}>
                <X size={15} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex px-4 pt-4 pb-2 gap-1">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-medium tracking-wide transition-all"
                  style={{
                    background: tab === t.id ? "rgba(255,255,255,0.09)" : "transparent",
                    color: tab === t.id ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.32)",
                    border: tab === t.id ? "1px solid rgba(255,255,255,0.10)" : "1px solid transparent",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ scrollbarWidth: "none" }}>

              {/* ── AI & API ── */}
              {tab === "ai" && (
                <>
                  {label("Provider")}
                  <div className="grid grid-cols-2 gap-2 mb-5">
                    {PROVIDERS.map(p => (
                      <button
                        key={p.id}
                        onClick={() => onChange({ ...settings, provider: p.id as Settings["provider"] })}
                        className="py-2.5 rounded-xl text-[12px] font-medium transition-all"
                        style={{
                          background: settings.provider === p.id ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.03)",
                          border: settings.provider === p.id ? "1px solid rgba(255,255,255,0.16)" : "1px solid rgba(255,255,255,0.06)",
                          color: settings.provider === p.id ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {label("API Keys")}
                  <div className="space-y-3">
                    {PROVIDERS.map(p => (
                      <div key={p.id}>
                        <p className="text-[11px] mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>{p.label}</p>
                        <div className="flex gap-2">
                          <input
                            type={showKeys[p.id] ? "text" : "password"}
                            placeholder={p.placeholder}
                            value={settings.apiKeys[p.id] ?? ""}
                            onChange={e => onChange({ ...settings, apiKeys: { ...settings.apiKeys, [p.id]: e.target.value } })}
                            className="flex-1 px-3 py-2 text-[12px] outline-none font-mono"
                            style={inputStyle}
                          />
                          <button
                            onClick={() => setShowKeys(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                            className="w-9 flex items-center justify-center rounded-xl"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}
                          >
                            {showKeys[p.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* ── Voice ── */}
              {tab === "voice" && (
                <>
                  {label("Motor TTS")}
                  <div className="grid grid-cols-2 gap-2 mb-5">
                    {[{ id: "browser", label: "Navegador" }, { id: "google", label: "Google Neural" }].map(e => (
                      <button
                        key={e.id}
                        onClick={() => onChange({ ...settings, ttsProvider: e.id as Settings["ttsProvider"] })}
                        className="py-2.5 rounded-xl text-[12px] font-medium transition-all"
                        style={{
                          background: settings.ttsProvider === e.id ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.03)",
                          border: settings.ttsProvider === e.id ? "1px solid rgba(255,255,255,0.16)" : "1px solid rgba(255,255,255,0.06)",
                          color: settings.ttsProvider === e.id ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
                        }}
                      >
                        {e.label}
                      </button>
                    ))}
                  </div>

                  {settings.ttsProvider === "google" && (
                    <>
                      {label("Google TTS API Key")}
                      <input
                        type="password"
                        placeholder="AIza..."
                        value={settings.googleTTSKey}
                        onChange={e => onChange({ ...settings, googleTTSKey: e.target.value })}
                        className="w-full px-3 py-2.5 text-[12px] outline-none font-mono mb-4"
                        style={inputStyle}
                      />
                    </>
                  )}

                  {label("Microfone")}
                  <div className="relative">
                    <select
                      value={settings.micDeviceId}
                      onChange={e => onChange({ ...settings, micDeviceId: e.target.value })}
                      className="w-full px-3 py-2.5 text-[12px] outline-none appearance-none pr-8"
                      style={{ ...inputStyle, borderRadius: "10px" }}
                    >
                      <option value="">Padrão do sistema</option>
                      {microphones.map(m => (
                        <option key={m.deviceId} value={m.deviceId}>{m.label || `Mic ${m.deviceId.slice(0, 8)}`}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(255,255,255,0.3)" }} />
                  </div>
                </>
              )}

              {/* ── Prompt ── */}
              {tab === "prompt" && (
                <>
                  {label("System Prompt")}
                  <textarea
                    value={settings.systemPrompt}
                    onChange={e => onChange({ ...settings, systemPrompt: e.target.value })}
                    rows={18}
                    className="w-full px-3 py-2.5 text-[12px] outline-none font-mono resize-none leading-relaxed"
                    style={inputStyle}
                  />
                  <button
                    onClick={() => onChange({ ...settings, systemPrompt: DEFAULT_PROMPT })}
                    className="text-[11px] hover:opacity-60 transition-opacity"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    Restaurar padrão
                  </button>
                </>
              )}

              {/* ── Memory ── */}
              {tab === "memory" && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    {label("Projetos")}
                    {onClearMemory && (
                      <button onClick={onClearMemory} className="text-[10px] flex items-center gap-1 hover:opacity-60 transition-opacity" style={{ color: "rgba(255,59,48,0.7)" }}>
                        <Trash2 size={10} /> Limpar tudo
                      </button>
                    )}
                  </div>

                  {memoryStore?.projects.map((p, i) => (
                    <div key={i} className="p-3 rounded-xl mb-2 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <p className="font-medium mb-0.5" style={{ color: "rgba(255,255,255,0.8)" }}>{p.name}</p>
                      <p style={{ color: "rgba(255,255,255,0.4)" }}>{p.description}</p>
                      {p.tech.length > 0 && <p className="mt-1 font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>{p.tech.join(", ")}</p>}
                    </div>
                  ))}

                  {/* Add project */}
                  <div className="p-3 rounded-xl flex flex-col gap-2 mb-5" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>Adicionar projeto</p>
                    {(["name", "description", "tech"] as const).map(f => (
                      <input
                        key={f}
                        placeholder={f === "name" ? "Nome" : f === "description" ? "Descrição" : "Tech (React, Python...)"}
                        value={(newProj[f] as string) ?? ""}
                        onChange={e => setNewProj(prev => ({ ...prev, [f]: e.target.value }))}
                        className="w-full px-3 py-2 text-[12px] outline-none"
                        style={inputStyle}
                      />
                    ))}
                    <button
                      onClick={() => {
                        if (!newProj.name) return
                        onUpsertProject?.({ name: newProj.name!, description: newProj.description ?? "", tech: (newProj.tech ?? "").split(",").map(t => t.trim()).filter(Boolean), notes: "", lastUpdated: new Date().toISOString() })
                        setNewProj({})
                      }}
                      className="flex items-center justify-center gap-1 py-2 rounded-xl text-[12px] font-medium transition-all"
                      style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.09)" }}
                    >
                      <Plus size={12} /> Adicionar
                    </button>
                  </div>

                  {label("Notas permanentes")}
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    onBlur={() => onUpdateNotes?.(notes)}
                    rows={6}
                    placeholder="Preferências, contexto pessoal, informações fixas..."
                    className="w-full px-3 py-2.5 text-[12px] outline-none font-mono resize-none leading-relaxed mb-5"
                    style={inputStyle}
                  />

                  {label("Histórico diário")}
                  {memoryStore?.dailyMemories.slice(0, 5).map(d => (
                    <div key={d.date} className="mb-2 p-2.5 rounded-xl text-[11px]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="flex justify-between"><span style={{ color: "rgba(255,255,255,0.35)" }}>{d.date}</span><span style={{ color: "rgba(255,255,255,0.2)" }}>{d.entries.length} msgs</span></div>
                      {d.summary && <p className="mt-1" style={{ color: "rgba(255,255,255,0.42)" }}>{d.summary}</p>}
                    </div>
                  ))}
                  {!memoryStore?.dailyMemories.length && (
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.2)" }}>Nenhum histórico ainda.</p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
