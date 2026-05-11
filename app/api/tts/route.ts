import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { text, apiKey } = await req.json()
    if (!text?.trim()) {
      return NextResponse.json({ error: "Texto vazio" }, { status: 400 })
    }

    const key = apiKey || process.env.GEMINI_API_KEY
    if (!key) {
      return NextResponse.json({ error: "API key não configurada" }, { status: 401 })
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            response_modalities: ["AUDIO"],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: { voice_name: "Kore" },
              },
            },
          },
        }),
      },
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
      return NextResponse.json(
        { error: err.error?.message || `HTTP ${res.status}` },
        { status: res.status },
      )
    }

    const data = await res.json() as {
      candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[]
    }
    const audioB64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
    if (!audioB64) {
      return NextResponse.json({ error: "Sem áudio na resposta Gemini TTS" }, { status: 500 })
    }

    const audioBuf = Buffer.from(audioB64, "base64")
    return new NextResponse(audioBuf, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuf.length),
      },
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro interno" },
      { status: 500 },
    )
  }
}
