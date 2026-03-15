const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions'
const API_KEY = process.env.OPENROUTER_API_KEY ?? ''

/**
 * OpenRouter uses an OpenAI-compatible API, so this is a thin wrapper.
 *
 * @param {object} opts
 * @param {string} opts.model
 * @param {string} opts.system
 * @param {Array<{role: string, content: string}>} opts.messages
 * @param {number} opts.temperature
 * @param {number} opts.max_tokens
 * @param {(delta: string, done: boolean) => void} sendChunk
 */
export async function streamOpenRouter(opts, sendChunk) {
  const { model, system, messages, temperature, max_tokens, apiKey } = opts

  const allMessages = [
    { role: 'system', content: system },
    ...messages
  ]

  const res = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey || API_KEY}`,
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'Purpose Chat'
    },
    body: JSON.stringify({
      model: model ?? 'mistralai/mistral-nemo',
      messages: allMessages,
      temperature: temperature ?? 1,
      max_tokens: max_tokens ?? 8192,
      stream: true
    })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter API ${res.status}: ${text}`)
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
        const delta = event.choices?.[0]?.delta?.content
        if (delta) sendChunk(delta, false)
      } catch {
        // Skip malformed events
      }
    }
  }
}
