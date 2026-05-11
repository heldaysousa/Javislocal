"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Trash2, Eye, EyeOff, Brain, Plus } from "lucide-react"
import type { MemoryStore, ProjectContext } from "@/hooks/use-memory" from "lucide-react"

export interface DJBoySettings {
  provider: "deepseek" | "gemini" | "openai" | "anthropic"
  apiKeys: Record<string, string>
  ttsProvider: "google" | "browser"
  googleTTSKey: string
  micDeviceId: string
  systemPrompt: string
}

const DEFAULT_SYSTEM_PROMPT = `Você é DJ Boy, assistente pessoal de desenvolvimento e vida.

COMPORTAMENTO:
- Responda de forma direta e concisa — sua resposta será lida em voz alta
- Use linguagem natural, coloquial quando adequado
- Quando não souber algo, pesquise antes de responder
- Quando receber um comando de ação, confirme antes de executar

CONTEXTO TÉCNICO:
- MacBook Pro 2017, macOS Sequoia via OpenCore Legacy
- Ferramentas: Gemini CLI, Antigravity, Obsidian, Graphify, v0
- Projetos sincronizados via Git

CAPACIDADES:
- Conversa natural sobre qualquer tema
- Auxílio em desenvolvimento (Next.js, React, Python, etc.)
- Gestão de projetos e tarefas
- Pesquisa na web quando necessário
- Análise de arquivos, imagens e links enviados`

const PROVIDERS = [
  { id: "deepseek", label: "DeepSeek", placeholder: "sk-..." },
  { id: "gemini", label: "Google Gemini", placeholder: "AIza..." },
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
] as const

interface SettingsPanelProps {
  open: boolean
  settings: DJBoySettings
  onChange: (s: DJBoySettings) => void
  onClose: () => void
  microphones: MediaDeviceInfo[]
  memoryStore?: MemoryStore
  onUpdateNotes?: (notes: string) => void
  onUpsertProject?: (p: ProjectContext) => void
  onClearMemory?: () => void
}

