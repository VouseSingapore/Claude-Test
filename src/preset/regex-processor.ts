import type { RegexScript } from '../types'

/**
 * Parses a SillyTavern-style regex string like "/pattern/flags" into a RegExp.
 */
export function parseSillyTavernRegex(raw: string): RegExp {
  const match = raw.match(/^\/(.+)\/([gimsuy]*)$/)
  if (!match) {
    // Treat as a literal string pattern
    return new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  }
  return new RegExp(match[1], match[2])
}

export interface CompiledScript {
  name: string
  pattern: RegExp
  replace: string
}

export function compileScripts(scripts: RegexScript[]): CompiledScript[] {
  return scripts
    .filter(s => !s.disabled)
    .map(s => ({
      name: s.scriptName,
      pattern: parseSillyTavernRegex(s.findRegex),
      replace: s.replaceString
    }))
}

/**
 * Apply all compiled regex scripts to strip internal reasoning blocks
 * from the model's output before displaying it to the user.
 */
export function postProcess(text: string, scripts: CompiledScript[]): string {
  return scripts.reduce((t, s) => t.replace(s.pattern, s.replace), text).trim()
}
