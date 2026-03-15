import { loadPresetFromUrl } from './preset/loader'
import { assembleSystemPrompt, extractToggleGroups } from './preset/assembler'
import { compileScripts, postProcess } from './preset/regex-processor'
import { streamChat } from './api/client'
import type { Message, ChatContext, Provider } from './types'

// ── State ─────────────────────────────────────────────────────────────────────

let messages: Message[] = []
let isStreaming = false
let abortController: AbortController | null = null

const context: ChatContext = {
  charName: 'Character',
  userName: 'Player',
  characterId: 100001
}

let provider: Provider = 'claude'
let model = 'claude-sonnet-4-6'

// ── DOM refs ──────────────────────────────────────────────────────────────────

const messageList = document.getElementById('message-list')!
const userInput = document.getElementById('user-input') as HTMLTextAreaElement
const btnSend = document.getElementById('btn-send') as HTMLButtonElement
const btnSidebar = document.getElementById('btn-sidebar')!
const btnSettings = document.getElementById('btn-settings')!
const btnCloseSettings = document.getElementById('btn-close-settings')!
const btnSaveKeys = document.getElementById('btn-save-keys')!
const sidebar = document.getElementById('sidebar')!
const settingsDrawer = document.getElementById('settings-drawer')!
const drawerBackdrop = document.getElementById('drawer-backdrop')!
const selectProvider = document.getElementById('select-provider') as HTMLSelectElement
const selectModel = document.getElementById('select-model') as HTMLSelectElement
const headerCharName = document.getElementById('header-char-name')!
const toggleGroupsEl = document.getElementById('toggle-groups')!

// ── Preset ────────────────────────────────────────────────────────────────────

const { preset, blockMap } = await loadPresetFromUrl('/Preset/Purpose_v50.json')
const compiledScripts = compileScripts(preset.extensions.regex_scripts)
const toggleGroups = extractToggleGroups(preset)

// Track which toggle option is active per group
const activeToggles = new Map<string, string>()

// ── Render toggle groups ──────────────────────────────────────────────────────

for (const group of toggleGroups) {
  if (group.options.length === 0) continue

  const wrapper = document.createElement('div')
  wrapper.className = 'toggle-group'

  const label = document.createElement('label')
  label.textContent = group.name

  const select = document.createElement('select')
  select.className = 'select'

  for (const opt of group.options) {
    const option = document.createElement('option')
    option.value = opt.id
    option.textContent = opt.label
    select.appendChild(option)
  }

  // Default: first option active
  activeToggles.set(group.id, group.options[0]?.id ?? '')

  select.addEventListener('change', () => {
    activeToggles.set(group.id, select.value)
    syncTogglesToPreset()
  })

  wrapper.appendChild(label)
  wrapper.appendChild(select)
  toggleGroupsEl.appendChild(wrapper)
}

function syncTogglesToPreset() {
  // Enable/disable blocks in the preset's prompt_order based on active toggles
  const allOptionIds = new Set(toggleGroups.flatMap(g => g.options.map(o => o.id)))
  const activeIds = new Set(activeToggles.values())

  const charOrder = preset.prompt_order.find(p => p.character_id === context.characterId)
  if (!charOrder) return

  for (const entry of charOrder.order) {
    if (allOptionIds.has(entry.identifier)) {
      entry.enabled = activeIds.has(entry.identifier)
    }
  }
}

syncTogglesToPreset()

// ── Character list ────────────────────────────────────────────────────────────

const charList = document.getElementById('character-list')!
const characters = [
  { id: 100001, name: 'Default Character' }
]

