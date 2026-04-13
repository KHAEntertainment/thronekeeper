import { z } from 'zod'
import { ProviderMapSchema } from './messages'

/**
 * Configuration Schema Definitions
 * 
 * These schemas enforce contracts for VS Code configuration settings
 * and ensure consistency between workspace/global scopes.
 * 
 * Schema Version: 1.1.0
 * Last Updated: 2026-04-12
 */

// ============================================================================
// Core Configuration Types
// ============================================================================

/**
 * Provider ID (built-in providers)
 */
export const ProviderIdSchema = z.enum([
  'openrouter',
  'openai',
  'together',
  'deepseek',
  'glm',
  'custom'
])

export type ProviderId = z.infer<typeof ProviderIdSchema>

/**
 * Configuration target (workspace vs global)
 */
export const ConfigurationTargetSchema = z.enum(['workspace', 'global'])

export type ConfigurationTarget = z.infer<typeof ConfigurationTargetSchema>

/**
 * Custom endpoint kind
 */
export const CustomEndpointKindSchema = z.enum(['auto', 'openai', 'anthropic'])

export type CustomEndpointKind = z.infer<typeof CustomEndpointKindSchema>

// ============================================================================
// KHA-267: Mixed Provider Types
// ============================================================================

/**
 * Per-tier provider binding — maps a single tier to a specific provider + model.
 * Used in mixed-provider mode to allow each model tier (Opus/Sonnet/Haiku) to
 * route to a different upstream API provider.
 */
export const TierProviderBindingSchema = z.object({
  providerId: z.string(),      // e.g., 'glm', 'minimax', 'kimi', 'custom'
  baseUrl: z.string(),         // Upstream base URL for this provider
  model: z.string(),           // Model ID at the upstream provider (without namespace)
  displayModel: z.string().optional(),  // Namespaced display name (e.g., 'glm/glm-5.1')
  endpointKind: z.enum(['auto', 'openai', 'anthropic', 'openai-compatible', 'anthropic-native']).optional(),
})

export type TierProviderBinding = z.infer<typeof TierProviderBindingSchema>

/**
 * Mixed-provider configuration — enables per-tier provider routing.
 * When enabled, each model tier (reasoning/completion/value) can be served by
 * a different API provider with its own base URL, API key, and endpoint kind.
 */
export const MixedProviderConfigSchema = z.object({
  enabled: z.boolean().default(false),
  reasoning: TierProviderBindingSchema,
  completion: TierProviderBindingSchema,
  value: TierProviderBindingSchema,
})

export type MixedProviderConfig = z.infer<typeof MixedProviderConfigSchema>

// ============================================================================
// VS Code Configuration Schema
// ============================================================================

/**
 * Complete Claude Throne configuration structure
 * 
 * This schema represents the full configuration stored in VS Code settings.
 * It includes both the new provider-scoped format and legacy global keys.
 */
