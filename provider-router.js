// Provider Router — per-tier routing for mixed-provider mode
// Language: Node.js ESM
//
// When MIXED_PROVIDERS_CONFIG env var is set, the proxy routes each request
// to the correct upstream provider based on the model name → tier mapping.
//
// Architecture:
//   - ProviderContext: fully self-contained state for a single provider
//   - ProviderRouter: maps model names to ProviderContexts via tier assignments
//
// CLI-ready: no VS Code dependencies. Accepts plain config objects.

import {
  providerSpecificHeaders,
  inferEndpointKindSync,
  ENDPOINT_KIND,
} from './key-resolver.js'

const MIXED_TIERS = ['reasoning', 'completion', 'value']

function normalizeEndpointKind(endpointKind) {
  const kind = String(endpointKind || 'auto').toLowerCase()
  if (kind === 'anthropic' || kind === 'anthropic-native') return 'anthropic'
  if (kind === 'openai' || kind === 'openai-compatible') return 'openai'
  return 'auto'
}

function normalizeMixedProviderConfig(input) {
  const source = { ...input }
  if (!source.completion && source.coding) {
    source.completion = source.coding
  }
  delete source.coding

  if (source.enabled === false) {
    return { enabled: false }
  }

  const errors = []
  const normalized = { enabled: source.enabled !== false }

  // Mirrors the extension's MixedProviderConfigSchema at the proxy boundary
  // without bundling the schema library into the standalone proxy artifact.
  for (const tier of MIXED_TIERS) {
    const binding = source[tier]
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
      errors.push(`${tier} must be an object`)
      continue
    }

    const providerId = typeof binding.providerId === 'string' ? binding.providerId.trim() : ''
    const baseUrl = typeof binding.baseUrl === 'string' ? binding.baseUrl.trim() : ''
    const model = typeof binding.model === 'string' ? binding.model.trim() : ''
    const displayModel = typeof binding.displayModel === 'string' ? binding.displayModel.trim() : binding.displayModel

    if (!providerId) errors.push(`${tier}.providerId must be a non-empty string`)
    if (!baseUrl) errors.push(`${tier}.baseUrl must be a non-empty string`)
    if (!model) errors.push(`${tier}.model must be a non-empty string`)
    if (binding.displayModel !== undefined && typeof displayModel === 'string' && !displayModel) {
      errors.push(`${tier}.displayModel must be a non-empty string when provided`)
    }

    normalized[tier] = {
      ...binding,
      providerId,
      baseUrl,
      model,
      ...(displayModel !== undefined && { displayModel }),
      endpointKind: normalizeEndpointKind(binding.endpointKind),
    }
  }

  return errors.length > 0
    ? { errors }
    : normalized
}

/**
 * Fully self-contained provider state for a single tier.
 * Encapsulates everything needed to route a request to one upstream provider.
 */
export class ProviderContext {
  /**
   * @param {object} config
   * @param {string} config.providerId - Provider identifier (e.g., 'glm', 'minimax', 'kimi', 'custom')
   * @param {string} config.baseUrl - Upstream base URL (e.g., 'https://api.z.ai/api/anthropic')
   * @param {string} config.key - API key for this provider
   * @param {string} config.model - Model name at the upstream provider (without namespace prefix)
   * @param {string} config.tier - Which tier this context serves: 'reasoning', 'completion', or 'value'
   * @param {string} [config.endpointKind] - Override endpoint kind; auto-detected if omitted
   * @param {Object<string,string>} [config.endpointOverrides] - Optional endpoint kind overrides map
   */
  constructor({
    providerId,
    baseUrl,
    key,
    model,
    tier,
    endpointKind,
    endpointOverrides = {},
  }) {
    this.providerId = providerId
    this.baseUrl = (baseUrl || '').replace(/\/+$/, '')
    this.key = key
    this.model = model
    this.tier = tier

    // Resolve endpoint kind: explicit override > auto-detect
    const normalizedEndpointKind = normalizeEndpointKind(endpointKind)
    if (normalizedEndpointKind !== 'auto') {
      if (normalizedEndpointKind === 'anthropic') {
        this.endpointKind = ENDPOINT_KIND.ANTHROPIC_NATIVE
      } else if (normalizedEndpointKind === 'openai') {
        this.endpointKind = ENDPOINT_KIND.OPENAI_COMPATIBLE
      }
    } else {
      this.endpointKind = inferEndpointKindSync(providerId, baseUrl, endpointOverrides)
    }
    if (!this.endpointKind) {
      throw new Error(`[ProviderContext] Unable to infer endpoint kind for provider "${providerId}"`)
    }
  }

