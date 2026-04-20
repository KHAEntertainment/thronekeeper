// Unit tests for provider-router.js
// Tests: ProviderContext, ProviderRouter, createRouterFromEnv
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProviderContext, ProviderRouter, createRouterFromEnv } from '../provider-router.js'
import { ENDPOINT_KIND } from '../key-resolver.js'

describe('ProviderContext', () => {
  it('creates context with correct properties', () => {
    const ctx = new ProviderContext({
      providerId: 'glm',
      baseUrl: 'https://api.z.ai/api/anthropic',
      key: 'test-key-123',
      model: 'glm-5.1',
      tier: 'reasoning',
    })

    expect(ctx.providerId).toBe('glm')
    expect(ctx.baseUrl).toBe('https://api.z.ai/api/anthropic')
    expect(ctx.key).toBe('test-key-123')
    expect(ctx.model).toBe('glm-5.1')
    expect(ctx.tier).toBe('reasoning')
  })

  it('strips trailing slashes from baseUrl', () => {
    const ctx = new ProviderContext({
      providerId: 'glm',
      baseUrl: 'https://api.z.ai/api/anthropic///',
      key: 'key',
      model: 'model',
      tier: 'reasoning',
    })

    expect(ctx.baseUrl).toBe('https://api.z.ai/api/anthropic')
  })

  it('detects Anthropic-native endpoint for known providers', () => {
    const ctx = new ProviderContext({
      providerId: 'glm',
      baseUrl: 'https://api.z.ai/api/anthropic',
      key: 'key',
      model: 'glm-5.1',
      tier: 'reasoning',
    })

    expect(ctx.isAnthropicNative()).toBe(true)
    expect(ctx.endpointKind).toBe(ENDPOINT_KIND.ANTHROPIC_NATIVE)
  })

  it('detects OpenAI-compatible endpoint for OpenRouter', () => {
    const ctx = new ProviderContext({
      providerId: 'openrouter',
      baseUrl: 'https://openrouter.ai/api',
      key: 'key',
      model: 'openai/gpt-4o',
      tier: 'completion',
    })

    expect(ctx.isAnthropicNative()).toBe(false)
    expect(ctx.endpointKind).toBe(ENDPOINT_KIND.OPENAI_COMPATIBLE)
  })

  it('respects explicit endpointKind override', () => {
    const ctx = new ProviderContext({
      providerId: 'custom',
      baseUrl: 'https://my-proxy.example.com',
      key: 'key',
      model: 'custom-model',
      tier: 'value',
      endpointKind: 'anthropic-native',
    })

    expect(ctx.isAnthropicNative()).toBe(true)
  })

  it('returns correct upstream URL for Anthropic-native', () => {
    const ctx = new ProviderContext({
      providerId: 'glm',
      baseUrl: 'https://api.z.ai/api/anthropic',
      key: 'key',
      model: 'glm-5.1',
      tier: 'reasoning',
    })

    expect(ctx.getUpstreamUrl()).toBe('https://api.z.ai/api/anthropic/v1/messages')
  })

  it('returns correct upstream URL for OpenAI-compatible', () => {
    const ctx = new ProviderContext({
      providerId: 'openrouter',
      baseUrl: 'https://openrouter.ai/api',
      key: 'key',
      model: 'openai/gpt-4o',
      tier: 'completion',
    })

    expect(ctx.getUpstreamUrl()).toBe('https://openrouter.ai/api/v1/chat/completions')
  })

  it('builds Anthropic headers for Anthropic-native providers', () => {
    const ctx = new ProviderContext({
      providerId: 'glm',
      baseUrl: 'https://api.z.ai/api/anthropic',
      key: 'my-secret-key',
      model: 'glm-5.1',
      tier: 'reasoning',
    })

    const headers = ctx.getHeaders()
    expect(headers['x-api-key']).toBe('my-secret-key')
    expect(headers['anthropic-version']).toBeDefined()
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['Authorization']).toBeUndefined()
  })

  it('builds Bearer headers for OpenAI-compatible providers', () => {
    const ctx = new ProviderContext({
      providerId: 'openrouter',
      baseUrl: 'https://openrouter.ai/api',
      key: 'my-openrouter-key',
      model: 'openai/gpt-4o',
      tier: 'completion',
    })

    const headers = ctx.getHeaders()
    expect(headers['Authorization']).toBe('Bearer my-openrouter-key')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['x-api-key']).toBeUndefined()
  })

  it('returns headers without auth when key is missing', () => {
    const ctx = new ProviderContext({
      providerId: 'glm',
      baseUrl: 'https://api.z.ai/api/anthropic',
      key: null,
      model: 'glm-5.1',
      tier: 'reasoning',
    })

    const headers = ctx.getHeaders()
    expect(headers['x-api-key']).toBeUndefined()
    expect(headers['Authorization']).toBeUndefined()
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('produces safe debug output (no key leakage)', () => {
    const ctx = new ProviderContext({
      providerId: 'glm',
      baseUrl: 'https://api.z.ai/api/anthropic',
      key: 'super-secret-key-12345',
      model: 'glm-5.1',
      tier: 'reasoning',
    })

    const debug = ctx.toDebugObject()
    expect(debug.hasKey).toBe(true)
    expect(JSON.stringify(debug)).not.toContain('super-secret-key-12345')
  })
})

