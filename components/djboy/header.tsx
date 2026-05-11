"use client"

import { motion } from "framer-motion"
import { Settings, Trash2 } from "lucide-react"

interface HeaderProps {
  online: boolean
  onSettings: () => void
  onClear: () => void
}

export function Header({ online, onSettings, onClear }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-3">
        <motion.div
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="w-2 h-2 rounded-full"
          style={{
            background: online ? "oklch(0.75 0.2 142)" : "oklch(0.6 0.2 25)",
            boxShadow: online
              ? "0 0 8px oklch(0.75 0.2 142 / 0.6)"
              : "0 0 8px oklch(0.6 0.2 25 / 0.6)",
          }}
        />
        <span
          className="text-xs font-mono tracking-widest uppercase"
          style={{ color: online ? "oklch(0.65 0.15 142)" : "oklch(0.55 0.15 25)" }}
        >
          {online ? "Online" : "Offline"}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <span
          className="text-xs font-mono tracking-[0.2em] uppercase"
          style={{ color: "oklch(0.45 0.04 215)" }}
        >
          DJ Boy
        </span>
        <span
          className="text-xs font-mono"
          style={{ color: "oklch(0.3 0.03 215)" }}
        >
          &nbsp;/&nbsp;v1
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onClear}
          className="p-2 rounded-xl transition-all hover:opacity-70"
          style={{ color: "oklch(0.45 0.04 215)" }}
          title="Limpar conversa"
        >
          <Trash2 size={15} />
        </button>
        <button
          onClick={onSettings}
          className="p-2 rounded-xl transition-all hover:opacity-70"
          style={{ color: "oklch(0.55 0.06 215)" }}
          title="Configurações"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  )
}
