import type { Preset, PresetBlock } from '../types'

export interface LoadedPreset {
  preset: Preset
  blockMap: Map<string, PresetBlock>
}

export function parsePreset(json: unknown): Preset {
  if (typeof json !== 'object' || json === null) {
    throw new Error('Preset must be a JSON object')
  }
  const p = json as Record<string, unknown>
  if (!Array.isArray(p.prompts)) throw new Error('Preset missing "prompts" array')
  if (!Array.isArray(p.prompt_order)) throw new Error('Preset missing "prompt_order" array')
  return json as Preset
}

export function buildBlockMap(preset: Preset): Map<string, PresetBlock> {
  const map = new Map<string, PresetBlock>()
  for (const block of preset.prompts) {
    map.set(block.identifier, block)
  }
  return map
}

export async function loadPresetFromUrl(url: string): Promise<LoadedPreset> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch preset: ${res.status} ${res.statusText}`)
  const json = await res.json()
  const preset = parsePreset(json)
  return { preset, blockMap: buildBlockMap(preset) }
}

export function loadPresetFromObject(json: unknown): LoadedPreset {
  const preset = parsePreset(json)
  return { preset, blockMap: buildBlockMap(preset) }
}