describe('ProviderRouter', () => {
  const baseMixedConfig = {
    reasoning: {
      providerId: 'glm',
      baseUrl: 'https://api.z.ai/api/anthropic',
      key: 'glm-key',
      model: 'glm-5.1',
    },
    completion: {
      providerId: 'minimax',
      baseUrl: 'https://api.minimax.io/anthropic',
      key: 'minimax-key',
      model: 'minimax-m2.7',
    },
    value: {
      providerId: 'kimi',
      baseUrl: 'https://api.kimi.com/coding',
      key: 'kimi-key',
      model: 'kimi-k2.5',
    },
  }

  it('resolves model to correct tier and provider', () => {
    const router = new ProviderRouter(baseMixedConfig)

    const resolved = router.resolve('glm-5.1')
    expect(resolved).not.toBeNull()
    expect(resolved.tier).toBe('reasoning')
    expect(resolved.context.providerId).toBe('glm')
  })

  it('resolves all three tiers correctly', () => {
    const router = new ProviderRouter(baseMixedConfig)

    expect(router.resolve('glm-5.1').tier).toBe('reasoning')
    expect(router.resolve('minimax-m2.7').tier).toBe('completion')
    expect(router.resolve('kimi-k2.5').tier).toBe('value')
  })

  it('returns null for unknown model', () => {
    const router = new ProviderRouter(baseMixedConfig)
    expect(router.resolve('unknown-model')).toBeNull()
  })

  it('returns null for empty/null model', () => {
    const router = new ProviderRouter(baseMixedConfig)
    expect(router.resolve(null)).toBeNull()
    expect(router.resolve('')).toBeNull()
    expect(router.resolve(undefined)).toBeNull()
  })

  it('resolves case-insensitively as fallback', () => {
    const router = new ProviderRouter(baseMixedConfig)
    const resolved = router.resolve('GLM-5.1')
    expect(resolved).not.toBeNull()
    expect(resolved.tier).toBe('reasoning')
  })

  it('gets context for tier directly', () => {
    const router = new ProviderRouter(baseMixedConfig)

    const ctx = router.getContextForTier('completion')
    expect(ctx).not.toBeNull()
    expect(ctx.providerId).toBe('minimax')
    expect(ctx.model).toBe('minimax-m2.7')
  })

  it('returns null for invalid tier', () => {
    const router = new ProviderRouter(baseMixedConfig)
    expect(router.getContextForTier('nonexistent')).toBeNull()
  })

  describe('validate() — smart key validation', () => {
    it('passes when all unique providers have keys', () => {
      const router = new ProviderRouter(baseMixedConfig)
      const result = router.validate()

      expect(result.valid).toBe(true)
      expect(result.missing).toHaveLength(0)
      expect(result.uniqueProviders).toHaveLength(3)
    })

    it('passes when 2 tiers share a provider with 1 key', () => {
      const config = {
        reasoning: { providerId: 'glm', baseUrl: 'https://api.z.ai/api/anthropic', key: 'shared-key', model: 'glm-5.1' },
        completion: { providerId: 'glm', baseUrl: 'https://api.z.ai/api/anthropic', key: 'shared-key', model: 'glm-4.5' },
        value: { providerId: 'kimi', baseUrl: 'https://api.kimi.com/coding', key: 'kimi-key', model: 'kimi-k2.5' },
      }
      const router = new ProviderRouter(config)
      const result = router.validate()

      expect(result.valid).toBe(true)
      expect(result.uniqueProviders).toHaveLength(2) // glm + kimi
    })

    it('fails when a routed context is missing a key', () => {
      const config = {
        reasoning: { providerId: 'glm', baseUrl: 'https://api.z.ai/api/anthropic', key: 'glm-key', model: 'glm-5.1' },
        completion: { providerId: 'minimax', baseUrl: 'https://api.minimax.io/anthropic', key: null, model: 'minimax-m2.7' },
        value: { providerId: 'kimi', baseUrl: 'https://api.kimi.com/coding', key: 'kimi-key', model: 'kimi-k2.5' },
      }
      const router = new ProviderRouter(config)
      const result = router.validate()

      expect(result.valid).toBe(false)
      expect(result.missing).toContain('completion:minimax')
    })

    it('fails when a sibling tier for the same provider is missing its routed key', () => {
      const config = {
        reasoning: { providerId: 'glm', baseUrl: 'https://api.z.ai/api/anthropic', key: 'glm-key', model: 'glm-5.1' },
        completion: { providerId: 'glm', baseUrl: 'https://api.z.ai/api/anthropic', key: null, model: 'glm-4.5' },
        value: { providerId: 'kimi', baseUrl: 'https://api.kimi.com/coding', key: 'kimi-key', model: 'kimi-k2.5' },
      }
      const router = new ProviderRouter(config)
      const result = router.validate()

      expect(result.valid).toBe(false)
      expect(result.missing).toContain('completion:glm')
    })
  })

  it('throws on missing config tiers', () => {
    expect(() => new ProviderRouter({})).toThrow()
    expect(() => new ProviderRouter({ reasoning: baseMixedConfig.reasoning })).toThrow()
    expect(() => new ProviderRouter(null)).toThrow()
  })

  it('throws on malformed tier bindings', () => {
    expect(() => new ProviderRouter({
      reasoning: {},
      completion: baseMixedConfig.completion,
      value: baseMixedConfig.value,
    })).toThrow()

    expect(() => new ProviderRouter({
      reasoning: baseMixedConfig.reasoning,
      completion: {},
      value: baseMixedConfig.value,
    })).toThrow()

    expect(() => new ProviderRouter({
      reasoning: baseMixedConfig.reasoning,
      completion: baseMixedConfig.completion,
      value: {},
    })).toThrow()
  })

  it('rejects duplicate model IDs across tiers', () => {
    const config = {
      reasoning: { providerId: 'glm', baseUrl: 'https://api.z.ai/api/anthropic', key: 'glm-key', model: 'shared-model' },
      completion: { providerId: 'minimax', baseUrl: 'https://api.minimax.io/anthropic', key: 'minimax-key', model: 'shared-model' },
      value: { providerId: 'kimi', baseUrl: 'https://api.kimi.com/coding', key: 'kimi-key', model: 'kimi-k2.5' },
    }

    expect(() => new ProviderRouter(config)).toThrow(/duplicate|multiple/i)
  })

  it('rejects duplicate model IDs even when tiers share the same upstream context', () => {
    const config = {
      reasoning: { providerId: 'glm', baseUrl: 'https://api.z.ai/api/anthropic', key: 'glm-key', model: 'shared-model' },
      completion: { providerId: 'glm', baseUrl: 'https://api.z.ai/api/anthropic', key: 'glm-key', model: 'shared-model' },
      value: { providerId: 'kimi', baseUrl: 'https://api.kimi.com/coding', key: 'kimi-key', model: 'kimi-k2.5' },
    }

    expect(() => new ProviderRouter(config)).toThrow(/duplicate|multiple/i)
  })

  it('produces safe debug output', () => {
    const router = new ProviderRouter(baseMixedConfig)
    const debug = router.toDebugObject()

    expect(debug.tierMapSize).toBe(3)
    expect(debug.models).toContain('glm-5.1')
    expect(debug.models).toContain('minimax-m2.7')
    expect(debug.models).toContain('kimi-k2.5')
    expect(JSON.stringify(debug)).not.toContain('glm-key')
  })
})

