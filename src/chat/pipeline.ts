import { VariableEngine } from '../preset/variables'
import type { ChatContext } from '../types'

/**
 * Build the messages array to send to the API.
 *
 * When `sendMessage` runs, the messages array contains:
 *   [...previous turns, currentUserMsg, emptyAssistantStub]
 *
 * slice(0, -1) drops the empty stub, so the API receives:
 *   [...previous turns, currentUserMsg]  (chronological, oldest first)
 */
export function buildHistoryPayload(
  messages: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  return messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
}

/**
 * Merge variable sources for system prompt assembly.
 * manualOverrides take priority over runtimeVars.
 * Both win over preset-default {{setvar}} values (handled inside assembleSystemPrompt).
 */
export function mergeVars(
  runtimeVars: Record<string, string>,
  manualOverrides: Record<string, string>
): Record<string, string> {
  return { ...runtimeVars, ...manualOverrides }
}

export interface ProcessedResponse {
  /** Cleaned text: setvar macros stripped, getvar/char/user expanded */
  cleaned: string
  /** Full variable store after processing */
  updatedVars: Record<string, string>
  /**
   * Keys explicitly set by {{setvar}} in this response.
   * The caller should delete these from manualOverrides so AI values are not
   * permanently overridden by stale user edits.
   */
  newlySetKeys: Set<string>
}

/**
 * Process a completed AI response through VariableEngine:
 *  1. Pre-seed the engine with current runtimeVars so {{getvar}} resolves correctly
 *  2. Run engine.process() — fires {{setvar}}, strips them, expands {{getvar}}/{{char}}/{{user}}
 *  3. Return cleaned text, all resulting variables, and the set of keys the AI set
 */
export function processAIResponse(
  rawText: string,
  runtimeVars: Record<string, string>,
  context: ChatContext
): ProcessedResponse {
  const engine = new VariableEngine(context)
  for (const [k, v] of Object.entries(runtimeVars)) engine.set(k, v)
  const cleaned = engine.process(rawText)
  const updatedVars = { ...engine.getAll() } as Record<string, string>

  // Identify which keys the AI explicitly set via {{setvar::key::...}}
  const newlySetKeys = new Set<string>()
  const pattern = /\{\{setvar::([a-zA-Z0-9_]+)::/g
  let m: RegExpExecArray | null
  while ((m = pattern.exec(rawText)) !== null) {
    newlySetKeys.add(m[1])
  }

  return { cleaned, updatedVars, newlySetKeys }
}
