import type { VariableStore, ChatContext } from '../types'

export class VariableEngine {
  private store: VariableStore = {}

  constructor(private context: ChatContext) {}

  reset(): void {
    this.store = {}
  }

  set(key: string, value: string): void {
    this.store[key] = value
  }

  get(key: string): string {
    return this.store[key] ?? ''
  }

  getAll(): Readonly<VariableStore> {
    return { ...this.store }
  }

  /**
   * Process all {{...}} macros in a block's content.
   * Macros are evaluated left-to-right; setvar side-effects fire immediately.
   */
  process(text: string): string {
    // First pass: fire all setvars and strip them
    text = text.replace(
      /\{\{setvar::([a-zA-Z0-9_]+)::([\s\S]*?)\}\}/g,
      (_, key: string, value: string) => {
        this.store[key] = value
        return ''
      }
    )

    // Second pass: expand remaining macros
    text = text.replace(/\{\{([^}]+)\}\}/g, (match, inner: string) => {
      const trimmed = inner.trim()

      if (trimmed === 'trim') return '\x00TRIM\x00'
      if (trimmed === 'char') return this.context.charName
      if (trimmed === 'user') return this.context.userName

      if (trimmed.startsWith('getvar::')) {
        const key = trimmed.slice('getvar::'.length)
        return this.store[key] ?? ''
      }

      if (trimmed.startsWith('roll::')) {
        return String(this.rollDice(trimmed.slice('roll::'.length)))
      }

      if (trimmed.startsWith('//')) {
        // Comment macro — strip it
        return ''
      }

      // Unknown macro — leave as-is for forward compatibility
      return match
    })

    // Handle {{trim}}: everything after the last \x00TRIM\x00 marker is trimmed
    if (text.includes('\x00TRIM\x00')) {
      const parts = text.split('\x00TRIM\x00')
      text = parts[parts.length - 1].trimEnd()
    }

    return text
  }

  private rollDice(expression: string): number {
    const match = expression.match(/^(\d+)d(\d+)$/)
    if (!match) return 0
    const count = parseInt(match[1], 10)
    const sides = parseInt(match[2], 10)
    let total = 0
    for (let i = 0; i < count; i++) {
      total += Math.floor(Math.random() * sides) + 1
    }
    return total
  }
}
