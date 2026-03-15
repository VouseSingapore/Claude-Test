import { describe, it, expect } from 'vitest'
import { buildHistoryPayload, mergeVars, processAIResponse } from '../../src/chat/pipeline'
import type { ChatContext } from '../../src/types'

const ctx: ChatContext = { charName: 'Aria', userName: 'Kael', characterId: 100001 }

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — buildHistoryPayload
// Verify that the messages array is sliced and ordered correctly before being
// sent to the API.  When sendMessage runs, messages = [...history, userMsg,
// assistantStub(empty)].  We must send [...history, userMsg] — the stub is dropped.
// ─────────────────────────────────────────────────────────────────────────────

describe('buildHistoryPayload — message order and context', () => {
  it('returns empty array when only the empty assistant stub is present', () => {
    const messages = [{ role: 'assistant', content: '' }]
    expect(buildHistoryPayload(messages)).toEqual([])
  })

  it('includes the current user message when it is the second-to-last item', () => {
    // Represents: user just typed, stub not yet filled
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: '' },  // stub
    ]
    const payload = buildHistoryPayload(messages)
    expect(payload).toHaveLength(1)
    expect(payload[0]).toEqual({ role: 'user', content: 'Hello' })
  })

  it('does NOT include the empty assistant stub as last message', () => {
    const messages = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: '' },
    ]
    const payload = buildHistoryPayload(messages)
    expect(payload.at(-1)?.role).toBe('user')
    expect(payload.at(-1)?.content).toBe('Hi')
  })

  it('preserves chronological order across multiple turns', () => {
    const messages = [
      { role: 'user',      content: 'turn 1' },
      { role: 'assistant', content: 'turn 2' },
      { role: 'user',      content: 'turn 3' },
      { role: 'assistant', content: 'turn 4' },
      { role: 'user',      content: 'turn 5 (current)' },
      { role: 'assistant', content: '' },  // stub
    ]
    const payload = buildHistoryPayload(messages)
    expect(payload).toHaveLength(5)
    expect(payload.map(m => m.content)).toEqual([
      'turn 1', 'turn 2', 'turn 3', 'turn 4', 'turn 5 (current)'
    ])
  })

  it('preserves the correct role sequence (user/assistant alternation)', () => {
    const messages = [
      { role: 'user',      content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user',      content: 'c' },
      { role: 'assistant', content: '' },
    ]
    const payload = buildHistoryPayload(messages)
    expect(payload.map(m => m.role)).toEqual(['user', 'assistant', 'user'])
  })

  it('strips extra fields — only role and content are forwarded', () => {
    const messages = [
      { role: 'user', content: 'hi', id: 'abc', timestamp: 999 } as any,
      { role: 'assistant', content: '' },
    ]
    const [item] = buildHistoryPayload(messages)
    expect(Object.keys(item)).toEqual(['role', 'content'])
  })

  it('current user message is always the last item in the payload', () => {
    const messages = [
      { role: 'user',      content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user',      content: 'current' },
      { role: 'assistant', content: '' },
    ]
    const payload = buildHistoryPayload(messages)
    expect(payload.at(-1)).toEqual({ role: 'user', content: 'current' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — mergeVars
// Priority: manualOverrides > runtimeVars (for system prompt assembly)
// ─────────────────────────────────────────────────────────────────────────────

describe('mergeVars — variable priority', () => {
  it('returns runtimeVars when there are no manual overrides', () => {
    expect(mergeVars({ mood: 'happy' }, {})).toEqual({ mood: 'happy' })
  })

  it('manual override wins over runtime var for the same key', () => {
    const result = mergeVars({ mood: 'happy' }, { mood: 'sad' })
    expect(result.mood).toBe('sad')
  })

  it('keeps runtime var when manual override is for a different key', () => {
    const result = mergeVars({ mood: 'happy' }, { tone: 'formal' })
    expect(result.mood).toBe('happy')
    expect(result.tone).toBe('formal')
  })

  it('returns empty object when both inputs are empty', () => {
    expect(mergeVars({}, {})).toEqual({})
  })

  it('does not mutate the input objects', () => {
    const runtime = { a: '1' }
    const manual  = { a: '2' }
    mergeVars(runtime, manual)
    expect(runtime.a).toBe('1')
    expect(manual.a).toBe('2')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — processAIResponse
// Variable extraction, text cleaning, and newlySetKeys detection
// ─────────────────────────────────────────────────────────────────────────────

describe('processAIResponse — variable extraction from AI messages', () => {
  it('strips setvar macro from cleaned text', () => {
    const { cleaned } = processAIResponse('{{setvar::mood::happy}}Hello!', {}, ctx)
    expect(cleaned).toBe('Hello!')
  })

  it('adds the set key to newlySetKeys', () => {
    const { newlySetKeys } = processAIResponse('{{setvar::mood::happy}}', {}, ctx)
    expect(newlySetKeys.has('mood')).toBe(true)
  })

  it('sets the variable in updatedVars', () => {
    const { updatedVars } = processAIResponse('{{setvar::mood::happy}}', {}, ctx)
    expect(updatedVars.mood).toBe('happy')
  })

  it('extracts multiple setvar macros in one response', () => {
    const raw = '{{setvar::mood::happy}}{{setvar::pace::slow}}Story...'
    const { cleaned, updatedVars, newlySetKeys } = processAIResponse(raw, {}, ctx)
    expect(cleaned).toBe('Story...')
    expect(updatedVars.mood).toBe('happy')
    expect(updatedVars.pace).toBe('slow')
    expect(newlySetKeys).toEqual(new Set(['mood', 'pace']))
  })

  it('returns empty newlySetKeys when there are no setvar macros', () => {
    const { newlySetKeys } = processAIResponse('Just prose, no macros.', {}, ctx)
    expect(newlySetKeys.size).toBe(0)
  })

  it('pre-seeded runtimeVars are available for {{getvar}} expansion', () => {
    const { cleaned } = processAIResponse(
      'Feeling {{getvar::mood}} today.',
      { mood: 'joyful' },
      ctx
    )
    expect(cleaned).toBe('Feeling joyful today.')
  })

  it('expands {{char}} and {{user}} using context', () => {
    const { cleaned } = processAIResponse('{{char}} greets {{user}}.', {}, ctx)
    expect(cleaned).toBe('Aria greets Kael.')
  })

  it('pre-existing runtimeVars not mentioned in setvar are preserved in updatedVars', () => {
    const { updatedVars } = processAIResponse(
      '{{setvar::mood::happy}}',
      { pace: 'fast' },
      ctx
    )
    expect(updatedVars.pace).toBe('fast')
    expect(updatedVars.mood).toBe('happy')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — Variable override lifecycle (full pipeline simulation)
// Demonstrates the interaction between runtimeVars, manualOverrides, and AI updates.
// ─────────────────────────────────────────────────────────────────────────────

describe('Variable override lifecycle', () => {
  it('AI response sets a variable into runtimeVars', () => {
    const runtimeVars: Record<string, string> = {}
    const { updatedVars } = processAIResponse('{{setvar::mood::happy}}', runtimeVars, ctx)
    Object.assign(runtimeVars, updatedVars)
    expect(runtimeVars.mood).toBe('happy')
  })

  it('user manual override wins over runtimeVar in merged output', () => {
    const runtimeVars   = { mood: 'happy' }
    const manualOverrides = { mood: 'sad' }
    expect(mergeVars(runtimeVars, manualOverrides).mood).toBe('sad')
  })

  it('AI later response clears the manual override for the updated key', () => {
    const runtimeVars: Record<string, string>   = {}
    const manualOverrides: Record<string, string> = {}

    // Step 1: AI sets variable
    const r1 = processAIResponse('{{setvar::mood::happy}}', runtimeVars, ctx)
    Object.assign(runtimeVars, r1.updatedVars)
    expect(runtimeVars.mood).toBe('happy')

    // Step 2: User overrides it
    manualOverrides.mood = 'sad'
    expect(mergeVars(runtimeVars, manualOverrides).mood).toBe('sad')

    // Step 3: AI sets the same key again in a later response
    const r2 = processAIResponse('{{setvar::mood::angry}}Growl!', runtimeVars, ctx)
    Object.assign(runtimeVars, r2.updatedVars)
    for (const key of r2.newlySetKeys) delete manualOverrides[key]  // <-- pipeline clears it

    // AI value wins — manual override no longer exists
    expect(runtimeVars.mood).toBe('angry')
    expect('mood' in manualOverrides).toBe(false)
    expect(mergeVars(runtimeVars, manualOverrides).mood).toBe('angry')
  })

  it('AI response with no setvar leaves the manual override intact', () => {
    const runtimeVars   = { mood: 'happy' }
    const manualOverrides = { mood: 'sad' }

    const r = processAIResponse('Just prose, no macros.', runtimeVars, ctx)
    Object.assign(runtimeVars, r.updatedVars)
    for (const key of r.newlySetKeys) delete manualOverrides[key]  // nothing to clear

    // Manual override unchanged
    expect(manualOverrides.mood).toBe('sad')
    expect(mergeVars(runtimeVars, manualOverrides).mood).toBe('sad')
  })

  it('AI clearing one variable does not affect manual overrides for other variables', () => {
    const runtimeVars: Record<string, string>   = {}
    const manualOverrides: Record<string, string> = { mood: 'sad', tone: 'formal' }

    // AI only updates 'mood'
    const r = processAIResponse('{{setvar::mood::angry}}', runtimeVars, ctx)
    Object.assign(runtimeVars, r.updatedVars)
    for (const key of r.newlySetKeys) delete manualOverrides[key]

    // 'tone' override is untouched
    expect('mood' in manualOverrides).toBe(false)
    expect(manualOverrides.tone).toBe('formal')
  })

  it('variable set by AI in response 1 is available via getvar in response 2', () => {
    const runtimeVars: Record<string, string> = {}

    // Response 1: AI sets 'location'
    const r1 = processAIResponse('{{setvar::location::forest}}', runtimeVars, ctx)
    Object.assign(runtimeVars, r1.updatedVars)

    // Response 2: AI references it via getvar
    const r2 = processAIResponse('You are in the {{getvar::location}}.', runtimeVars, ctx)
    expect(r2.cleaned).toBe('You are in the forest.')
  })
})
