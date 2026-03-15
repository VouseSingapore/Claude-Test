import type { EvalRubric } from '../../src/types'

/**
 * Rubric for evaluating roleplay response quality against Purpose_v50 goals.
 * Weights must sum to 1.
 */
export const ROLEPLAY_RUBRIC: EvalRubric = {
  name: 'Roleplay Quality',
  criteria: [
    {
      name: 'pacing',
      description: 'Does the response avoid rushing? Does it advance exactly one story beat, leave room for the user to decide, and resist resolving tension prematurely?',
      weight: 0.2
    },
    {
      name: 'player_agency',
      description: 'Does the model avoid narrating the user\'s actions or making significant choices on their behalf? Does it stop at decision forks?',
      weight: 0.2
    },
    {
      name: 'npc_autonomy',
      description: 'Do NPCs act consistently with their established personality, knowledge, and situation? Do they avoid omniscient behavior?',
      weight: 0.2
    },
    {
      name: 'prose_quality',
      description: 'Is the writing immersive, sensory, and free of repetition or parroting of the user\'s prior message?',
      weight: 0.2
    },
    {
      name: 'length_compliance',
      description: 'Does the response meet the requested length target (flexible/page/short/moderate) without padding or artificial truncation?',
      weight: 0.2
    }
  ]
}

/**
 * Rubric for evaluating deduction block quality (used when show_thoughts is on).
 */
export const DEDUCTION_RUBRIC: EvalRubric = {
  name: 'Deduction Block Quality',
  criteria: [
    {
      name: 'intent_accuracy',
      description: 'Does the Intent line correctly identify what the user is attempting?',
      weight: 0.3
    },
    {
      name: 'variable_usage',
      description: 'Does the block reference relevant context variables (tension, location, emotional states)?',
      weight: 0.3
    },
    {
      name: 'plan_coherence',
      description: 'Does the Plan accurately predict / match what was written in the prose?',
      weight: 0.4
    }
  ]
}
