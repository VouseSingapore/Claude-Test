/**
 * LLM-as-judge evaluation runner.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node --loader ts-node/esm tests/eval/runner.ts
 *
 * Each EvalCase contains a system prompt, conversation history, a model
 * response to grade, and a rubric. The runner sends these to Claude and
 * receives structured scores + rationale.
 */

import type { EvalCase, EvalResult, EvalCriterion } from '../../src/types'
import { ROLEPLAY_RUBRIC } from './rubrics'

// ── Judge prompt ──────────────────────────────────────────────────────────────

function buildJudgePrompt(evalCase: EvalCase): string {
  const criteriaText = evalCase.rubric.criteria
    .map((c, i) => `${i + 1}. **${c.name}** (weight ${c.weight}): ${c.description}`)
    .join('\n')

  const historyText = evalCase.messages
    .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join('\n\n')

  return `You are an expert evaluator for AI roleplay systems. Grade the following response against the provided rubric.

## System Prompt
${evalCase.systemPrompt}

## Conversation History
${historyText}

## Response to Evaluate
${evalCase.response}

## Rubric: ${evalCase.rubric.name}
${criteriaText}

## Instructions
For each criterion, provide:
- A score from 0–10
- A one-sentence rationale

Respond ONLY with valid JSON in this exact format:
{
  "scores": {
    "<criterion_name>": <0-10>,
    ...
  },
  "rationale": {
    "<criterion_name>": "<one sentence>",
    ...
  }
}`
}

// ── Weighted score ────────────────────────────────────────────────────────────

function computeWeightedScore(
  scores: Record<string, number>,
  criteria: EvalCriterion[]
): number {
  return criteria.reduce((total, c) => {
    return total + ((scores[c.name] ?? 0) / 10) * c.weight
  }, 0)
}

// ── Claude judge call ─────────────────────────────────────────────────────────

async function callJudge(prompt: string): Promise<{ scores: Record<string, number>; rationale: Record<string, string> }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',  // fast + cheap for evaluation
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!res.ok) throw new Error(`Judge API error ${res.status}: ${await res.text()}`)

  const data = await res.json() as { content: Array<{ type: string; text: string }> }
  const text = data.content.find(b => b.type === 'text')?.text ?? ''

  // Extract JSON from response (may be wrapped in markdown)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`Judge returned non-JSON: ${text}`)

  return JSON.parse(jsonMatch[0])
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runEval(evalCase: EvalCase): Promise<EvalResult> {
  const prompt = buildJudgePrompt(evalCase)
  const { scores, rationale } = await callJudge(prompt)
  const weighted = computeWeightedScore(scores, evalCase.rubric.criteria)

  return {
    rubric: evalCase.rubric.name,
    scores,
    weighted,
    rationale,
    passed: weighted >= evalCase.threshold
  }
}

export function printResult(name: string, result: EvalResult): void {
  const status = result.passed ? '✓ PASS' : '✗ FAIL'
  console.log(`\n[${status}] ${name} — weighted score: ${(result.weighted * 100).toFixed(1)}%`)
  for (const [criterion, score] of Object.entries(result.scores)) {
    console.log(`  ${criterion}: ${score}/10 — ${result.rationale[criterion]}`)
  }
}

// ── Example eval cases ────────────────────────────────────────────────────────

const EXAMPLE_CASES: EvalCase[] = [
  {
    name: 'Pacing check — should not rush to resolution',
    systemPrompt: 'You are an excellent roleplayer. Slow burn is default. One beat at a time.',
    messages: [
      { role: 'user', content: 'I approach the mysterious woman at the bar and sit next to her.' }
    ],
    // Replace with actual model response to evaluate
    response: 'The stool scrapes against worn floorboards as you claim the seat beside her. She doesn\'t look up from her drink—a dark amber liquid catching the dim candlelight—but the slight tension in her jaw tells you she noticed. The tavern hum fills the space between you. Her fingers trace the rim of the glass, once, slow.',
    rubric: ROLEPLAY_RUBRIC,
    threshold: 0.7
  }
]

// Run if called directly
if (process.argv[1].endsWith('runner.ts') || process.argv[1].endsWith('runner.js')) {
  console.log('Running evaluations...\n')
  for (const evalCase of EXAMPLE_CASES) {
    try {
      const result = await runEval(evalCase)
      printResult(evalCase.name, result)
    } catch (err) {
      console.error(`[ERROR] ${evalCase.name}:`, err)
    }
  }
}