for (const char of characters) {
  const btn = document.createElement('button')
  btn.className = 'char-btn' + (char.id === context.characterId ? ' active' : '')
  btn.textContent = char.name
  btn.addEventListener('click', () => {
    context.characterId = char.id
    context.charName = char.name
    headerCharName.textContent = char.name
    charList.querySelectorAll('.char-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
  })
  charList.appendChild(btn)
}

// ── Provider / model ──────────────────────────────────────────────────────────

const FALLBACK_MODELS: Record<Provider, string[]> = {
  claude: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  gemini: ['gemini-2.0-flash', 'gemini-2.0-flash-lite'],
  openrouter: [
    'mistralai/mistral-nemo',
    'meta-llama/llama-3.3-70b-instruct',
    'deepseek/deepseek-r1'
  ]
}

const KEY_STORAGE: Record<Provider, string> = {
  claude: 'claude_key',
  openai: 'openai_key',
  gemini: 'gemini_key',
  openrouter: 'openrouter_key'
}

function populateModelSelect(models: string[]) {
  selectModel.innerHTML = ''
  for (const m of models) {
    const opt = document.createElement('option')
    opt.value = m
    opt.textContent = m
    selectModel.appendChild(opt)
  }
  model = models[0] ?? ''
}

async function refreshModels(p: Provider) {
  const apiKey = localStorage.getItem(KEY_STORAGE[p]) ?? ''
  if (!apiKey) {
    populateModelSelect(FALLBACK_MODELS[p])
    return
  }
  try {
    selectModel.disabled = true
    selectModel.innerHTML = '<option>Loading…</option>'
    const res = await fetch(`/api/models?provider=${p}&apiKey=${encodeURIComponent(apiKey)}`)
    const data = await res.json()
    if (data.models?.length) {
      populateModelSelect(data.models)
    } else {
      populateModelSelect(FALLBACK_MODELS[p])
    }
  } catch {
    populateModelSelect(FALLBACK_MODELS[p])
  } finally {
    selectModel.disabled = false
    model = selectModel.value
  }
}

selectProvider.addEventListener('change', () => {
  provider = selectProvider.value as Provider
  refreshModels(provider)
})

selectModel.addEventListener('change', () => {
  model = selectModel.value
})

refreshModels(provider)

// ── Chat ──────────────────────────────────────────────────────────────────────

function renderMessage(msg: Message, streaming = false): HTMLElement {
  const el = document.createElement('div')
  el.className = `message ${msg.role}` + (streaming ? ' streaming' : '')
  el.dataset.id = msg.id

  if (msg.role === 'assistant') {
    const label = document.createElement('div')
    label.className = 'char-label'
    label.textContent = context.charName
    el.appendChild(label)
  }

  const body = document.createElement('div')
  body.className = 'message-body'
  body.textContent = msg.content
  el.appendChild(body)

  return el
}

function scrollToBottom() {
  messageList.scrollTop = messageList.scrollHeight
}

async function sendMessage() {
  const text = userInput.value.trim()
  if (!text || isStreaming) return

  userInput.value = ''
  userInput.style.height = 'auto'

  const userMsg: Message = {
    id: crypto.randomUUID(),
    role: 'user',
    content: text,
    timestamp: Date.now()
  }
  messages.push(userMsg)
  messageList.appendChild(renderMessage(userMsg))
  scrollToBottom()

  // Build system prompt
  const { system } = assembleSystemPrompt(preset, blockMap, context.characterId, context)

  // Start streaming response
  isStreaming = true
  btnSend.disabled = true

  const assistantMsg: Message = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: '',
    timestamp: Date.now()
  }
  messages.push(assistantMsg)
  const assistantEl = renderMessage(assistantMsg, true)
  messageList.appendChild(assistantEl)
  const bodyEl = assistantEl.querySelector('.message-body')!
  scrollToBottom()

  abortController = new AbortController()

  try {
    for await (const chunk of streamChat({
      provider,
      model,
      system,
      messages: messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
      temperature: preset.temperature,
      max_tokens: preset.openai_max_tokens,
      stream: true
    }, abortController.signal)) {
      if (chunk.done) break
      assistantMsg.raw = (assistantMsg.raw ?? '') + chunk.delta
      assistantMsg.content = postProcess(assistantMsg.raw, compiledScripts)
      bodyEl.textContent = assistantMsg.content
      scrollToBottom()
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name !== 'AbortError') {
      bodyEl.textContent = `[Error: ${err.message}]`
    }
  } finally {
    assistantEl.classList.remove('streaming')
    isStreaming = false
    btnSend.disabled = false
    abortController = null
  }
}

// ── Input events ──────────────────────────────────────────────────────────────

btnSend.addEventListener('click', sendMessage)

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
})

// Auto-resize textarea
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto'
  userInput.style.height = Math.min(userInput.scrollHeight, 140) + 'px'
})

// ── Sidebar toggle (mobile) ───────────────────────────────────────────────────

btnSidebar.addEventListener('click', () => sidebar.classList.toggle('open'))

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
  if (window.innerWidth < 768 && sidebar.classList.contains('open')) {
    if (!sidebar.contains(e.target as Node) && e.target !== btnSidebar) {
      sidebar.classList.remove('open')
    }
  }
})

// ── Settings drawer ───────────────────────────────────────────────────────────

btnSettings.addEventListener('click', () => {
  // Populate inputs from saved keys
  ;(document.getElementById('input-claude-key') as HTMLInputElement).value = localStorage.getItem('claude_key') ?? ''
  ;(document.getElementById('input-openai-key') as HTMLInputElement).value = localStorage.getItem('openai_key') ?? ''
  ;(document.getElementById('input-gemini-key') as HTMLInputElement).value = localStorage.getItem('gemini_key') ?? ''
  ;(document.getElementById('input-openrouter-key') as HTMLInputElement).value = localStorage.getItem('openrouter_key') ?? ''
  settingsDrawer.hidden = false
  drawerBackdrop.hidden = false
})

const closeSettings = () => {
  settingsDrawer.hidden = true
  drawerBackdrop.hidden = true
}

btnCloseSettings.addEventListener('click', closeSettings)
drawerBackdrop.addEventListener('click', closeSettings)

btnSaveKeys.addEventListener('click', () => {
  const claudeKey = (document.getElementById('input-claude-key') as HTMLInputElement).value
  const openaiKey = (document.getElementById('input-openai-key') as HTMLInputElement).value
  const geminiKey = (document.getElementById('input-gemini-key') as HTMLInputElement).value
  const openrouterKey = (document.getElementById('input-openrouter-key') as HTMLInputElement).value
  if (claudeKey) localStorage.setItem('claude_key', claudeKey)
  if (openaiKey) localStorage.setItem('openai_key', openaiKey)
  if (geminiKey) localStorage.setItem('gemini_key', geminiKey)
  if (openrouterKey) localStorage.setItem('openrouter_key', openrouterKey)
  btnSaveKeys.textContent = 'Saved ✓'
  setTimeout(() => {
    btnSaveKeys.textContent = 'Save Keys'
    closeSettings()
    refreshModels(provider)
  }, 800)
})
