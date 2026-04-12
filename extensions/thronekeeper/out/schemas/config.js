"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeThroneConfigSchema = exports.CustomEndpointKindSchema = exports.ConfigurationTargetSchema = exports.ProviderIdSchema = void 0;
exports.normalizeProviderMap = normalizeProviderMap;
exports.hydrateGlobalKeysFromProvider = hydrateGlobalKeysFromProvider;
exports.needsFallbackHydration = needsFallbackHydration;
exports.validateConfig = validateConfig;
exports.safeValidateConfig = safeValidateConfig;
exports.validateProviderMap = validateProviderMap;
exports.checkConfigurationInvariants = checkConfigurationInvariants;
const zod_1 = require("zod");
const messages_1 = require("./messages");
/**
 * Configuration Schema Definitions
 *
 * These schemas enforce contracts for VS Code configuration settings
 * and ensure consistency between workspace/global scopes.
 *
 * Schema Version: 1.0.0
 * Last Updated: 2025-10-28
 */
// ============================================================================
// Core Configuration Types
// ============================================================================
/**
 * Provider ID (built-in providers)
 */
exports.ProviderIdSchema = zod_1.z.enum([
    'openrouter',
    'openai',
    'together',
    'deepseek',
    'glm',
    'custom'
]);
/**
 * Configuration target (workspace vs global)
 */
exports.ConfigurationTargetSchema = zod_1.z.enum(['workspace', 'global']);
/**
 * Custom endpoint kind
 */
exports.CustomEndpointKindSchema = zod_1.z.enum(['auto', 'openai', 'anthropic']);
// ============================================================================
// VS Code Configuration Schema
// ============================================================================
/**
 * Complete Claude Throne configuration structure
 *
 * This schema represents the full configuration stored in VS Code settings.
 * It includes both the new provider-scoped format and legacy global keys.
 */
exports.ClaudeThroneConfigSchema = zod_1.z.object({
    // Provider configuration
    provider: zod_1.z.string().default('openrouter'),
    selectedCustomProviderId: zod_1.z.string().optional(),
    customBaseUrl: zod_1.z.string().optional(),
    customEndpointKind: exports.CustomEndpointKindSchema.default('auto'),
    // Model selections (provider-scoped - NEW FORMAT)
    modelSelectionsByProvider: zod_1.z.record(zod_1.z.string(), messages_1.ProviderMapSchema).default({}),
    // Legacy global model keys (for backward compatibility and fallback)
    reasoningModel: zod_1.z.string().optional(),
    completionModel: zod_1.z.string().optional(),
    valueModel: zod_1.z.string().optional(),
    // Two-model mode
    twoModelMode: zod_1.z.boolean().default(false),
    // Proxy configuration
    proxy: zod_1.z.object({
        port: zod_1.z.number().default(3000),
        debug: zod_1.z.boolean().default(false)
    }).default({ port: 3000, debug: false }),
    // Apply behavior
    autoApply: zod_1.z.boolean().default(true),
    applyScope: exports.ConfigurationTargetSchema.default('workspace'),
    // Anthropic defaults cache
    anthropicDefaults: zod_1.z.any().optional(),
    anthropicDefaultsTimestamp: zod_1.z.number().default(0),
    // Saved combos and custom providers
    savedCombos: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        reasoning: zod_1.z.string(),
        completion: zod_1.z.string(),
        value: zod_1.z.string().optional()
    })).default([]),
    customProviders: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        name: zod_1.z.string(),
        baseUrl: zod_1.z.string()
    })).default([]),
    // Comment 19: Feature flags (for gradual rollout and emergency rollback)
    featureFlags: zod_1.z.object({
        enableSchemaValidation: zod_1.z.boolean().default(true),
        enableTokenValidation: zod_1.z.boolean().default(true),
        enableKeyNormalization: zod_1.z.boolean().default(true),
        enablePreApplyHydration: zod_1.z.boolean().default(true),
        enableAnthropicDirectApply: zod_1.z.boolean().default(false), // Comment 10: Gate deprecated feature
        enableAgentTeams: zod_1.z.boolean().default(false) // KHA-269: Agent Teams feature flag
    }).optional()
});
// ============================================================================
// Hydration & Normalization Helpers
// ============================================================================
/**
 * Canonicalize a provider map to ensure `reasoning`, `completion`, and `value` keys are present.
 *
 * @param map - Provider map that may include legacy keys (e.g., `coding`)
 * @returns An object with `reasoning`, `completion`, and `value` strings
 */
