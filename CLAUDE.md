# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite frontend + Express proxy concurrently
npm run build      # Production build → dist/
npm test           # Run all unit + integration tests (Vitest)
npm run test:watch # Watch mode
npm run test:ui    # Vitest browser UI
npm run eval       # Run LLM-as-judge evaluations (requires ANTHROPIC_API_KEY)
npm run proxy      # Start proxy server only (port 3001)
```

Run a single test file:
```bash
npx vitest run tests/unit/variables.test.ts
```

## Environment

```
ANTHROPIC_API_KEY=  # Required for Claude provider + eval runner
OPENAI_API_KEY=     # Required for OpenAI provider
PORT=3001           # Proxy server port (default)
```

## Architecture

```
src/
  types.ts               # All TypeScript interfaces (Preset, Message, EvalCase, etc.)
  main.ts                # App entry point — wires UI, preset engine, streaming
  preset/
    loader.ts            # Parse JSON → Preset + Map<id, PresetBlock>
    variables.ts         # VariableEngine: {{setvar}}/{{getvar}}/{{char}}/{{roll::NdN}}
    assembler.ts         # Build system prompt from ordered enabled blocks
    regex-processor.ts   # Strip DEDUCTION/AUDIT/PAGE_UPDATE blocks from output
  api/
    client.ts            # Browser-side SSE stream consumer → /api/chat
  styles/main.css        # Mobile-first dark theme

proxy/
  server.js              # Express SSE proxy (holds API keys server-side)
  claude.js              # Claude streaming adapter
  openai.js              # OpenAI streaming adapter

tests/
  unit/                  # Pure function tests (variables, regex, loader)
  integration/           # Full pipeline against real Preset/Purpose_v50.json
  eval/
    rubrics.ts           # EvalRubric definitions (pacing, agency, NPC autonomy, etc.)
    runner.ts            # LLM-as-judge runner — calls Claude Haiku to grade responses
```

## Key Design Decisions

**Proxy pattern**: API keys never reach the browser. All provider calls go through the Express proxy which reads keys from environment variables.

**Variable engine order**: `{{setvar}}` macros are stripped in a first pass (left-to-right), then `{{getvar}}` and other macros expand in a second pass. This means setvar fires before getvar in the same string.

**Regex post-processing**: Applied to the *accumulated raw stream* before rendering. The preset's `regex_scripts` strip hidden reasoning blocks (`---DEDUCTION---`, `---AUDIT---`, `<!-- PAGE_UPDATE -->`) so users only see prose.

**Toggle groups**: Section A blocks use `{{setvar}}` to write named variables (e.g. `prompt`, `tense`, `guidelines`) that Section B blocks read via `{{getvar}}`. Enabling a toggle option writes its variable; the system prompt then reflects the choice.

**Evaluation**: `tests/eval/runner.ts` uses Claude Haiku as a judge with weighted rubrics. Run after prompt changes to catch regressions in pacing, player agency, and NPC autonomy.