export function SettingsPanel({
  open,
  settings,
  onChange,
  onClose,
  microphones,
  memoryStore,
  onUpdateNotes,
  onUpsertProject,
  onClearMemory,
}: SettingsPanelProps) {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [tab, setTab] = useState<"ai" | "voice" | "prompt" | "memory">("ai")
  const [newProject, setNewProject] = useState<Partial<ProjectContext>>({})
  const [notes, setNotes] = useState(memoryStore?.persistentNotes ?? "")

  useEffect(() => {
    setNotes(memoryStore?.persistentNotes ?? "")
  }, [memoryStore?.persistentNotes])

  function setKey(provider: string, value: string) {
    onChange({ ...settings, apiKeys: { ...settings.apiKeys, [provider]: value } })
  }

  function toggleShow(key: string) {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ background: "oklch(0.05 0.01 230 / 0.7)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 h-full z-50 w-full max-w-sm flex flex-col"
            style={{
              background: "oklch(0.1 0.015 228 / 0.97)",
              borderLeft: "1px solid oklch(0.25 0.04 215)",
              backdropFilter: "blur(24px)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid oklch(0.2 0.03 215)" }}>
              <span className="text-sm font-medium tracking-wide" style={{ color: "oklch(0.88 0.02 215)" }}>
                Configurações
              </span>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity" style={{ color: "oklch(0.5 0.04 215)" }}>
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex px-5 pt-4 gap-1">
              {(["ai", "voice", "prompt", "memory"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-mono tracking-wide transition-all"
                  style={{
                    background: tab === t ? "oklch(0.72 0.18 210 / 0.15)" : "transparent",
                    color: tab === t ? "oklch(0.72 0.18 210)" : "oklch(0.45 0.04 215)",
                    border: tab === t ? "1px solid oklch(0.72 0.18 210 / 0.3)" : "1px solid transparent",
                  }}
                >
                  {t === "ai" ? "IA" : t === "voice" ? "Voz" : t === "prompt" ? "Prompt" : "Memória"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
              {tab === "ai" && (
                <>
                  {/* Provider selector */}
                  <div>
                    <label className="text-xs font-mono tracking-widest uppercase mb-2 block" style={{ color: "oklch(0.5 0.05 215)" }}>
                      Modelo ativo
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {PROVIDERS.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => onChange({ ...settings, provider: p.id })}
                          className="py-2 px-3 rounded-xl text-xs font-medium transition-all text-left"
                          style={{
                            background: settings.provider === p.id ? "oklch(0.72 0.18 210 / 0.15)" : "oklch(0.14 0.015 225)",
                            border: settings.provider === p.id ? "1px solid oklch(0.72 0.18 210 / 0.4)" : "1px solid oklch(0.22 0.03 220)",
                            color: settings.provider === p.id ? "oklch(0.78 0.15 210)" : "oklch(0.55 0.04 215)",
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* API Keys */}
                  <div>
                    <label className="text-xs font-mono tracking-widest uppercase mb-2 block" style={{ color: "oklch(0.5 0.05 215)" }}>
                      API Keys
                    </label>
                    <div className="flex flex-col gap-2">
                      {PROVIDERS.map((p) => (
                        <div key={p.id}>
                          <p className="text-xs mb-1 font-mono" style={{ color: "oklch(0.45 0.04 215)" }}>{p.label}</p>
                          <div className="flex gap-1">
                            <input
                              type={showKeys[p.id] ? "text" : "password"}
                              value={settings.apiKeys[p.id] || ""}
                              onChange={(e) => setKey(p.id, e.target.value)}
                              placeholder={p.placeholder}
                              className="flex-1 text-xs px-3 py-2 rounded-xl outline-none font-mono"
                              style={{
                                background: "oklch(0.14 0.015 225)",
                                border: "1px solid oklch(0.22 0.03 220)",
                                color: "oklch(0.8 0.02 215)",
                              }}
                            />
                            <button
                              onClick={() => toggleShow(p.id)}
                              className="p-2 rounded-xl hover:opacity-70 transition-opacity"
                              style={{ color: "oklch(0.45 0.04 215)" }}
                            >
                              {showKeys[p.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                            {settings.apiKeys[p.id] && (
                              <button
                                onClick={() => setKey(p.id, "")}
                                className="p-2 rounded-xl hover:opacity-70 transition-opacity"
                                style={{ color: "oklch(0.55 0.18 25)" }}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {tab === "voice" && (
                <>
                  <div>
                    <label className="text-xs font-mono tracking-widest uppercase mb-2 block" style={{ color: "oklch(0.5 0.05 215)" }}>
                      Motor de voz (TTS)
                    </label>
                    <div className="flex flex-col gap-1.5">
                      {[
                        { id: "google", label: "Google Cloud TTS (Natural)", desc: "Neural2 pt-BR — requer API key" },
                        { id: "browser", label: "Navegador (Web Speech API)", desc: "Grátis, qualidade básica" },
                      ].map((v) => (
                        <button
                          key={v.id}
                          onClick={() => onChange({ ...settings, ttsProvider: v.id as "google" | "browser" })}
                          className="p-3 rounded-xl text-left transition-all"
                          style={{
                            background: settings.ttsProvider === v.id ? "oklch(0.72 0.18 210 / 0.1)" : "oklch(0.14 0.015 225)",
                            border: settings.ttsProvider === v.id ? "1px solid oklch(0.72 0.18 210 / 0.4)" : "1px solid oklch(0.22 0.03 220)",
                          }}
                        >
                          <p className="text-xs font-medium" style={{ color: settings.ttsProvider === v.id ? "oklch(0.78 0.15 210)" : "oklch(0.7 0.03 215)" }}>
                            {v.label}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "oklch(0.42 0.03 215)" }}>{v.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {settings.ttsProvider === "google" && (
                    <div>
                      <label className="text-xs font-mono tracking-widest uppercase mb-1.5 block" style={{ color: "oklch(0.5 0.05 215)" }}>
                        Google TTS API Key
                      </label>
                      <input
                        type="password"
                        value={settings.googleTTSKey}
                        onChange={(e) => onChange({ ...settings, googleTTSKey: e.target.value })}
                        placeholder="AIza..."
                        className="w-full text-xs px-3 py-2 rounded-xl outline-none font-mono"
                        style={{
                          background: "oklch(0.14 0.015 225)",
                          border: "1px solid oklch(0.22 0.03 220)",
                          color: "oklch(0.8 0.02 215)",
                        }}
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-mono tracking-widest uppercase mb-1.5 block" style={{ color: "oklch(0.5 0.05 215)" }}>
                      Microfone
                    </label>
                    <select
                      value={settings.micDeviceId}
                      onChange={(e) => onChange({ ...settings, micDeviceId: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl outline-none font-mono"
                      style={{
                        background: "oklch(0.14 0.015 225)",
                        border: "1px solid oklch(0.22 0.03 220)",
                        color: "oklch(0.8 0.02 215)",
                      }}
                    >
                      <option value="">Padrão do sistema</option>
                      {microphones.map((mic) => (
                        <option key={mic.deviceId} value={mic.deviceId}>
                          {mic.label || `Microfone ${mic.deviceId.slice(0, 8)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {tab === "prompt" && (
                <div>
                  <label className="text-xs font-mono tracking-widest uppercase mb-1.5 block" style={{ color: "oklch(0.5 0.05 215)" }}>
                    System Prompt
                  </label>
                  <textarea
                    value={settings.systemPrompt}
                    onChange={(e) => onChange({ ...settings, systemPrompt: e.target.value })}
                    rows={16}
                    className="w-full text-xs px-3 py-2.5 rounded-xl outline-none font-mono resize-none leading-relaxed"
                    style={{
                      background: "oklch(0.12 0.015 225)",
                      border: "1px solid oklch(0.22 0.03 220)",
                      color: "oklch(0.78 0.02 215)",
                    }}
                  />
                  <button
                    onClick={() => onChange({ ...settings, systemPrompt: DEFAULT_SYSTEM_PROMPT })}
                    className="mt-2 text-xs font-mono hover:opacity-70 transition-opacity"
                    style={{ color: "oklch(0.5 0.08 210)" }}
                  >
                    Restaurar padrão
                  </button>
                </div>
              )}

              {tab === "memory" && (
                <div className="flex flex-col gap-5">
                  {/* Projects */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-mono tracking-widest uppercase" style={{ color: "oklch(0.5 0.05 215)" }}>
                        Projetos
                      </label>
                      {onClearMemory && (
                        <button
                          onClick={onClearMemory}
                          className="text-xs font-mono hover:opacity-70 transition-opacity flex items-center gap-1"
                          style={{ color: "oklch(0.55 0.18 25)" }}
                        >
                          <Trash2 size={11} /> Limpar tudo
                        </button>
                      )}
                    </div>

                    {memoryStore?.projects.map((p, i) => (
                      <div
                        key={i}
                        className="mb-2 p-2.5 rounded-xl text-xs"
                        style={{
                          background: "oklch(0.14 0.015 225)",
                          border: "1px solid oklch(0.22 0.03 220)",
                        }}
                      >
                        <p className="font-medium mb-0.5" style={{ color: "oklch(0.78 0.12 210)" }}>{p.name}</p>
                        <p style={{ color: "oklch(0.55 0.04 215)" }}>{p.description}</p>
                        {p.tech.length > 0 && (
                          <p className="mt-1 font-mono" style={{ color: "oklch(0.45 0.04 215)" }}>
                            {p.tech.join(", ")}
                          </p>
                        )}
                      </div>
                    ))}

                    {/* Add project */}
                    <div
                      className="p-3 rounded-xl flex flex-col gap-2"
                      style={{ background: "oklch(0.12 0.01 225)", border: "1px solid oklch(0.2 0.03 215)" }}
                    >
                      <p className="text-xs font-mono" style={{ color: "oklch(0.42 0.04 215)" }}>Adicionar projeto</p>
                      {(["name", "description", "tech", "notes"] as const).map((field) => (
                        <input
                          key={field}
                          placeholder={field === "tech" ? "Tech (React, Python...)" : field === "notes" ? "Notas" : field === "name" ? "Nome" : "Descrição"}
                          value={(newProject[field] as string) ?? ""}
                          onChange={(e) => setNewProject((prev) => ({ ...prev, [field]: e.target.value }))}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg outline-none font-mono"
                          style={{
                            background: "oklch(0.14 0.015 225)",
                            border: "1px solid oklch(0.22 0.03 220)",
                            color: "oklch(0.8 0.02 215)",
                          }}
                        />
                      ))}
                      <button
                        onClick={() => {
                          if (!newProject.name) return
                          onUpsertProject?.({
                            name: newProject.name ?? "",
                            description: newProject.description ?? "",
                            tech: (newProject.tech ?? "").split(",").map((t) => t.trim()).filter(Boolean),
                            notes: newProject.notes ?? "",
                            lastUpdated: new Date().toISOString(),
                          })
                          setNewProject({})
                        }}
                        className="text-xs py-1.5 rounded-lg font-mono transition-all hover:opacity-80 flex items-center justify-center gap-1"
                        style={{
                          background: "oklch(0.72 0.18 210 / 0.15)",
                          color: "oklch(0.72 0.18 210)",
                          border: "1px solid oklch(0.72 0.18 210 / 0.3)",
                        }}
                      >
                        <Plus size={11} /> Adicionar
                      </button>
                    </div>
                  </div>

                  {/* Persistent notes */}
                  <div>
                    <label className="text-xs font-mono tracking-widest uppercase mb-1.5 block" style={{ color: "oklch(0.5 0.05 215)" }}>
                      Notas permanentes
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      onBlur={() => onUpdateNotes?.(notes)}
                      rows={6}
                      placeholder="Preferências, contexto pessoal, informações fixas..."
                      className="w-full text-xs px-3 py-2.5 rounded-xl outline-none font-mono resize-none leading-relaxed"
                      style={{
                        background: "oklch(0.12 0.015 225)",
                        border: "1px solid oklch(0.22 0.03 220)",
                        color: "oklch(0.78 0.02 215)",
                      }}
                    />
                  </div>

                  {/* Daily memory summary */}
                  <div>
                    <label className="text-xs font-mono tracking-widest uppercase mb-2 block" style={{ color: "oklch(0.5 0.05 215)" }}>
                      Histórico diário
                    </label>
                    {memoryStore?.dailyMemories.slice(0, 5).map((d) => (
                      <div
                        key={d.date}
                        className="mb-1.5 p-2 rounded-lg text-xs"
                        style={{
                          background: "oklch(0.14 0.015 225)",
                          border: "1px solid oklch(0.2 0.03 215)",
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-mono" style={{ color: "oklch(0.55 0.06 215)" }}>{d.date}</span>
                          <span style={{ color: "oklch(0.4 0.04 215)" }}>{d.entries.length} msgs</span>
                        </div>
                        {d.summary && (
                          <p className="mt-1" style={{ color: "oklch(0.6 0.03 215)" }}>{d.summary}</p>
                        )}
                      </div>
                    ))}
                    {!memoryStore?.dailyMemories.length && (
                      <p className="text-xs font-mono" style={{ color: "oklch(0.35 0.04 215)" }}>
                        Nenhum histórico ainda.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

export { DEFAULT_SYSTEM_PROMPT }
