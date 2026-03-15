import { describe, it, expect } from 'vitest'
import { parsePreset, buildBlockMap, loadPresetFromObject } from '../../src/preset/loader'

const minimalPreset = {
  temperature: 1,
  frequency_penalty: 0,
  presence_penalty: 0,
  top_p: 1,
  openai_max_tokens: 8192,
  stream_openai: true,
  assistant_prefill: '',
  use_sysprompt: true,
  squash_system_messages: true,
  reasoning_effort: 'high',
  show_thoughts: true,
  prompts: [
    { identifier: 'main', name: '| Prompt', system_prompt: true, role: 'system', content: 'Hello' },
    { identifier: 'chatHistory', name: 'Chat History', system_prompt: true, marker: true }
  ],
  prompt_order: [
    { character_id: 0, order: [{ identifier: 'main', enabled: true }] }
  ],
  extensions: { regex_scripts: [] }
}

describe('parsePreset', () => {
  it('accepts a valid preset object', () => {
    expect(() => parsePreset(minimalPreset)).not.toThrow()
  })

  it('throws on null input', () => {
    expect(() => parsePreset(null)).toThrow('Preset must be a JSON object')
  })

  it('throws when prompts is missing', () => {
    expect(() => parsePreset({ prompt_order: [] })).toThrow('missing "prompts"')
  })

  it('throws when prompt_order is missing', () => {
    expect(() => parsePreset({ prompts: [] })).toThrow('missing "prompt_order"')
  })
})

describe('buildBlockMap', () => {
  it('maps all block identifiers', () => {
    const preset = parsePreset(minimalPreset)
    const map = buildBlockMap(preset)
    expect(map.has('main')).toBe(true)
    expect(map.has('chatHistory')).toBe(true)
    expect(map.size).toBe(2)
  })

  it('retrieves correct block by identifier', () => {
    const preset = parsePreset(minimalPreset)
    const map = buildBlockMap(preset)
    expect(map.get('main')?.content).toBe('Hello')
  })
})

describe('loadPresetFromObject', () => {
  it('returns preset and blockMap', () => {
    const { preset, blockMap } = loadPresetFromObject(minimalPreset)
    expect(preset.temperature).toBe(1)
    expect(blockMap.has('main')).toBe(true)
  })
})
