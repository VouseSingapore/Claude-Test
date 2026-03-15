import type { ChatRequest, StreamChunk } from '../types'

const KEY_MAP: Record<string, string> = {
  claude: 'claude_key',
  openai: 'openai_key',
  gemini: 'gemini_key',
  openrouter: 'openrouter_key'
}

/**
 * Sends a chat request to the local proxy and yields streamed text chunks.
 * API keys are read from localStorage and forwarded to the proxy.
 */
export async function* streamChat(
  request: ChatRequest,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const storageKey = KEY_MAP[request.provider]
  const apiKey = storageKey ? (localStorage.getItem(storageKey) ?? '') : ''

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, apiKey }),
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
        const parsed = JSON.parse(data) as { delta?: string; done?: boolean; error?: string }
        if (parsed.error) throw new Error(parsed.error)
        yield parsed as StreamChunk
      } catch (e) {
        if (e instanceof Error && e.message !== 'Malformed JSON') throw e
        // Skip malformed chunks
      }
    }
  }

  yield { delta: '', done: true }
}
