import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { loadPresetFromObject } from '../../src/preset/loader'
import { assembleSystemPrompt, extractToggleGroups } from '../../src/preset/assembler'
import { compileScripts, postProcess } from '../../src/preset/regex-processor'

// Load the real preset from disk
const presetJson = JSON.parse(
  readFileSync(resolve(__dirname, '../../Preset/Purpose_v50.json'), 'utf-8')
)

const { preset, blockMap } = loadPresetFromObject(presetJson)
const compiledScripts = compileScripts(preset.extensions.regex_scripts)

const ctx = { charName: 'Aria', userName: 'Kael', characterId: 100001 }

describe('Full preset pipeline (Purpose_v50)', () => {

  it('loads without errors', () => {
    expect(preset.prompts.length).toBeGreaterThan(0)
    expect(preset.prompt_order.length).toBeGreaterThan(0)
  })

  it('builds a non-empty system prompt for character 100001', () => {
    const { system } = assembleSystemPrompt(preset, blockMap, 100001, ctx)
    expect(system.length).toBeGreaterThan(100)
  })

  it('substitutes {{char}} in the assembled system prompt', () => {
    const { system } = assembleSystemPrompt(preset, blockMap, 100001, ctx)
    // char name should appear, raw macro should not
    expect(system).not.toContain('{{char}}')
  })

  it('substitutes {{user}} in the assembled system prompt', () => {
    const { system } = assembleSystemPrompt(preset, blockMap, 100001, ctx)
    expect(system).not.toContain('{{user}}')
  })

  it('resolves {{getvar}} references (no unresolved macros in output)', () => {
    const { system } = assembleSystemPrompt(preset, blockMap, 100001, ctx)
    expect(system).not.toMatch(/\{\{getvar::[^}]+\}\}/)
  })

  it('contains world logic instructions', () => {
    const { system } = assembleSystemPrompt(preset, blockMap, 100001, ctx)
    expect(system.toLowerCase()).toContain('instruct')
  })

  it('extracts toggle groups from Section A', () => {
    const groups = extractToggleGroups(preset)
    expect(groups.length).toBeGreaterThanOrEqual(4)
    const groupNames = groups.map(g => g.name.toLowerCase())
    expect(groupNames.some(n => n.includes('role') || n.includes('tense') || n.includes('length'))).toBe(true)
  })

  it('each toggle group has at least 2 options', () => {
    const groups = extractToggleGroups(preset)
    for (const group of groups) {
      expect(group.options.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('strips deduction blocks from output', () => {
    const raw = '---DEDUCTION---\nIntent: flee\nPlan: character runs\n---END DEDUCTION---\nShe bolts for the door.'
    expect(postProcess(raw, compiledScripts)).toBe('She bolts for the door.')
  })

  it('strips all three block types in a combined response', () => {
    const raw = [
      '---DEDUCTION---\nthinking\n---END DEDUCTION---',
      '---AUDIT---\nchecking\n---END AUDIT---',
      '<!-- PAGE_UPDATE_START -->\ndata\n<!-- PAGE_UPDATE_END -->',
      'Final visible prose.'
    ].join('\n')
    expect(postProcess(raw, compiledScripts)).toBe('Final visible prose.')
  })

  it('throws for unknown character ID', () => {
    expect(() => assembleSystemPrompt(preset, blockMap, 99999, ctx)).toThrow()
  })

  it('compiled scripts list matches non-disabled scripts in preset', () => {
    const enabled = preset.extensions.regex_scripts.filter(s => !s.disabled)
    expect(compiledScripts).toHaveLength(enabled.length)
  })
})
