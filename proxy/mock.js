/**
 * Mock streaming adapter — no API key required.
 * Streams a canned response word-by-word to exercise the full pipeline
 * (SSE streaming, {{setvar}} extraction, regex post-processing, variable panel).
 *
 * To customise the response, edit MOCK_RESPONSES below or pass
 * `mockText` in the request body to override per-request.
 */

const MOCK_RESPONSES = [
  `{{setvar::mood::curious}}{{setvar::location::The Dusty Lantern Inn}}You step inside and the door swings shut behind you, muffling the rain. The innkeeper looks up from behind the bar, wiping a mug with a grey cloth.

"We don't get many travellers this late," she says, setting the mug down. "Looking for a room, or just the fire?"

The hearth crackles in the corner. Three other patrons sit at separate tables — none of them look up.`,

  `{{setvar::mood::tense}}{{setvar::location::Collapsed Bridge}}The bridge groans under your weight. Two of the wooden planks are already missing and a third bows dangerously as you shift your footing.

Across the ravine, the path continues into the trees. Behind you, the sound of pursuit grows louder.

You have seconds to decide.`,

  `{{setvar::mood::calm}}{{setvar::location::Market Square}}The market is quieter than usual this morning. A few vendors are packing up early, whispering to each other in low voices. One of them catches your eye and shakes his head slightly — a warning, or just a habit.

The item you were told to collect should be at the third stall on the left. It's still there, but so is someone you don't recognise, standing next to it and looking at nothing in particular.`
]

let mockIndex = 0

/**
 * @param {object} opts  – same shape as other adapters (system, messages, mockText?)
 * @param {(delta: string, done: boolean) => void} sendChunk
 */
export async function streamMock(opts, sendChunk) {
  const text = opts.mockText ?? MOCK_RESPONSES[mockIndex % MOCK_RESPONSES.length]
  mockIndex++

  // Stream word-by-word with a small delay to simulate real token streaming
  const words = text.split(/(\s+)/)
  for (const word of words) {
    sendChunk(word, false)
    await delay(18 + Math.random() * 24)
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
