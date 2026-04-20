import { describe, expect, it } from 'vitest'
import '../src/schemas/messages'

describe('configuration schema', () => {
  it('normalizes endpointKind aliases before runtime serialization', async () => {
    const { TierProviderBindingSchema } = await import('../src/schemas/config')
    const openai = TierProviderBindingSchema.parse({
      providerId: 'custom-openai',
      baseUrl: 'https://api.example.com',
      model: 'model-a',
      endpointKind: 'openai-compatible',
    })
    const anthropic = TierProviderBindingSchema.parse({
      providerId: 'custom-anthropic',
      baseUrl: 'https://anthropic.example.com',
      model: 'model-b',
      endpointKind: 'anthropic-native',
    })

    expect(openai.endpointKind).toBe('openai')
    expect(anthropic.endpointKind).toBe('anthropic')
  })

  it('does not require active single-provider selections when mixedProviders is enabled', async () => {
    const {
      MixedProviderConfigSchema,
      checkConfigurationInvariants,
    } = await import('../src/schemas/config')
    const mixedProviders = MixedProviderConfigSchema.parse({
      enabled: true,
      reasoning: {
        providerId: 'glm',
        baseUrl: 'https://api.z.ai/api/anthropic',
        model: 'glm-5.1',
        endpointKind: 'anthropic',
      },
      completion: {
        providerId: 'minimax',
        baseUrl: 'https://api.minimax.io/anthropic',
        model: 'MiniMax-M2.7',
        endpointKind: 'anthropic',
      },
      value: {
        providerId: 'kimi',
        baseUrl: 'https://api.kimi.com/coding',
        model: 'kimi-for-coding',
        endpointKind: 'anthropic',
      },
    })

    const violations = checkConfigurationInvariants({
      provider: 'openrouter',
      modelSelectionsByProvider: {},
      twoModelMode: true,
      mixedProviders,
    } as any)

    expect(violations).toEqual([])
  })
})
