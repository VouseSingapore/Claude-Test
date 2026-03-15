const CLAUDE_API = 'https://api.anthropic.com/v1/messages'

/**
 * @param {object} opts
 * @param {string} opts.model
 * @param {string} opts.system
 * @param {Array<{role: string, content: string}>} opts.messages
 * @param {number} opts.temperature
 * @param {number} opts.max_tokens
 * @param {(delta: string, done: boolean) => void} sendChunk
 */
export async function streamClaude(opts, sendChunk) {
  const { model, system, messages, temperature, max_tokens, apiKey } = opts

  if (!apiKey) throw new Error('No Anthropic API key. Open Settings (⚙) to add your key.')

  const res = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model ?? 'claude-sonnet-4-6',
      system,
      messages,
      temperature: temperature ?? 1,
      max_tokens: max_tokens ?? 8192,
      stream: true
    })
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Claude API ${res.status}: ${body}`)
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
      try {
        const event = JSON.parse(data)
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          sendChunk(event.delta.text, false)
        }
      } catch {
        // Skip malformed events
      }
    }
  }
}