function normalizeProviderMap(map) {
    return {
        reasoning: map?.reasoning || '',
        completion: map?.completion || map?.coding || '', // Fallback to legacy key
        value: map?.value || ''
    };
}
/**
 * Derives global model keys from the specified provider's model selections.
 *
 * @param config - Full Claude Throne configuration to read provider-specific mappings and legacy global keys from
 * @param providerId - Active provider identifier whose model selections should be used
 * @returns An object with `reasoningModel`, `completionModel`, and `valueModel` taken from the provider map when present, or from legacy global keys as a fallback
 */
function hydrateGlobalKeysFromProvider(config, providerId) {
    const providerMap = config.modelSelectionsByProvider?.[providerId];
    if (providerMap) {
        const normalized = normalizeProviderMap(providerMap);
        return {
            reasoningModel: normalized.reasoning,
            completionModel: normalized.completion,
            valueModel: normalized.value
        };
    }
    // Fallback to existing global keys if provider-specific not found
    return {
        reasoningModel: config.reasoningModel || '',
        completionModel: config.completionModel || '',
        valueModel: config.valueModel || ''
    };
}
/**
 * Determine whether legacy global model keys should be migrated into the provider-specific map.
 *
 * @param config - The full ClaudeThrone configuration object
 * @param providerId - The active provider identifier to check within `modelSelectionsByProvider`
 * @returns `true` if legacy global model keys exist and the provider-specific map lacks reasoning/completion models, `false` otherwise
 */
function needsFallbackHydration(config, providerId) {
    const providerMap = config.modelSelectionsByProvider?.[providerId];
    const hasGlobalKeys = !!(config.reasoningModel || config.completionModel);
    const hasProviderMap = !!(providerMap?.reasoning || providerMap?.completion);
    return hasGlobalKeys && !hasProviderMap;
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
function validateConfig(config) {
    return exports.ClaudeThroneConfigSchema.parse(config);
}
/**
 * Validate a configuration and fall back to the schema's defaults when validation fails.
 *
 * Attempts to parse `config` with ClaudeThroneConfigSchema; if parsing fails, logs a warning
 * and returns the schema's default configuration.
 *
 * @returns A `ClaudeThroneConfig` parsed from `config` when valid; otherwise the schema's default configuration.
 */
function safeValidateConfig(config) {
    try {
        return exports.ClaudeThroneConfigSchema.parse(config);
    }
    catch (error) {
        // Return default configuration if validation fails
        console.warn('[Config Validation] Using default configuration due to validation errors:', error);
        return exports.ClaudeThroneConfigSchema.parse({});
    }
}
/**
 * Validate and parse a provider model-selection map.
 *
 * @param map - The unvalidated provider map to check and parse
 * @returns The validated provider map object conforming to ProviderMapSchema
 * @throws ZodError if `map` does not conform to ProviderMapSchema
 */
function validateProviderMap(map) {
    return messages_1.ProviderMapSchema.parse(map);
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
function checkConfigurationInvariants(config) {
    const violations = [];
    // Check 1: Verify completion key usage (not coding)
    for (const [providerId, providerMap] of Object.entries(config.modelSelectionsByProvider || {})) {
        if (providerMap.coding && !providerMap.completion) {
            violations.push(`Provider '${providerId}' uses legacy 'coding' key without 'completion'. ` +
                `This violates the canonical storage invariant.`);
        }
    }
    // Check 2: Verify active provider has configuration
    const activeProvider = config.provider || 'openrouter';
    const activeProviderMap = config.modelSelectionsByProvider?.[activeProvider];
    if (!activeProviderMap || (!activeProviderMap.reasoning && !config.reasoningModel)) {
        violations.push(`Active provider '${activeProvider}' has no model selections. ` +
            `This may cause proxy start failures.`);
    }
    // Check 3: Verify two-model mode has all required models
    if (config.twoModelMode) {
        const normalized = normalizeProviderMap(activeProviderMap);
        if (!normalized.completion || !normalized.value) {
            violations.push(`Two-model mode enabled but provider '${activeProvider}' is missing completion or value models.`);
        }
    }
    return violations;
}
//# sourceMappingURL=config.js.map