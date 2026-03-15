import type { ChatRequest, StreamChunk } from '../types'

/**
 * Sends a chat request to the local proxy and yields streamed text chunks.
 * The proxy handles all API keys and provider-specific formatting.
 */
export async function* streamChat(
  request: ChatRequest,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`API error ${res.status}: ${error}`)
  }

  if (!res.body) throw new Error('No response body')

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
      if (data === '[DONE]') {
        yield { delta: '', done: true }
        return
      }
      try {
        const parsed = JSON.parse(data) as { delta: string; done: boolean }
        yield parsed
      } catch {
        // Malformed chunk — skip
      }
    }
  }

  yield { delta: '', done: true }
}
