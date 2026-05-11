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

    const history = (messages as { role: string; content: string }[])
      .slice(0, -1)
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }))

    const chat = model.startChat({ history })
    const last = messages[messages.length - 1] as { role: string; content: string }
    const result = await chat.sendMessage(last.content)

    return NextResponse.json({ response: result.response.text() })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro interno"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
