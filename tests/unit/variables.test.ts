import { describe, it, expect, beforeEach } from 'vitest'
import { VariableEngine } from '../../src/preset/variables'

const ctx = { charName: 'Aria', userName: 'Kael', characterId: 100001 }

describe('VariableEngine', () => {
  let engine: VariableEngine

  beforeEach(() => { engine = new VariableEngine(ctx) })

  // ── setvar / getvar ────────────────────────────────────────────────────────

  it('sets a variable and retrieves it', () => {
    engine.set('role', 'roleplayer')
    expect(engine.get('role')).toBe('roleplayer')
  })

  it('returns empty string for unknown variable', () => {
    expect(engine.get('nonexistent')).toBe('')
  })

  it('processes {{setvar}} macro and strips it from output', () => {
    const result = engine.process('{{setvar::prompt::an excellent writer}}hello')
    expect(result).toBe('hello')
    expect(engine.get('prompt')).toBe('an excellent writer')
  })

  it('processes {{getvar}} macro', () => {
    engine.set('prompt', 'a game master')
    const result = engine.process('You are {{getvar::prompt}}!')
    expect(result).toBe('You are a game master!')
  })

  it('getvar returns empty string when variable is unset', () => {
    const result = engine.process('Role: {{getvar::missing}}.')
    expect(result).toBe('Role: .')
  })

  // ── Character tokens ───────────────────────────────────────────────────────

  it('substitutes {{char}} with charName', () => {
    expect(engine.process('Hello {{char}}!')).toBe('Hello Aria!')
  })

  it('substitutes {{user}} with userName', () => {
    expect(engine.process('{{user}} enters the room.')).toBe('Kael enters the room.')
  })

  it('substitutes both {{char}} and {{user}} in same string', () => {
    const result = engine.process('{{char}} greets {{user}}.')
    expect(result).toBe('Aria greets Kael.')
  })

  // ── Comments ───────────────────────────────────────────────────────────────

  it('strips comment macros {{// ...}}', () => {
    const result = engine.process('{{// This is a comment.}}Hello')
    expect(result).toBe('Hello')
  })

  // ── {{trim}} ───────────────────────────────────────────────────────────────

  it('trims trailing content after {{trim}}', () => {
    const result = engine.process('keep this{{trim}}   \n  ')
    expect(result).toBe('keep this')
  })

  it('handles {{trim}} with setvar pattern', () => {
    const result = engine.process('{{setvar::x::val}}{{trim}}   \n')
    expect(result).toBe('')
    expect(engine.get('x')).toBe('val')
  })

  // ── Dice rolls ─────────────────────────────────────────────────────────────

  it('rolls dice within the valid range', () => {
    for (let i = 0; i < 50; i++) {
      const result = engine.process('{{roll::2d10}}')
      const num = parseInt(result, 10)
      expect(num).toBeGreaterThanOrEqual(2)
      expect(num).toBeLessThanOrEqual(20)
    }
  })

  it('rolls 1d1 deterministically', () => {
    expect(engine.process('{{roll::1d1}}')).toBe('1')
  })

  it('handles invalid dice expression gracefully', () => {
    expect(engine.process('{{roll::bad}}')).toBe('0')
  })

  // ── reset ──────────────────────────────────────────────────────────────────

  it('resets the variable store', () => {
    engine.set('key', 'value')
    engine.reset()
    expect(engine.get('key')).toBe('')
  })

  // ── Chained setvar/getvar ──────────────────────────────────────────────────

  it('setvar fires before getvar in same string', () => {
    const result = engine.process('{{setvar::mood::joyful}}Feeling {{getvar::mood}}.')
    expect(result).toBe('Feeling joyful.')
  })

  // ── Multiple substitutions ─────────────────────────────────────────────────

  it('substitutes multiple occurrences of the same macro', () => {
    engine.set('name', 'Aria')
    const result = engine.process('{{getvar::name}} is {{getvar::name}}.')
    expect(result).toBe('Aria is Aria.')
  })
})