  /**
   * Whether this provider uses Anthropic-native protocol.
   * @returns {boolean}
   */
  isAnthropicNative() {
    return this.endpointKind === ENDPOINT_KIND.ANTHROPIC_NATIVE
  }

  /**
   * Build the correct upstream request URL for this provider.
   * @returns {string} Full URL for the API endpoint
   */
  getUpstreamUrl() {
    if (this.isAnthropicNative()) {
      return `${this.baseUrl}/v1/messages`
    }
    return `${this.baseUrl}/v1/chat/completions`
  }

  /**
   * Build the correct authentication and content-type headers for this provider.
   * @returns {Object<string,string>} Headers object ready for fetch()
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      ...providerSpecificHeaders(this.providerId),
    }

    if (!this.key) {
      return headers
    }

    if (this.isAnthropicNative()) {
      headers['x-api-key'] = this.key
      headers['anthropic-version'] = process.env.ANTHROPIC_VERSION || '2023-06-01'
      if (process.env.ANTHROPIC_BETA) {
        headers['anthropic-beta'] = process.env.ANTHROPIC_BETA
      }
    } else {
      headers['Authorization'] = `Bearer ${this.key}`
    }

    return headers
  }

  /**
   * Returns a safe (redacted) representation for logging.
   * @returns {object}
   */
  toDebugObject() {
    return {
      providerId: this.providerId,
      baseUrl: this.baseUrl,
      model: this.model,
      tier: this.tier,
      endpointKind: this.endpointKind,
      hasKey: !!this.key,
    }
  }
}

/**
 * Routes incoming requests to the correct ProviderContext based on model name → tier mapping.
 *
 * Constructed from the MIXED_PROVIDERS_CONFIG env var (JSON object with reasoning, completion, value tiers).
 * Falls through gracefully — if model is not found in the tier map, returns null and the
 * caller should fall back to the existing single-provider flow.
 */
export class ProviderRouter {
  /**
   * @param {object} config - Parsed MIXED_PROVIDERS_CONFIG
   * @param {object} config.reasoning  - { providerId, baseUrl, key, model, endpointKind? }
   * @param {object} config.completion - { providerId, baseUrl, key, model, endpointKind? }
   * @param {object} config.value      - { providerId, baseUrl, key, model, endpointKind? }
   * @param {Object<string,string>} [endpointOverrides={}] - Optional endpoint kind overrides
   */
  constructor(config, endpointOverrides = {}) {
    if (!config || !config.reasoning || !config.completion || !config.value) {
      throw new Error(
        '[ProviderRouter] Invalid config: must include reasoning, completion, and value tiers'
      )
    }

    const validation = normalizeMixedProviderConfig(config)
    if (validation.errors) {
      throw new Error(`[ProviderRouter] Invalid config: ${validation.errors.join('; ')}`)
    }

    this.contexts = {
      reasoning: new ProviderContext({
        ...validation.reasoning,
        tier: 'reasoning',
        endpointOverrides,
      }),
      completion: new ProviderContext({
        ...validation.completion,
        tier: 'completion',
        endpointOverrides,
      }),
      value: new ProviderContext({
        ...validation.value,
        tier: 'value',
        endpointOverrides,
      }),
    }

    // Build model name → { tier, context } lookup.
    // The proxy sets these model names in .claude/settings.json, so they are authoritative
    this.tierMap = new Map()
    this.normalizedTierMap = new Map()
    for (const [tier, ctx] of Object.entries(this.contexts)) {
      if (ctx.model) {
        const normalizedModel = ctx.model.toLowerCase()
        const existing = this.normalizedTierMap.get(normalizedModel)
        if (existing) {
          throw new Error(
            `[ProviderRouter] Model "${ctx.model}" is assigned to multiple mixed-provider tiers (${existing.tier}, ${tier})`
          )
        }

        const entry = { tier, context: ctx }
        this.tierMap.set(ctx.model, entry)
        this.normalizedTierMap.set(normalizedModel, entry)
      }
    }
  }