describe('createRouterFromEnv()', () => {
  it('returns null when MIXED_PROVIDERS_CONFIG is absent', () => {
    const router = createRouterFromEnv({})
    expect(router).toBeNull()
  })

  it('returns null when MIXED_PROVIDERS_CONFIG is empty string', () => {
    const router = createRouterFromEnv({ MIXED_PROVIDERS_CONFIG: '' })
    expect(router).toBeNull()
  })

  it('throws when MIXED_PROVIDERS_CONFIG is malformed JSON', () => {
    expect(() => createRouterFromEnv({ MIXED_PROVIDERS_CONFIG: 'not-json' }))
      .toThrow(/MIXED_PROVIDERS_CONFIG/)
  })

  it('throws when MIXED_PROVIDERS_CONFIG fails validation', () => {
    const config = {
      reasoning: { providerId: 'glm', key: 'k1', model: 'glm-5.1' },
      completion: { providerId: 'minimax', baseUrl: 'https://api.minimax.io/anthropic', key: 'k2', model: 'minimax-m2.7' },
      value: { providerId: 'kimi', baseUrl: 'https://api.kimi.com/coding', key: 'k3', model: 'kimi-k2.5' },
    }

    expect(() => createRouterFromEnv({ MIXED_PROVIDERS_CONFIG: JSON.stringify(config) }))
      .toThrow(/Invalid MIXED_PROVIDERS_CONFIG/)
  })

  it('normalizes legacy coding tier to completion', () => {
    const config = {
      reasoning: { providerId: 'glm', baseUrl: 'https://api.z.ai/api/anthropic', key: 'k1', model: 'glm-5.1' },
      coding: { providerId: 'minimax', baseUrl: 'https://api.minimax.io/anthropic', key: 'k2', model: 'minimax-m2.7' },
      value: { providerId: 'kimi', baseUrl: 'https://api.kimi.com/coding', key: 'k3', model: 'kimi-k2.5' },
    }

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const router = createRouterFromEnv({ MIXED_PROVIDERS_CONFIG: JSON.stringify(config) })

    expect(router).not.toBeNull()
    expect(router.resolve('minimax-m2.7').tier).toBe('completion')
    consoleSpy.mockRestore()
  })

  it('uses the injected env debug flag for debug logging', () => {
    const config = {
      reasoning: { providerId: 'glm', baseUrl: 'https://api.z.ai/api/anthropic', key: 'k1', model: 'glm-5.1' },
      completion: { providerId: 'minimax', baseUrl: 'https://api.minimax.io/anthropic', key: 'k2', model: 'minimax-m2.7' },
      value: { providerId: 'kimi', baseUrl: 'https://api.kimi.com/coding', key: 'k3', model: 'kimi-k2.5' },
    }

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    createRouterFromEnv({ MIXED_PROVIDERS_CONFIG: JSON.stringify(config), DEBUG: '1' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[ProviderRouter] Initialized:',
      expect.stringContaining('"reasoning"')
    )
    consoleSpy.mockRestore()
  })

  it('creates router from valid env var', () => {
    const config = {
      reasoning: { providerId: 'glm', baseUrl: 'https://api.z.ai/api/anthropic', key: 'k1', model: 'glm-5.1' },
      completion: { providerId: 'minimax', baseUrl: 'https://api.minimax.io/anthropic', key: 'k2', model: 'minimax-m2.7' },
      value: { providerId: 'kimi', baseUrl: 'https://api.kimi.com/coding', key: 'k3', model: 'kimi-k2.5' },
    }

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const router = createRouterFromEnv({ MIXED_PROVIDERS_CONFIG: JSON.stringify(config) })

    expect(router).not.toBeNull()
    expect(router.resolve('glm-5.1')).not.toBeNull()
    expect(router.resolve('minimax-m2.7')).not.toBeNull()
    expect(router.resolve('kimi-k2.5')).not.toBeNull()
    consoleSpy.mockRestore()
  })

  it('throws when mixed provider tier keys are missing', () => {
    const config = {
      reasoning: { providerId: 'glm', baseUrl: 'https://api.z.ai/api/anthropic', key: null, model: 'glm-5.1' },
      completion: { providerId: 'minimax', baseUrl: 'https://api.minimax.io/anthropic', key: null, model: 'minimax-m2.7' },
      value: { providerId: 'kimi', baseUrl: 'https://api.kimi.com/coding', key: null, model: 'kimi-k2.5' },
    }

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(() => createRouterFromEnv({ MIXED_PROVIDERS_CONFIG: JSON.stringify(config) }))
      .toThrow(/Missing API keys/)
    logSpy.mockRestore()
  })
})

describe('Mixed endpoint kinds in same router', () => {
  it('supports Anthropic-native + OpenAI-compatible in same session', () => {
    const config = {
      reasoning: {
        providerId: 'openrouter',
        baseUrl: 'https://openrouter.ai/api',
        key: 'or-key',
        model: 'openai/gpt-4o',
      },
      completion: {
        providerId: 'glm',
        baseUrl: 'https://api.z.ai/api/anthropic',
        key: 'glm-key',
        model: 'glm-5.1',
      },
      value: {
        providerId: 'kimi',
        baseUrl: 'https://api.kimi.com/coding',
        key: 'kimi-key',
        model: 'kimi-k2.5',
      },
    }

    const router = new ProviderRouter(config)

    // Reasoning tier should be OpenAI-compatible
    const reasoning = router.resolve('openai/gpt-4o')
    expect(reasoning.context.isAnthropicNative()).toBe(false)
    expect(reasoning.context.getUpstreamUrl()).toContain('/chat/completions')

    // Completion tier should be Anthropic-native
    const completion = router.resolve('glm-5.1')
    expect(completion.context.isAnthropicNative()).toBe(true)
    expect(completion.context.getUpstreamUrl()).toContain('/v1/messages')

    // Value tier should be Anthropic-native
    const value = router.resolve('kimi-k2.5')
    expect(value.context.isAnthropicNative()).toBe(true)

    // Each has correct auth headers
    const reasoningHeaders = reasoning.context.getHeaders()
    expect(reasoningHeaders['Authorization']).toBe('Bearer or-key')
    expect(reasoningHeaders['x-api-key']).toBeUndefined()

    const completionHeaders = completion.context.getHeaders()
    expect(completionHeaders['x-api-key']).toBe('glm-key')
    expect(completionHeaders['Authorization']).toBeUndefined()
  })
})
