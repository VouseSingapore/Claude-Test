const API_KEY = process.env.GEMINI_API_KEY ?? ''
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * @param {object} opts
 * @param {string} opts.model
 * @param {string} opts.system
 * @param {Array<{role: string, content: string}>} opts.messages
 * @param {number} opts.temperature
 * @param {number} opts.max_tokens
 * @param {(delta: string, done: boolean) => void} sendChunk
 */
export async function streamGemini(opts, sendChunk) {
  const { model, system, messages, temperature, max_tokens } = opts

  // Gemini uses 'model' role instead of 'assistant'
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))

  const body = {
    contents,
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    generationConfig: {
      temperature: temperature ?? 1,
      maxOutputTokens: max_tokens ?? 8192
    }
  }

  const modelId = model ?? 'gemini-2.0-flash'
  const url = `${BASE_URL}/models/${modelId}:streamGenerateContent?alt=sse&key=${API_KEY}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini API ${res.status}: ${text}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const event = JSON.parse(data)
        const text = event.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) sendChunk(text, false)
      } catch {
        // Skip malformed events
      }
    }
  }
}
