import type { Preset, PresetBlock, ChatContext } from '../types'
import { VariableEngine } from './variables'

export interface PromptSegment {
  id: string
  name: string
  content: string
}

export interface AssembledPrompt {
  system: string
  variables: Record<string, string>
  segments: PromptSegment[]
}

/**
 * Marker block identifiers that represent injection points (chat history,
 * world info, etc.) rather than literal text content.
 */
const MARKER_IDENTIFIERS = new Set([
  'chatHistory',
  'dialogueExamples',
  'worldInfoBefore',
  'worldInfoAfter',
])

export function assembleSystemPrompt(
  preset: Preset,
  blockMap: Map<string, PresetBlock>,
  characterId: number,
  context: ChatContext,
  overrides: Record<string, string> = {}
): AssembledPrompt {
  const engine = new VariableEngine(context)
  if (Object.keys(overrides).length) engine.setOverrides(overrides)

  const charOrder = preset.prompt_order.find(p => p.character_id === characterId)
  if (!charOrder) {
    throw new Error(`No prompt order found for character ID ${characterId}`)
  }

  const parts: string[] = []
  const segments: PromptSegment[] = []

  for (const entry of charOrder.order) {
    if (!entry.enabled) continue

    const block = blockMap.get(entry.identifier)
    if (!block) continue

    // Skip structural markers
    if (block.marker || MARKER_IDENTIFIERS.has(block.identifier)) continue

    // Skip blocks with no content
    if (!block.content || block.content.trim() === '') continue

    const processed = engine.process(block.content)
    const trimmed = processed.trim()

    if (trimmed) {
      parts.push(trimmed)
      segments.push({ id: entry.identifier, name: block.name, content: trimmed })
    }
  }

  return {
    system: parts.join('\n\n'),
    variables: engine.getAll() as Record<string, string>,
    segments
  }
}

/**
 * Extracts the toggle groups from Section A of the preset.
 * Returns a map of groupName → array of selectable blocks.
 */
export interface ToggleGroup {
  id: string
  name: string
  options: Array<{ id: string; label: string }>
}

export function extractToggleGroups(preset: Preset): ToggleGroup[] {
  const groups: ToggleGroup[] = []
  let currentGroup: ToggleGroup | null = null

  for (const block of preset.prompts) {
    // Group header: names like "‒+ Group N — ..." (thin dash, not section headers ━+)
    if (block.name.startsWith('‒+')) {
      if (currentGroup) groups.push(currentGroup)
      currentGroup = {
        id: block.identifier,
        name: block.name.replace(/^[━‒]+\s*(Group \d+\s*[—-]\s*)?/, '').trim(),
        options: []
      }
      continue
    }

    // Option entry: names like "➀ ...", "➁ ...", "➊ ...", "➋ ..."
    if (currentGroup && /^[➀-➓➊-➓①-⑩]/.test(block.name)) {
      currentGroup.options.push({
        id: block.identifier,
        label: block.name.replace(/^[➀-➓➊-➓①-⑩]\s*/, '').trim()
      })
    }
  }

  if (currentGroup) groups.push(currentGroup)
  return groups
}
