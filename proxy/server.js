import express from 'express'
import cors from 'cors'
import { streamClaude } from './claude.js'
import { streamOpenAI } from './openai.js'

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

app.listen(PORT, () => console.log(`Proxy running on http://localhost:${PORT}`))
