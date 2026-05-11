import { GoogleGenerativeAI } from "@google/generative-ai"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { messages, systemPrompt, apiKey } = await req.json()

    const key = apiKey || process.env.GEMINI_API_KEY
    if (!key) {
      return NextResponse.json({ error: "API key não configurada" }, { status: 401 })
    }

    const genAI = new GoogleGenerativeAI(key)
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction:
        systemPrompt ||
        "Você é DJ Boy, assistente pessoal de alto nível. Seja direto e conciso.",
    })

    const msgs = (messages as { role: string; content: string }[])
    if (!msgs || msgs.length === 0) {
      return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 })
    }
    const history = msgs.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }))
    const last = msgs[msgs.length - 1]
    if (!last?.content) {
      return NextResponse.json({ error: "Última mensagem vazia" }, { status: 400 })
    }
    const chat = model.startChat({ history })
    const result = await chat.sendMessage(last.content)

    return NextResponse.json({ response: result.response.text() })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro interno"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
