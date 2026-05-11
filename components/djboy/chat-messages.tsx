"use client"

import { useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  attachments?: { name: string; type: "image" | "file" | "link" }[]
}

interface ChatMessagesProps {
  messages: Message[]
}

export function ChatMessages({ messages }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 select-none">
        <p
          className="text-sm tracking-widest uppercase font-mono"
          style={{ color: "oklch(0.35 0.04 215)" }}
        >
          Diga &quot;DJ Boy&quot; para iniciar
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3 scrollbar-hide">
      <AnimatePresence initial={false}>
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[78%] rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "rounded-br-sm"
                  : "rounded-bl-sm"
              }`}
              style={{
                background:
                  msg.role === "user"
                    ? "oklch(0.22 0.04 215 / 0.9)"
                    : "oklch(0.14 0.02 225 / 0.8)",
                border:
                  msg.role === "user"
                    ? "1px solid oklch(0.72 0.18 210 / 0.3)"
                    : "1px solid oklch(0.28 0.03 220 / 0.6)",
                backdropFilter: "blur(12px)",
              }}
            >
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {msg.attachments.map((att, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-0.5 rounded-full font-mono"
                      style={{
                        background: "oklch(0.72 0.18 210 / 0.15)",
                        color: "oklch(0.72 0.18 210)",
                        border: "1px solid oklch(0.72 0.18 210 / 0.2)",
                      }}
                    >
                      {att.type === "link" ? "@ " : att.type === "image" ? "img: " : "file: "}
                      {att.name}
                    </span>
                  ))}
                </div>
              )}
              <p
                className="text-sm leading-relaxed"
                style={{
                  color:
                    msg.role === "user"
                      ? "oklch(0.92 0.02 215)"
                      : "oklch(0.85 0.03 215)",
                }}
              >
                {msg.content}
              </p>
              <p
                className="text-xs mt-1.5 font-mono"
                style={{ color: "oklch(0.4 0.03 215)" }}
              >
                {msg.timestamp.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  )
}
