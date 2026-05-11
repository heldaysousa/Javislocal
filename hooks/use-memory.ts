"use client"

import { useCallback, useEffect, useRef } from "react"

export interface MemoryEntry {
  timestamp: string
  role: "user" | "assistant"
  content: string
}

export interface DailyMemory {
  date: string
  summary: string
  entries: MemoryEntry[]
}

export interface ProjectContext {
  name: string
  description: string
  tech: string[]
  lastUpdated: string
  notes: string
}

export interface MemoryStore {
  projects: ProjectContext[]
  dailyMemories: DailyMemory[]
  persistentNotes: string
  lastUpdated: string
}

const STORAGE_KEY = "djboy_memory"
const TODAY = () => new Date().toISOString().split("T")[0]

function defaultStore(): MemoryStore {
  return {
    projects: [],
    dailyMemories: [],
    persistentNotes: "",
    lastUpdated: new Date().toISOString(),
  }
}

function load(): MemoryStore {
  if (typeof window === "undefined") return defaultStore()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : defaultStore()
  } catch {
    return defaultStore()
  }
}

function save(store: MemoryStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Storage full
  }
}

export function useMemory() {
  const storeRef = useRef<MemoryStore>(defaultStore())

  useEffect(() => {
    storeRef.current = load()
  }, [])

  const addEntry = useCallback((role: "user" | "assistant", content: string) => {
    const store = storeRef.current
    const today = TODAY()
    const entry: MemoryEntry = {
      timestamp: new Date().toISOString(),
      role,
      content,
    }

    let dayMemory = store.dailyMemories.find((d) => d.date === today)
    if (!dayMemory) {
      dayMemory = { date: today, summary: "", entries: [] }
      store.dailyMemories.push(dayMemory)
    }

    dayMemory.entries.push(entry)

    // Keep only last 30 days
    store.dailyMemories = store.dailyMemories
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30)

    store.lastUpdated = new Date().toISOString()
    storeRef.current = store
    save(store)
  }, [])

  const buildContextBlock = useCallback((): string => {
    const store = storeRef.current
    const today = TODAY()
    const parts: string[] = []

    // Projects context
    if (store.projects.length > 0) {
      parts.push("## Projetos ativos")
      for (const p of store.projects) {
        parts.push(
          `- **${p.name}**: ${p.description} | Tech: ${p.tech.join(", ")}${p.notes ? ` | ${p.notes}` : ""}`
        )
      }
    }

    // Persistent notes
    if (store.persistentNotes) {
      parts.push("## Notas permanentes")
      parts.push(store.persistentNotes)
    }

    // Today's conversation so far (last 10 entries)
    const todayMem = store.dailyMemories.find((d) => d.date === today)
    if (todayMem && todayMem.entries.length > 0) {
      const recent = todayMem.entries.slice(-10)
      parts.push("## Conversa de hoje (recente)")
      for (const e of recent) {
        parts.push(`${e.role === "user" ? "Você" : "DJ Boy"}: ${e.content.slice(0, 200)}`)
      }
    }

    // Yesterday summary if exists
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yDate = yesterday.toISOString().split("T")[0]
    const yMem = store.dailyMemories.find((d) => d.date === yDate)
    if (yMem?.summary) {
      parts.push("## Resumo de ontem")
      parts.push(yMem.summary)
    }

    return parts.join("\n")
  }, [])

  const upsertProject = useCallback((project: ProjectContext) => {
    const store = storeRef.current
    const idx = store.projects.findIndex((p) => p.name === project.name)
    if (idx >= 0) {
      store.projects[idx] = project
    } else {
      store.projects.push(project)
    }
    store.lastUpdated = new Date().toISOString()
    storeRef.current = store
    save(store)
  }, [])

  const updateNotes = useCallback((notes: string) => {
    const store = storeRef.current
    store.persistentNotes = notes
    store.lastUpdated = new Date().toISOString()
    storeRef.current = store
    save(store)
  }, [])

  const updateDailySummary = useCallback((date: string, summary: string) => {
    const store = storeRef.current
    const day = store.dailyMemories.find((d) => d.date === date)
    if (day) day.summary = summary
    storeRef.current = store
    save(store)
  }, [])

  const getStore = useCallback(() => storeRef.current, [])

  return {
    addEntry,
    buildContextBlock,
    upsertProject,
    updateNotes,
    updateDailySummary,
    getStore,
  }
}
