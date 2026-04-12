/**
 * Unit tests for Grok Multi-Agent functionality
 * Tests PGP block stripping and high-thinking mode detection
 */

import { describe, it, expect } from 'vitest'
import { PGP_BLOCK_PATTERN, stripPgpBlocks, GROK_AGENT_COUNTS, HIGH_THINKING_PHRASES, detectHighThinking } from '../utils/grok-multiagent.js'

describe('PGP_BLOCK_PATTERN', () => {
  it('matches well-formed PGP blocks', () => {
    const input = 'Hello world -----BEGIN PGP MESSAGE----- abc123 -----END PGP MESSAGE----- more text'
    const matches = input.match(PGP_BLOCK_PATTERN)
    expect(matches).not.toBeNull()
    expect(matches[0]).toContain('-----BEGIN PGP MESSAGE-----')
    expect(matches[0]).toContain('-----END PGP MESSAGE-----')
  })

  it('handles multiple PGP blocks in one response', () => {
    const input = `-----BEGIN PGP MESSAGE-----
first block content
-----END PGP MESSAGE-----
some text between
-----BEGIN PGP MESSAGE-----
second block content
-----END PGP MESSAGE-----
final text`
    const matches = input.match(PGP_BLOCK_PATTERN)
    expect(matches).toHaveLength(2)
  })

  it('returns null when no PGP blocks present', () => {
    const input = 'This is normal text without any PGP blocks'
    const matches = input.match(PGP_BLOCK_PATTERN)
    expect(matches).toBeNull()
  })

  it('matches PGP blocks with newlines and special characters', () => {
    const input = `-----BEGIN PGP MESSAGE-----
Version: GnuPG v1
Comment: encrypted sub-agent state

hQEMAwxI2mN2P4+8AQgAi6v0vLKJ9X9zP6bN8Cv3H2rT4L
-----END PGP MESSAGE-----`
    const matches = input.match(PGP_BLOCK_PATTERN)
    expect(matches).not.toBeNull()
  })
})

describe('stripPgpBlocks', () => {
  it('removes well-formed PGP blocks', () => {
    const input = 'Answer: Here is the response -----BEGIN PGP MESSAGE----- encrypted state -----END PGP MESSAGE-----'
    const result = stripPgpBlocks(input)
    expect(result).toBe('Answer: Here is the response')
    expect(result).not.toContain('PGP')
    expect(result).not.toContain('encrypted')
  })

  it('returns original text when no PGP blocks present', () => {
    const input = 'This is a normal response without any encrypted blocks'
    const result = stripPgpBlocks(input)
    expect(result).toBe(input)
  })

  it('handles multiple PGP blocks', () => {
    const input = `First part -----BEGIN PGP MESSAGE----- block1 -----END PGP MESSAGE----- middle -----BEGIN PGP MESSAGE----- block2 -----END PGP MESSAGE----- last part`
    const result = stripPgpBlocks(input)
    // Note: stripPgpBlocks uses .trim() but preserves internal spacing
    expect(result).toBe('First part  middle  last part')
    expect(result).not.toContain('PGP')
  })

  it('handles empty/null input gracefully', () => {
    expect(stripPgpBlocks(null)).toBe(null)
    expect(stripPgpBlocks(undefined)).toBe(undefined)
  })

  it('handles empty string', () => {
    const result = stripPgpBlocks('')
    expect(result).toBe('')
  })

  it('trims whitespace after removing PGP blocks', () => {
    const input = 'Text -----BEGIN PGP MESSAGE----- content -----END PGP MESSAGE-----   '
    const result = stripPgpBlocks(input)
    expect(result).toBe('Text')
    expect(result).not.toContain('  ')
  })
})

describe('GROK_AGENT_COUNTS', () => {
  it('has low and high values', () => {
    expect(GROK_AGENT_COUNTS.low).toBe(4)
    expect(GROK_AGENT_COUNTS.high).toBe(16)
  })

  it('low is less than high', () => {
    expect(GROK_AGENT_COUNTS.low).toBeLessThan(GROK_AGENT_COUNTS.high)
  })
})

describe('HIGH_THINKING_PHRASES', () => {
  it('contains expected phrases', () => {
    expect(HIGH_THINKING_PHRASES).toContain('16 agent swarm')
    expect(HIGH_THINKING_PHRASES).toContain('high thinking')
    expect(HIGH_THINKING_PHRASES).toContain('16 agents')
    expect(HIGH_THINKING_PHRASES).toContain('swarm')
    expect(HIGH_THINKING_PHRASES).toContain('multi-agent')
    expect(HIGH_THINKING_PHRASES).toContain('agent swarm')
    expect(HIGH_THINKING_PHRASES).toContain('16-agent')
  })

  it('has at least 5 phrases', () => {
    expect(HIGH_THINKING_PHRASES.length).toBeGreaterThanOrEqual(5)
  })
})

describe('detectHighThinking', () => {
  describe('returns true for high-thinking trigger phrases', () => {
    const highThinkingPhrases = [
      'use 16 agent swarm',
      'run with 16 agents',
      'enable high thinking mode',
      'activate swarm mode',
      'use multi-agent mode',
      'run agent swarm',
      '16-agent configuration'
    ]

    highThinkingPhrases.forEach(phrase => {
      it(`detects: "${phrase}"`, () => {
        expect(detectHighThinking(phrase)).toBe(true)
      })
    })

    it('detects high-thinking phrases case-insensitively', () => {
      expect(detectHighThinking('USE 16 AGENT SWARM')).toBe(true)
      expect(detectHighThinking('High Thinking Mode')).toBe(true)
      expect(detectHighThinking('MULTI-AGENT')).toBe(true)
    })
  })

  describe('returns false for normal prompts', () => {
    const normalPrompts = [
      'Hello, how are you?',
      'Write a function to calculate fibonacci',
      'Explain what a linked list is',
      'Help me debug this code',
      'What is the weather today?'
    ]

    normalPrompts.forEach(prompt => {
      it(`allows normal prompt: "${prompt}"`, () => {
        expect(detectHighThinking(prompt)).toBe(false)
      })
    })
  })

  it('handles empty/null input gracefully', () => {
    expect(detectHighThinking(null)).toBe(false)
    expect(detectHighThinking(undefined)).toBe(false)
    expect(detectHighThinking('')).toBe(false)
  })

  it('returns false for prompt without trigger phrases', () => {
    const prompt = 'Please write a simple hello world program in Python'
    expect(detectHighThinking(prompt)).toBe(false)
  })

  it('detects phrase within longer prompt', () => {
    const prompt = 'I need you to use a 16 agent swarm to solve this complex problem'
    expect(detectHighThinking(prompt)).toBe(true)
  })
})
