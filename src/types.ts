// ─── Preset ──────────────────────────────────────────────────────────────────

export interface PresetBlock {
  identifier: string
  name: string
  system_prompt?: boolean
  marker?: boolean
  enabled?: boolean
  role?: 'system' | 'user' | 'assistant'
  content?: string
  injection_position?: number
  injection_depth?: number
  forbid_overrides?: boolean
  injection_order?: number
  injection_trigger?: string[]
}

export interface PromptOrderEntry {
  identifier: string
  enabled: boolean
}

export interface CharacterPromptOrder {
  character_id: number
  order: PromptOrderEntry[]
}

export interface RegexScript {
  scriptName: string
  findRegex: string
  replaceString: string
  trimStrings: string[]
  placement: number[]
  disabled: boolean
  markdownOnly: boolean
  promptOnly: boolean
  runOnEdit: boolean
  substituteRegex: boolean
  minDepth: number | null
  maxDepth: number | null
}

export interface Preset {
  temperature: number
  frequency_penalty: number
  presence_penalty: number
  top_p: number
  openai_max_tokens: number
  stream_openai: boolean
  assistant_prefill: string
  use_sysprompt: boolean
  squash_system_messages: boolean
  reasoning_effort: string
  show_thoughts: boolean
  prompts: PresetBlock[]
  prompt_order: CharacterPromptOrder[]
  extensions: {
    regex_scripts: RegexScript[]
  }
}

// ─── Runtime Context ──────────────────────────────────────────────────────────

export interface ChatContext {
  charName: string
  userName: string
  characterId: number
}

export interface VariableStore {
  [key: string]: string
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export type Role = 'user' | 'assistant' | 'system'

export interface Message {
  id: string
  role: Role
  content: string
  timestamp: number
  raw?: string  // pre-processed content (before regex stripping)
}

// ─── API ──────────────────────────────────────────────────────────────────────

export type Provider = 'claude' | 'openai'

export interface ApiConfig {
  provider: Provider
  model: string
  apiKey?: string  // only needed if not using proxy
}

export interface ChatRequest {
  provider: Provider
  model: string
  system: string
  messages: Array<{ role: Role; content: string }>
  temperature: number
  max_tokens: number
  stream: boolean
}

export interface StreamChunk {
  delta: string
  done: boolean
}

// ─── App State ────────────────────────────────────────────────────────────────

export interface AppState {
  preset: Preset | null
  context: ChatContext
  messages: Message[]
  apiConfig: ApiConfig
  isStreaming: boolean
  activeToggles: Record<string, string>  // groupId → selectedBlockId
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

export interface EvalRubric {
  name: string
  criteria: EvalCriterion[]
}

export interface EvalCriterion {
  name: string
  description: string
  weight: number  // 0–1, must sum to 1 across criteria
}

export interface EvalResult {
  rubric: string
  scores: Record<string, number>  // criterion name → 0–10
  weighted: number                // final weighted score
  rationale: Record<string, string>
  passed: boolean                 // weighted >= threshold
}

export interface EvalCase {
  name: string
  systemPrompt: string
  messages: Array<{ role: Role; content: string }>
  response: string
  rubric: EvalRubric
  threshold: number
}
