import { describe, it, expect } from 'vitest'
import { parseSillyTavernRegex, compileScripts, postProcess } from '../../src/preset/regex-processor'
import type { RegexScript } from '../../src/types'

// ── parseSillyTavernRegex ─────────────────────────────────────────────────────

describe('parseSillyTavernRegex', () => {
  it('parses a /pattern/flags string', () => {
    const re = parseSillyTavernRegex('/hello/i')
    expect(re.test('HELLO')).toBe(true)
  })

  it('parses a multiline flag pattern', () => {
    const re = parseSillyTavernRegex('/foo/gm')
    expect(re.flags).toContain('g')
    expect(re.flags).toContain('m')
  })

  it('falls back to literal match for non-slash strings', () => {
    const re = parseSillyTavernRegex('hello.world')
    expect(re.test('hello.world')).toBe(true)
    expect(re.test('helloxworld')).toBe(false)
  })

  it('parses the deduction block regex from Purpose_v50', () => {
    const re = parseSillyTavernRegex('/---DEDUCTION---[\\s\\S]*?---END DEDUCTION---/gs')
    const text = 'before\n---DEDUCTION---\nsome reasoning\n---END DEDUCTION---\nafter'
    expect(re.test(text)).toBe(true)
  })
})

// ── compileScripts ────────────────────────────────────────────────────────────

describe('compileScripts', () => {
  const scripts: RegexScript[] = [
    {
      scriptName: 'Strip Deduction Block',
      findRegex: '/---DEDUCTION---[\\s\\S]*?---END DEDUCTION---/gs',
      replaceString: '',
      trimStrings: [], placement: [2], disabled: false,
      markdownOnly: false, promptOnly: false, runOnEdit: true,
      substituteRegex: false, minDepth: null, maxDepth: null
    },
    {
      scriptName: 'Disabled Script',
      findRegex: '/should-not-run/g',
      replaceString: '',
      trimStrings: [], placement: [2], disabled: true,
      markdownOnly: false, promptOnly: false, runOnEdit: false,
      substituteRegex: false, minDepth: null, maxDepth: null
    }
  ]

  it('compiles only enabled scripts', () => {
    const compiled = compileScripts(scripts)
    expect(compiled).toHaveLength(1)
    expect(compiled[0].name).toBe('Strip Deduction Block')
  })
})

// ── postProcess ───────────────────────────────────────────────────────────────

describe('postProcess', () => {
  const scripts: RegexScript[] = [
    {
      scriptName: 'Strip Deduction Block',
      findRegex: '/---DEDUCTION---[\\s\\S]*?---END DEDUCTION---/gs',
      replaceString: '',
      trimStrings: [], placement: [2], disabled: false,
      markdownOnly: false, promptOnly: false, runOnEdit: true,
      substituteRegex: false, minDepth: null, maxDepth: null
    },
    {
      scriptName: 'Strip Audit Block',
      findRegex: '/---AUDIT---[\\s\\S]*?---END AUDIT---/gs',
      replaceString: '',
      trimStrings: [], placement: [2], disabled: false,
      markdownOnly: false, promptOnly: false, runOnEdit: true,
      substituteRegex: false, minDepth: null, maxDepth: null
    },
    {
      scriptName: 'Strip Page Update Block',
      findRegex: '/<!-- PAGE_UPDATE_START -->[\\s\\S]*?<!-- PAGE_UPDATE_END -->/gs',
      replaceString: '',
      trimStrings: [], placement: [2], disabled: false,
      markdownOnly: false, promptOnly: false, runOnEdit: true,
      substituteRegex: false, minDepth: null, maxDepth: null
    }
  ]

  const compiled = compileScripts(scripts)

  it('strips a deduction block', () => {
    const input = '---DEDUCTION---\nIntent: attack\n---END DEDUCTION---\nThe sword swings.'
    expect(postProcess(input, compiled)).toBe('The sword swings.')
  })

  it('strips an audit block', () => {
    const input = '---AUDIT---\nsome audit\n---END AUDIT---\nProse here.'
    expect(postProcess(input, compiled)).toBe('Prose here.')
  })

  it('strips a page update block', () => {
    const input = '<!-- PAGE_UPDATE_START -->\ndata\n<!-- PAGE_UPDATE_END -->\nFinal prose.'
    expect(postProcess(input, compiled)).toBe('Final prose.')
  })

  it('strips multiple blocks in one response', () => {
    const input = [
      '---DEDUCTION---\nplanning\n---END DEDUCTION---',
      'Aria steps forward.',
      '---AUDIT---\nchecking\n---END AUDIT---',
    ].join('\n')
    expect(postProcess(input, compiled)).toBe('Aria steps forward.')
  })

  it('returns text unchanged when no blocks present', () => {
    const input = 'Pure prose. No hidden blocks.'
    expect(postProcess(input, compiled)).toBe(input)
  })

  it('returns empty string from a response that is only a deduction block', () => {
    const input = '---DEDUCTION---\nonly reasoning\n---END DEDUCTION---'
    expect(postProcess(input, compiled)).toBe('')
  })
})
