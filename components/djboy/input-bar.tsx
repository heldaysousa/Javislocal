"use client"

import { useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Paperclip, Link, Send, X, Image as ImageIcon, FileText } from "lucide-react"
import type { Message } from "./chat-messages"

interface Attachment {
  name: string
  type: "image" | "file" | "link"
}

interface InputBarProps {
  onSend: (content: string, attachments?: Message["attachments"]) => void
  disabled?: boolean
}

export function InputBar({ onSend, disabled }: InputBarProps) {
  const [text, setText] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkValue, setLinkValue] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed && attachments.length === 0) return
    onSend(trimmed, attachments.length > 0 ? attachments : undefined)
    setText("")
    setAttachments([])
    setShowLinkInput(false)
    setLinkValue("")
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    const mapped: Attachment[] = files.map((f) => ({
      name: f.name,
      type: f.type.startsWith("image/") ? "image" : "file",
    }))
    setAttachments((prev) => [...prev, ...mapped])
    e.target.value = ""
  }

  function addLink() {
    if (!linkValue.trim()) return
    setAttachments((prev) => [...prev, { name: linkValue.trim(), type: "link" }])
    setLinkValue("")
    setShowLinkInput(false)
  }

  function removeAttachment(i: number) {
    setAttachments((prev) => prev.filter((_, idx) => idx !== i))
  }

  return (
    <div className="px-4 pb-4 pt-2">
      <AnimatePresence>
        {showLinkInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2 flex gap-2"
          >
            <input
              autoFocus
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLink()}
              placeholder="Cole um URL..."
              className="flex-1 text-sm px-3 py-2 rounded-xl outline-none font-mono"
              style={{
                background: "oklch(0.14 0.015 225)",
                border: "1px solid oklch(0.28 0.04 215)",
                color: "oklch(0.85 0.03 215)",
              }}
            />
            <button
              onClick={addLink}
              className="px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
              style={{
                background: "oklch(0.72 0.18 210 / 0.2)",
                color: "oklch(0.72 0.18 210)",
                border: "1px solid oklch(0.72 0.18 210 / 0.3)",
              }}
            >
              Adicionar
            </button>
            <button
              onClick={() => setShowLinkInput(false)}
              className="px-2 py-2 rounded-xl transition-opacity hover:opacity-80"
              style={{ color: "oklch(0.5 0.04 215)" }}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-mono"
              style={{
                background: "oklch(0.72 0.18 210 / 0.1)",
                border: "1px solid oklch(0.72 0.18 210 / 0.25)",
                color: "oklch(0.72 0.18 210)",
              }}
            >
              {att.type === "image" ? (
                <ImageIcon size={10} />
              ) : att.type === "link" ? (
                <Link size={10} />
              ) : (
                <FileText size={10} />
              )}
              <span className="max-w-[120px] truncate">{att.name}</span>
              <button onClick={() => removeAttachment(i)} className="hover:opacity-60 transition-opacity">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className="flex items-end gap-2 rounded-2xl px-3 py-2"
        style={{
          background: "oklch(0.13 0.015 225 / 0.9)",
          border: "1px solid oklch(0.28 0.04 215 / 0.8)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="flex gap-1 pb-1">
          <button
            onClick={() => fileRef.current?.click()}
            className="p-1.5 rounded-xl transition-all hover:opacity-80"
            style={{ color: "oklch(0.55 0.06 215)" }}
            title="Enviar arquivo ou imagem"
          >
            <Paperclip size={16} />
          </button>
          <button
            onClick={() => setShowLinkInput((v) => !v)}
            className="p-1.5 rounded-xl transition-all hover:opacity-80"
            style={{
              color: showLinkInput ? "oklch(0.72 0.18 210)" : "oklch(0.55 0.06 215)",
            }}
            title="Enviar link"
          >
            <Link size={16} />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Digite ou fale para o DJ Boy..."
          rows={1}
          className="flex-1 resize-none bg-transparent outline-none text-sm leading-relaxed py-1 font-sans"
          style={{
            color: "oklch(0.88 0.02 215)",
            maxHeight: "120px",
          }}
        />

        <button
          onClick={handleSend}
          disabled={disabled || (!text.trim() && attachments.length === 0)}
          className="p-2 rounded-xl transition-all hover:opacity-80 disabled:opacity-30"
          style={{
            background: "oklch(0.72 0.18 210 / 0.2)",
            color: "oklch(0.72 0.18 210)",
            border: "1px solid oklch(0.72 0.18 210 / 0.3)",
          }}
        >
          <Send size={15} />
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.json,.csv"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}
