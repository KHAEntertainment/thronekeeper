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
  detectProvider,
  resolveApiKey,
  providerSpecificHeaders,
  inferEndpointKindSync,
  ENDPOINT_KIND,
} from './key-resolver.js'

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
    if (endpointKind) {
      if (endpointKind === 'anthropic' || endpointKind === 'anthropic-native') {
        this.endpointKind = ENDPOINT_KIND.ANTHROPIC_NATIVE
      } else if (endpointKind === 'openai' || endpointKind === 'openai-compatible') {
        this.endpointKind = ENDPOINT_KIND.OPENAI_COMPATIBLE
      } else {
        this.endpointKind = inferEndpointKindSync(providerId, baseUrl, endpointOverrides)
      }
    } else {
      this.endpointKind = inferEndpointKindSync(providerId, baseUrl, endpointOverrides)
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

    this.contexts = {
      reasoning: new ProviderContext({
        ...config.reasoning,
        tier: 'reasoning',
        endpointOverrides,
      }),
      completion: new ProviderContext({
        ...config.completion,
        tier: 'completion',
        endpointOverrides,
      }),
      value: new ProviderContext({
        ...config.value,
        tier: 'value',
        endpointOverrides,
      }),
    }

    // Build model name → { tier, context } lookup
    // The proxy sets these model names in .claude/settings.json, so they are authoritative
    this.tierMap = new Map()
    for (const [tier, ctx] of Object.entries(this.contexts)) {
      if (ctx.model) {
        this.tierMap.set(ctx.model, { tier, context: ctx })
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

    // Fallback: case-insensitive match
    const lower = modelName.toLowerCase()
    for (const [name, entry] of this.tierMap) {
      if (name.toLowerCase() === lower) return entry
    }

    return null
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
   * Smart key validation: check that every unique provider ID has a key stored.
   * If two tiers share the same provider, only one key is needed.
   *
   * @returns {{ valid: boolean, missing: string[], uniqueProviders: string[] }}
   */
  validate() {
    const uniqueProviders = new Set()
    const providerToKey = new Map()

    for (const ctx of Object.values(this.contexts)) {
      uniqueProviders.add(ctx.providerId)
      if (ctx.key) {
        providerToKey.set(ctx.providerId, true)
      }
    }

    const missing = []
    for (const pid of uniqueProviders) {
      if (!providerToKey.has(pid)) {
        missing.push(pid)
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
    const config = JSON.parse(raw)
    const router = new ProviderRouter(config, endpointOverrides)
    const validation = router.validate()

    if (!validation.valid) {
      console.error(
        `[ProviderRouter] Missing API keys for providers: ${validation.missing.join(', ')}`
      )
      console.error(
        '[ProviderRouter] Mixed provider mode requires stored keys for all unique providers.'
      )
    }

    if (process.env.DEBUG) {
      console.log('[ProviderRouter] Initialized:', JSON.stringify(router.toDebugObject(), null, 2))
    } else {
      console.log(
        `[ProviderRouter] Mixed mode active: ${validation.uniqueProviders.length} unique providers, ` +
        `models: [${[...router.tierMap.keys()].join(', ')}]`
      )
    }

    return router
  } catch (err) {
    console.warn(
      '[ProviderRouter] Failed to parse MIXED_PROVIDERS_CONFIG, falling back to single-provider mode:',
      err.message
    )
    return null
  }
}