  /**
   * Given a model name from an incoming request, resolve which ProviderContext to use.
   *
   * @param {string} modelName - The model name from payload.model
   * @returns {{ tier: string, context: ProviderContext } | null} Resolved context, or null if not found
   */
  resolve(modelName) {
    if (!modelName) return null

    // Exact match first (most common case — proxy set these names)
    const exact = this.tierMap.get(modelName)
    if (exact) return exact

    return this.normalizedTierMap.get(modelName.toLowerCase()) || null
  }

  /**
   * Get the ProviderContext for a specific tier directly.
   *
   * @param {'reasoning' | 'completion' | 'value'} tier
   * @returns {ProviderContext}
   */
  getContextForTier(tier) {
    return this.contexts[tier] || null
  }

  /**
   * Smart key validation: every routed context must carry the key it will use.
   *
   * @returns {{ valid: boolean, missing: string[], uniqueProviders: string[] }}
   */
  validate() {
    const uniqueProviders = new Set()
    const missing = []

    for (const [tier, ctx] of Object.entries(this.contexts)) {
      uniqueProviders.add(ctx.providerId)
      if (!ctx.key) {
        missing.push(`${tier}:${ctx.providerId}`)
      }
    }

    return {
      valid: missing.length === 0,
      missing,
      uniqueProviders: [...uniqueProviders],
    }
  }

  /**
   * Returns a safe (redacted) representation of the full router state for logging.
   * @returns {object}
   */
  toDebugObject() {
    return {
      reasoning: this.contexts.reasoning.toDebugObject(),
      completion: this.contexts.completion.toDebugObject(),
      value: this.contexts.value.toDebugObject(),
      tierMapSize: this.tierMap.size,
      models: [...this.tierMap.keys()],
    }
  }
}

/**
 * Parse and construct a ProviderRouter from the MIXED_PROVIDERS_CONFIG env var.
 * Returns null if the env var is absent, empty, or malformed (graceful fallback).
 *
 * @param {Object} [env=process.env] - Environment-like object to read from
 * @param {Object<string,string>} [endpointOverrides={}] - Optional endpoint kind overrides
 * @returns {ProviderRouter | null}
 */
export function createRouterFromEnv(env = process.env, endpointOverrides = {}) {
  const raw = env.MIXED_PROVIDERS_CONFIG
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    const config = normalizeMixedProviderConfig(parsed)
    if (config.enabled === false) {
      console.log('[ProviderRouter] Mixed provider config disabled; using single-provider mode')
      return null
    }
    if (config.errors) {
      throw new Error(
        `[ProviderRouter] Invalid MIXED_PROVIDERS_CONFIG: ${config.errors.join('; ')}`
      )
    }

    const router = new ProviderRouter(config, endpointOverrides)
    const validation = router.validate()

    if (!validation.valid) {
      throw new Error(
        `[ProviderRouter] Missing API keys for mixed-provider tiers: ${validation.missing.join(', ')}`
      )
    }

    if (env.DEBUG || env.debug) {
      console.log('[ProviderRouter] Initialized:', JSON.stringify(router.toDebugObject(), null, 2))
    } else {
      console.log(
        `[ProviderRouter] Mixed mode active: ${validation.uniqueProviders.length} unique providers, ` +
        `models: [${[...router.tierMap.keys()].join(', ')}]`
      )
    }

    return router
  } catch (err) {
    throw new Error(`[ProviderRouter] Failed to initialize MIXED_PROVIDERS_CONFIG: ${err.message}`)
  }
}
