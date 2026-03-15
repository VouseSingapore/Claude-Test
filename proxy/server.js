import express from 'express'
import cors from 'cors'
import { streamClaude } from './claude.js'
import { streamOpenAI } from './openai.js'
import { streamGemini } from './gemini.js'
import { streamOpenRouter } from './openrouter.js'
import { streamMock } from './mock.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

const PORT = process.env.PORT ?? 3001

app.post('/api/chat', async (req, res) => {
  const { provider, ...opts } = req.body

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const sendChunk = (delta, done) => {
    res.write(`data: ${JSON.stringify({ delta, done })}\n\n`)
  }

  try {
    if (provider === 'claude') {
      await streamClaude(opts, sendChunk)
    } else if (provider === 'openai') {
      await streamOpenAI(opts, sendChunk)
    } else if (provider === 'gemini') {
      await streamGemini(opts, sendChunk)
    } else if (provider === 'openrouter') {
      await streamOpenRouter(opts, sendChunk)
    } else if (provider === 'mock') {
      await streamMock(opts, sendChunk)
    } else {
      res.status(400).end(`Unknown provider: ${provider}`)
      return
    }
    res.write('data: [DONE]\n\n')
  } catch (err) {
    console.error('[proxy error]', err)
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
  } finally {
    res.end()
  }
})

app.get('/api/models', async (req, res) => {
  const { provider, apiKey } = req.query
  if (!apiKey) return res.status(400).json({ error: 'apiKey required' })

  try {
    let models = []

    if (provider === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      })
      if (!r.ok) throw new Error(`Anthropic ${r.status}`)
      const data = await r.json()
      models = data.data.map(m => m.id).filter(id => id.startsWith('claude-'))

    } else if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      if (!r.ok) throw new Error(`OpenAI ${r.status}`)
      const data = await r.json()
      models = data.data
        .map(m => m.id)
        .filter(id => id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3'))
        .sort()

    } else if (provider === 'gemini') {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
      )
      if (!r.ok) throw new Error(`Gemini ${r.status}`)
      const data = await r.json()
      models = data.models
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace('models/', ''))
        .filter(id => id.startsWith('gemini-'))
        .sort()

    } else if (provider === 'openrouter') {
      const r = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      if (!r.ok) throw new Error(`OpenRouter ${r.status}`)
      const data = await r.json()
      models = data.data.map(m => m.id).sort()

    } else {
      return res.status(400).json({ error: `Unknown provider: ${provider}` })
    }

    res.json({ models })
  } catch (err) {
    console.error('[models error]', err)
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => console.log(`Proxy running on http://localhost:${PORT}`))