export const ClaudeThroneConfigSchema = z.object({
  // Provider configuration
  provider: z.string().default('openrouter'),
  selectedCustomProviderId: z.string().optional(),
  customBaseUrl: z.string().optional(),
  customEndpointKind: CustomEndpointKindSchema.default('auto'),
  
  // Model selections (provider-scoped - NEW FORMAT)
  modelSelectionsByProvider: z.record(z.string(), ProviderMapSchema).default({}),
  
  // Legacy global model keys (for backward compatibility and fallback)
  reasoningModel: z.string().optional(),
  completionModel: z.string().optional(),
  valueModel: z.string().optional(),
  
  // Two-model mode
  twoModelMode: z.boolean().default(false),
  
  // Proxy configuration
  proxy: z.object({
    port: z.number().default(3000),
    debug: z.boolean().default(false)
  }).default({ port: 3000, debug: false }),
  
  // Apply behavior
  autoApply: z.boolean().default(true),
  applyScope: ConfigurationTargetSchema.default('workspace'),
  
  // Anthropic defaults cache
  anthropicDefaults: z.any().optional(),
  anthropicDefaultsTimestamp: z.number().default(0),
  
  // Saved combos and custom providers
  savedCombos: z.array(z.object({
    name: z.string(),
    reasoning: z.string(),
    completion: z.string(),
    value: z.string().optional()
  })).default([]),
  
  customProviders: z.array(z.object({
    id: z.string(),
    name: z.string(),
    baseUrl: z.string()
  })).default([]),
  
  // Comment 19: Feature flags (for gradual rollout and emergency rollback)
  featureFlags: z.object({
    enableSchemaValidation: z.boolean().default(true),
    enableTokenValidation: z.boolean().default(true),
    enableKeyNormalization: z.boolean().default(true),
    enablePreApplyHydration: z.boolean().default(true),
    enableAnthropicDirectApply: z.boolean().default(false), // Comment 10: Gate deprecated feature
    enableAgentTeams: z.boolean().default(false), // KHA-269: Agent Teams feature flag
    enableMixedProviders: z.boolean().default(false), // KHA-267: Mixed provider mode
  }).optional(),
  
  // KHA-267: Mixed provider configuration (null = single-provider mode)
  mixedProviders: MixedProviderConfigSchema.optional().nullable(),
})

export type ClaudeThroneConfig = z.infer<typeof ClaudeThroneConfigSchema>

// ============================================================================
// Hydration & Normalization Helpers
// ============================================================================

/**
 * Canonicalize a provider map to ensure `reasoning`, `completion`, and `value` keys are present.
 *
 * @param map - Provider map that may include legacy keys (e.g., `coding`)
 * @returns An object with `reasoning`, `completion`, and `value` strings
 */
export function normalizeProviderMap(map: any): {
  reasoning: string
  completion: string
  value: string
} {
  return {
    reasoning: map?.reasoning || '',
    completion: map?.completion || map?.coding || '',  // Fallback to legacy key
    value: map?.value || ''
  }
}

/**
 * Derives global model keys from the specified provider's model selections.
 *
 * @param config - Full Claude Throne configuration to read provider-specific mappings and legacy global keys from
 * @param providerId - Active provider identifier whose model selections should be used
 * @returns An object with `reasoningModel`, `completionModel`, and `valueModel` taken from the provider map when present, or from legacy global keys as a fallback
 */
export function hydrateGlobalKeysFromProvider(
  config: ClaudeThroneConfig,
  providerId: string
): {
  reasoningModel: string
  completionModel: string
  valueModel: string
} {
  const providerMap = config.modelSelectionsByProvider?.[providerId]
  
  if (providerMap) {
    const normalized = normalizeProviderMap(providerMap)
    return {
      reasoningModel: normalized.reasoning,
      completionModel: normalized.completion,
      valueModel: normalized.value
    }
  }
  
  // Fallback to existing global keys if provider-specific not found
  return {
    reasoningModel: config.reasoningModel || '',
    completionModel: config.completionModel || '',
    valueModel: config.valueModel || ''
  }
}

/**
 * Determine whether legacy global model keys should be migrated into the provider-specific map.
 *
 * @param config - The full ClaudeThrone configuration object
 * @param providerId - The active provider identifier to check within `modelSelectionsByProvider`
 * @returns `true` if legacy global model keys exist and the provider-specific map lacks reasoning/completion models, `false` otherwise
 */
