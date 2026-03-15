import { loadPresetFromUrl } from './preset/loader'
import { assembleSystemPrompt, extractToggleGroups } from './preset/assembler'
import type { PromptSegment } from './preset/assembler'
import { compileScripts, postProcess } from './preset/regex-processor'
import { VariableEngine } from './preset/variables'
import { streamChat } from './api/client'
import type { Message, ChatContext, Provider } from './types'

interface DebugEntry {
  id: string
  timestamp: number
  provider: string
  model: string
  systemSegments: PromptSegment[]
  history: Array<{ role: string; content: string }>
  userMessage: string
}

// ── State ─────────────────────────────────────────────────────────────────────

let messages: Message[] = []
let isStreaming = false
let abortController: AbortController | null = null

const context: ChatContext = {
  charName: 'Character',
  userName: 'Player',
  characterId: 100001
}

let provider: Provider = 'mock'
let model = 'mock'
const runtimeVars: Record<string, string> = {}    // set by {{setvar}} in AI output
const manualOverrides: Record<string, string> = {} // set by user in Variables panel
const debugHistory: DebugEntry[] = []

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
const varList = document.getElementById('var-list')!
const btnVarsCollapse = document.getElementById('btn-vars-collapse')!
const btnDebug = document.getElementById('btn-debug')!
const debugDrawer = document.getElementById('debug-drawer')!
const btnCloseDebug = document.getElementById('btn-close-debug')!
const debugContent = document.getElementById('debug-content')!

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
    renderVariablePanel()
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

// ── Variable panel ────────────────────────────────────────────────────────

let varsCollapsed = false

function renderVariablePanel() {
  const effectiveOverrides = { ...runtimeVars, ...manualOverrides }
  const { variables: allVars } = assembleSystemPrompt(
    preset, blockMap, context.characterId, context, effectiveOverrides
  )
  const { variables: baseline } = assembleSystemPrompt(
    preset, blockMap, context.characterId, context
  )

  // runtimeVars fills keys absent from preset; allVars (with overrides applied) wins
  const entries = Object.entries({ ...runtimeVars, ...allVars })

  varList.innerHTML = ''

  if (entries.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'var-empty'
    empty.textContent = 'No variables set'
    varList.appendChild(empty)
    return
  }

  if (Object.keys(manualOverrides).length > 0) {
    const resetAll = document.createElement('button')
    resetAll.className = 'var-reset-all'
    resetAll.textContent = '↺ Reset all overrides'
    resetAll.addEventListener('click', () => {
      for (const k of Object.keys(manualOverrides)) delete manualOverrides[k]
      renderVariablePanel()
    })
    varList.appendChild(resetAll)
  }

  for (const [key, value] of entries) {
    const isManual = key in manualOverrides
    const isRuntime = !isManual && key in runtimeVars
    const rowClass = isManual ? ' overridden' : isRuntime ? ' runtime' : ''
    const row = document.createElement('div')
    row.className = 'var-row' + rowClass

    const keyEl = document.createElement('span')
    keyEl.className = 'var-key'
    keyEl.textContent = key
    keyEl.title = key

    const badge = document.createElement('span')
    badge.className = 'var-badge'
    badge.textContent = isManual ? 'user' : isRuntime ? 'AI' : 'preset'

    const valueEl = document.createElement('span')
    valueEl.className = 'var-value'
    valueEl.textContent = value
    valueEl.title = 'Click to edit'

    valueEl.addEventListener('click', () => {
      const input = document.createElement('input')
      input.className = 'var-input'
      input.value = value
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur()
        if (e.key === 'Escape') { input.replaceWith(valueEl); return }
      })
      input.addEventListener('blur', () => {
        const newVal = input.value.trim()
        const presetVal = baseline[key] ?? runtimeVars[key] ?? ''
        if (newVal && newVal !== presetVal) {
          manualOverrides[key] = newVal
        } else {
          delete manualOverrides[key]
        }
        renderVariablePanel()
      })
      valueEl.replaceWith(input)
      input.focus()
      input.select()
    })

    row.appendChild(keyEl)
    row.appendChild(badge)
    row.appendChild(valueEl)

    if (isManual || isRuntime) {
      const resetBtn = document.createElement('button')
      resetBtn.className = 'var-reset-btn'
      resetBtn.textContent = '↺'
      resetBtn.title = isManual
        ? `Reset to ${key in runtimeVars ? 'AI value' : 'preset value'}: "${runtimeVars[key] ?? baseline[key]}"`
        : `Clear AI value for "${key}"`
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (isManual) delete manualOverrides[key]
        else delete runtimeVars[key]
        renderVariablePanel()
      })
      row.appendChild(resetBtn)
    }

    varList.appendChild(row)
  }
}

btnVarsCollapse.addEventListener('click', () => {
  varsCollapsed = !varsCollapsed
  varList.classList.toggle('collapsed', varsCollapsed)
  btnVarsCollapse.textContent = varsCollapsed ? '▸' : '▾'
})

