/**
 * Grok Multi-Agent Utility Functions
 * PGP block stripping and high-thinking mode detection for x-ai/grok-4.20-multi-agent
 */

// PGP block stripping for Grok multi-agent responses
export const PGP_BLOCK_PATTERN = /-----BEGIN PGP MESSAGE-----[\s\S]*?-----END PGP MESSAGE-----/g

/**
 * Strip PGP armored blocks from text content.
 * Used for Grok multi-agent responses that include encrypted sub-agent state.
 * @param {string} text - Text that may contain PGP blocks
 * @returns {string} - Clean text with PGP blocks removed
 */
export function stripPgpBlocks(text) {
  if (!text || typeof text !== 'string') return text
  return text.replace(PGP_BLOCK_PATTERN, '').trim()
}

// Grok multi-agent constants
export const GROK_AGENT_COUNTS = { low: 4, high: 16 }
export const HIGH_THINKING_PHRASES = [
  '16 agent swarm',
  'high thinking',
  '16 agents',
  'swarm',
  'multi-agent',
  'agent swarm',
  '16-agent',
]

/**
 * Detect high-thinking mode from prompt content.
 * Used when payload.thinking is not explicitly set.
 * @param {string} content - The prompt/messages content to analyze
 * @returns {boolean} true if high-thinking mode should be activated
 */
export function detectHighThinking(content) {
  if (!content) return false
  const lowerContent = content.toLowerCase()
  return HIGH_THINKING_PHRASES.some(phrase => lowerContent.includes(phrase.toLowerCase()))
}