export function needsFallbackHydration(
  config: ClaudeThroneConfig,
  providerId: string
): boolean {
  const providerMap = config.modelSelectionsByProvider?.[providerId]
  const hasGlobalKeys = !!(config.reasoningModel || config.completionModel)
  const hasProviderMap = !!(providerMap?.reasoning || providerMap?.completion)
  
  return hasGlobalKeys && !hasProviderMap
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate and parse a raw configuration object against the ClaudeThroneConfig schema.
 *
 * @param config - The raw configuration to validate and parse
 * @returns The validated configuration as a `ClaudeThroneConfig`
 * @throws ZodError if the provided configuration does not conform to the schema
 */
export function validateConfig(config: unknown): ClaudeThroneConfig {
  return ClaudeThroneConfigSchema.parse(config)
}

/**
 * Validate a configuration and fall back to the schema's defaults when validation fails.
 *
 * Attempts to parse `config` with ClaudeThroneConfigSchema; if parsing fails, logs a warning
 * and returns the schema's default configuration.
 *
 * @returns A `ClaudeThroneConfig` parsed from `config` when valid; otherwise the schema's default configuration.
 */
export function safeValidateConfig(config: unknown): ClaudeThroneConfig {
  try {
    return ClaudeThroneConfigSchema.parse(config)
  } catch (error) {
    // Return default configuration if validation fails
    console.warn('[Config Validation] Using default configuration due to validation errors:', error)
    return ClaudeThroneConfigSchema.parse({})
  }
}

/**
 * Validate and parse a provider model-selection map.
 *
 * @param map - The unvalidated provider map to check and parse
 * @returns The validated provider map object conforming to ProviderMapSchema
 * @throws ZodError if `map` does not conform to ProviderMapSchema
 */
export function validateProviderMap(map: unknown): z.infer<typeof ProviderMapSchema> {
  return ProviderMapSchema.parse(map)
}

// ============================================================================
// Configuration Invariant Checks
// ============================================================================

/**
 * Identify invariant violations in a Claude Throne configuration.
 *
 * @param config - The Claude Throne configuration to validate.
 * @returns An array of human-readable violation messages, empty if no violations.
 */
export function checkConfigurationInvariants(
  config: ClaudeThroneConfig
): string[] {
  const violations: string[] = []
  
  // Check 1: Verify completion key usage (not coding)
  for (const [providerId, providerMap] of Object.entries(config.modelSelectionsByProvider || {})) {
    if (providerMap.coding && !providerMap.completion) {
      violations.push(
        `Provider '${providerId}' uses legacy 'coding' key without 'completion'. ` +
        `This violates the canonical storage invariant.`
      )
    }
  }
  
  // Check 2: Verify active provider has configuration
  const activeProvider = config.provider || 'openrouter'
  const activeProviderMap = config.modelSelectionsByProvider?.[activeProvider]
  
  if (!activeProviderMap || (!activeProviderMap.reasoning && !config.reasoningModel)) {
    violations.push(
      `Active provider '${activeProvider}' has no model selections. ` +
      `This may cause proxy start failures.`
    )
  }
  
  // Check 3: Verify two-model mode has all required models
  if (config.twoModelMode) {
    const normalized = normalizeProviderMap(activeProviderMap)
    if (!normalized.completion || !normalized.value) {
      violations.push(
        `Two-model mode enabled but provider '${activeProvider}' is missing completion or value models.`
      )
    }
  }
  
  // Check 4 (KHA-267): Verify mixed-provider config consistency
  if (config.mixedProviders?.enabled) {
    const mp = config.mixedProviders
    const tiers = ['reasoning', 'completion', 'value'] as const
    for (const tier of tiers) {
      const binding = mp[tier]
      if (!binding?.providerId) {
        violations.push(
          `Mixed provider mode enabled but '${tier}' tier has no providerId.`
        )
      }
      if (!binding?.model) {
        violations.push(
          `Mixed provider mode enabled but '${tier}' tier has no model.`
        )
      }
      if (!binding?.baseUrl) {
        violations.push(
          `Mixed provider mode enabled but '${tier}' tier has no baseUrl.`
        )
      }
    }
    
    // Verify mixed mode requires twoModelMode to be enabled
    if (!config.twoModelMode) {
      violations.push(
        `Mixed provider mode requires '3 Different Models' mode to be enabled.`
      )
    }
  }
  
  return violations
}