renderVariablePanel()

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
  mock: ['mock'],
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
  mock: '',
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
  if (p === 'mock') {
    populateModelSelect(FALLBACK_MODELS.mock)
    return
  }
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

  // Build system prompt: runtimeVars from AI output merged with user overrides
  // (manualOverrides win over runtimeVars, both win over preset {{setvar}})
  const { system, segments: systemSegments } = assembleSystemPrompt(
    preset, blockMap, context.characterId, context,
    { ...runtimeVars, ...manualOverrides }
  )

  // Capture debug context (keep last 5)
  const historySnapshot = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
  debugHistory.unshift({
    id: crypto.randomUUID(), timestamp: Date.now(),
    provider, model, systemSegments,
    history: historySnapshot.slice(0, -1),
    userMessage: text
  })
  if (debugHistory.length > 5) debugHistory.pop()

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
    // Process the completed response through VariableEngine to:
    // 1. Extract any {{setvar::...}} macros the AI emitted → update runtimeVars
    // 2. Strip those macros (and expand {{getvar}}/{{char}}) from displayed text
    if (assistantMsg.raw) {
      const engine = new VariableEngine(context)
      // Pre-seed with current runtime state so {{getvar}} in the response resolves
      for (const [k, v] of Object.entries(runtimeVars)) engine.set(k, v)
      const cleaned = engine.process(assistantMsg.raw)
      // Merge newly set variables into runtimeVars
      Object.assign(runtimeVars, engine.getAll())
      // Re-run regex post-processing on the cleaned text
      assistantMsg.content = postProcess(cleaned, compiledScripts)
      bodyEl.textContent = assistantMsg.content
      renderVariablePanel()
    }

    assistantEl.classList.remove('streaming')
    isStreaming = false
    btnSend.disabled = false
    abortController = null
  }
}

// ── Debug panel ───────────────────────────────────────────────────────────────

function tok(text: string) { return Math.ceil(text.length / 4) }

function renderDebugPanel() {
  debugContent.innerHTML = ''

  if (debugHistory.length === 0) {
    debugContent.innerHTML = '<p class="debug-empty">No requests yet. Send a message first.</p>'
    return
  }

  for (const entry of debugHistory) {
    const systemTotal = entry.systemSegments.reduce((s, seg) => s + tok(seg.content), 0)
    const histTotal   = entry.history.reduce((s, m) => s + tok(m.content), 0)
    const userTok     = tok(entry.userMessage)
    const grandTotal  = systemTotal + histTotal + userTok

    const card = document.createElement('details')
    card.className = 'debug-card'

    const summary = document.createElement('summary')
    summary.className = 'debug-summary'
    summary.innerHTML = `
      <span class="debug-meta">${new Date(entry.timestamp).toLocaleTimeString()} · ${entry.provider}/${entry.model}</span>
      <span class="debug-total">~${grandTotal.toLocaleString()} tok</span>`
    card.appendChild(summary)

    // ── System prompt segments ────────────────────────────────────────
    const { section: sysSection, body: sysList } = mkSection('System Prompt', `~${systemTotal.toLocaleString()} tok`)
    for (const seg of entry.systemSegments) {
      const row = document.createElement('div')
      row.className = 'debug-seg-row'
      row.innerHTML = `<span class="debug-seg-name">${seg.name}</span><span class="debug-seg-tok">~${tok(seg.content)} tok</span>`
      row.title = seg.content
      const preview = document.createElement('div')
      preview.className = 'debug-seg-preview'
      preview.textContent = seg.content.slice(0, 120) + (seg.content.length > 120 ? '…' : '')
      row.appendChild(preview)
      sysList.appendChild(row)
    }
    card.appendChild(sysSection)

    // ── History messages ──────────────────────────────────────────────
    if (entry.history.length > 0) {
      const { section: histSection, body: histList } = mkSection(`History (${entry.history.length} msg)`, `~${histTotal.toLocaleString()} tok`)
      for (const m of entry.history) {
        const row = document.createElement('div')
        row.className = 'debug-seg-row'
        row.innerHTML = `<span class="debug-seg-name debug-role-${m.role}">${m.role}</span><span class="debug-seg-tok">~${tok(m.content)} tok</span>`
        const preview = document.createElement('div')
        preview.className = 'debug-seg-preview'
        preview.textContent = m.content.slice(0, 100) + (m.content.length > 100 ? '…' : '')
        row.appendChild(preview)
        histList.appendChild(row)
      }
      card.appendChild(histSection)
    }

    // ── Current user message ──────────────────────────────────────────
    const { section: userSection, body: userList } = mkSection('User Message', `~${userTok} tok`)
    const userRow = document.createElement('div')
    userRow.className = 'debug-seg-row'
    userRow.innerHTML = `<span class="debug-seg-name debug-role-user">user</span><span class="debug-seg-tok">~${userTok} tok</span>`
    const userPreview = document.createElement('div')
    userPreview.className = 'debug-seg-preview'
    userPreview.textContent = entry.userMessage.slice(0, 100) + (entry.userMessage.length > 100 ? '…' : '')
    userRow.appendChild(userPreview)
    userList.appendChild(userRow)
    card.appendChild(userSection)

    debugContent.appendChild(card)
  }
}

function mkSection(title: string, tokLabel: string): { section: HTMLElement; body: HTMLElement } {
  const section = document.createElement('div')
  section.className = 'debug-section'
  const h = document.createElement('div')
  h.className = 'debug-section-hdr'
  h.innerHTML = `<span>${title}</span><span class="debug-seg-tok">${tokLabel}</span>`
  section.appendChild(h)
  const body = document.createElement('div')
  body.className = 'debug-section-body'
  section.appendChild(body)
  return { section, body }
}

btnDebug.addEventListener('click', () => {
  renderDebugPanel()
  debugDrawer.hidden = false
})
btnCloseDebug.addEventListener('click', () => { debugDrawer.hidden = true })

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
