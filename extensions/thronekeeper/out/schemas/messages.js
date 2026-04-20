"use strict";
/**
 * Message Schema Definitions for Webview ↔ Extension Communication
 *
 * These schemas enforce contracts between the webview (main.js) and extension (PanelViewProvider.ts)
 * to prevent race conditions, stale data rendering, and configuration mismatches.
 *
 * Schema Version: 1.1.0
 * Last Updated: 2026-04-12
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebviewToExtensionMessageSchema = exports.OpenExternalMessageSchema = exports.SimpleUpdateMessageSchema = exports.SimpleRequestMessageSchema = exports.DeleteCustomProviderMessageSchema = exports.SaveCustomProviderMessageSchema = exports.DeleteComboMessageSchema = exports.SaveComboMessageSchema = exports.SaveMixedProvidersMessageSchema = exports.ToggleOpusPlanMessageSchema = exports.ToggleTwoModelModeMessageSchema = exports.ToggleThreeModelModeMessageSchema = exports.RevertApplyMessageSchema = exports.StopProxyMessageSchema = exports.ProxyControlMessageSchema = exports.StoreKeyMessageSchema = exports.UpdateProviderMessageSchema = exports.SaveModelsMessageSchema = exports.RequestModelsMessageSchema = exports.ExtensionToWebviewMessageSchema = exports.ErrorMessageSchema = exports.ErrorMessagePayloadSchema = exports.CustomProvidersLoadedMessageSchema = exports.CombosLoadedMessageSchema = exports.ModelsSavedMessageSchema = exports.KeyStoredMessageSchema = exports.KeysLoadedMessageSchema = exports.PopularModelsMessageSchema = exports.ConfigLoadedMessageSchema = exports.ModelsLoadedMessageSchema = exports.StatusMessageSchema = exports.ModelComboSchema = exports.CustomProviderSchema = exports.ModelInfoSchema = exports.ProviderMapSchema = void 0;
exports.normalizeMessageType = normalizeMessageType;
exports.validateExtensionMessage = validateExtensionMessage;
exports.validateWebviewMessage = validateWebviewMessage;
exports.safeValidateMessage = safeValidateMessage;
const zod_1 = require("zod");
const config_1 = require("./config");
var config_2 = require("./config");
Object.defineProperty(exports, "ProviderMapSchema", { enumerable: true, get: function () { return config_2.ProviderMapSchema; } });
// ============================================================================
// Legacy Message Type Normalization
// ============================================================================
/**
 * Maps legacy message types to their canonical equivalents
 */
const LEGACY_TYPE_MAP = {
    'keys': 'keysLoaded',
    'anthropicKeyStored': 'keyStored',
    'comboDeleted': 'combosLoaded',
    'customProviderDeleted': 'customProvidersLoaded',
    'modelsError': 'proxyError',
    'listPublicModels': 'requestModels',
    'listFreeModels': 'requestModels',
    'storeAnthropicKey': 'storeKey',
    'stopProxy': 'proxyControl',
    'revertApply': 'proxyControl',
    'deleteCombo': 'saveCombo',
    'deleteCustomProvider': 'saveCustomProvider'
};
/**
 * Normalizes legacy message types to canonical types before validation
 * Use this when receiving messages from the webview or untrusted sources
 */
function normalizeMessageType(message) {
    if (!message || typeof message !== 'object' || !message.type) {
        return message;
    }
    const canonicalType = LEGACY_TYPE_MAP[message.type];
    if (canonicalType) {
        return { ...message, type: canonicalType };
    }
    return message;
}
// ============================================================================
// Core Data Types
// ============================================================================
/**
 * Model information structure
 */
exports.ModelInfoSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    provider: zod_1.z.string(),
    context_length: zod_1.z.number().optional(),
    pricing: zod_1.z.object({
        prompt: zod_1.z.string(),
        completion: zod_1.z.string()
    }).optional()
});
/**
 * Custom provider definition
 */
exports.CustomProviderSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    baseUrl: zod_1.z.string().url()
});
/**
 * Model combo (saved pairing)
 */
exports.ModelComboSchema = zod_1.z.object({
    name: zod_1.z.string(),
    reasoning: zod_1.z.string(),
    completion: zod_1.z.string(),
    value: zod_1.z.string().optional()
});
// ============================================================================
// Extension → Webview Messages
// ============================================================================
/**
 * Status update message
 */
exports.StatusMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('status'),
    payload: zod_1.z.object({
        running: zod_1.z.boolean(),
        port: zod_1.z.number().optional(),
        reasoningModel: zod_1.z.string().optional(),
        completionModel: zod_1.z.string().optional(),
        valueModel: zod_1.z.string().optional()
    })
});
/**
 * Models loaded message (with provider and token for race protection)
 */
exports.ModelsLoadedMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('models'),
    payload: zod_1.z.object({
        models: zod_1.z.array(exports.ModelInfoSchema),
        provider: zod_1.z.string(), // REQUIRED: Must match current provider to render
        token: zod_1.z.string().optional(), // OPTIONAL: Sequence token for late response detection
        freeOnly: zod_1.z.boolean().optional()
    })
});
/**
 * Configuration loaded message
 */
exports.ConfigLoadedMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('config'),
    payload: zod_1.z.object({
        provider: zod_1.z.string(),
        selectedCustomProviderId: zod_1.z.string().optional(),
        twoModelMode: zod_1.z.boolean(),
        port: zod_1.z.number(),
        customBaseUrl: zod_1.z.string().optional(),
        debug: zod_1.z.boolean(),
        cacheAgeDays: zod_1.z.number().optional(),
        cacheStale: zod_1.z.boolean().optional(),
        cachedDefaults: zod_1.z.any().optional(),
        modelSelectionsByProvider: zod_1.z.record(zod_1.z.string(), config_1.ProviderMapSchema),
        // Legacy global keys for fallback hydration
        reasoningModel: zod_1.z.string().optional(),
        completionModel: zod_1.z.string().optional(),
        valueModel: zod_1.z.string().optional(),
        // Feature flags for webview behavior
        featureFlags: zod_1.z.any().optional(),
        // KHA-267: Mixed provider configuration
        mixedProviders: config_1.MixedProviderConfigSchema.optional().nullable(),
    })
});
/**
 * Popular models loaded message
 */
exports.PopularModelsMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('popularModels'),
    payload: zod_1.z.object({
        pairings: zod_1.z.array(exports.ModelComboSchema),
        savedCombos: zod_1.z.array(exports.ModelComboSchema),
        currentReasoning: zod_1.z.string().optional(),
        currentCompletion: zod_1.z.string().optional()
    })
});
/**
 * Keys loaded message
 */
exports.KeysLoadedMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('keysLoaded'),
    payload: zod_1.z.union([
        zod_1.z.object({
            keyStatus: zod_1.z.record(zod_1.z.string(), zod_1.z.boolean()).optional()
        }),
        zod_1.z.record(zod_1.z.string(), zod_1.z.boolean())
    ]) // Support both formats for backward compatibility
});
/**
 * Key stored confirmation message
 */
exports.KeyStoredMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('keyStored'),
    payload: zod_1.z.object({
        provider: zod_1.z.string().optional(),
        success: zod_1.z.boolean(),
        error: zod_1.z.string().optional()
    })
});
/**
 * Models saved confirmation message
 */
exports.ModelsSavedMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('modelsSaved'),
    payload: zod_1.z.object({
        providerId: zod_1.z.string(), // REQUIRED: Provider these models belong to
        success: zod_1.z.boolean(),
        scope: zod_1.z.string().optional(),
        runtimeProvider: zod_1.z.string().optional(),
        configProvider: zod_1.z.string().optional()
    })
});
/**
 * Combos loaded message (single type, uses deletedId to signal deletion)
 */
exports.CombosLoadedMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('combosLoaded'),
    payload: zod_1.z.object({
        combos: zod_1.z.array(exports.ModelComboSchema),
        deletedId: zod_1.z.string().optional() // Present when a combo was deleted
    })
});
/**
 * Custom providers loaded message (single type, uses deletedId to signal deletion)
 */
exports.CustomProvidersLoadedMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('customProvidersLoaded'),
    payload: zod_1.z.object({
        providers: zod_1.z.array(exports.CustomProviderSchema),
        deletedId: zod_1.z.string().optional() // Present when a provider was deleted
    })
});
/**
 * Error message payload schema (structured format)
 * Comment 1: Unified error payload structure with provider, error, errorType, and optional token
 */
exports.ErrorMessagePayloadSchema = zod_1.z.object({
    provider: zod_1.z.string(), // REQUIRED: Provider where error occurred
    error: zod_1.z.string(), // Error message
    errorType: zod_1.z.string(), // Error category (timeout, rate_limited, upstream_error, connection, config, generic)
    token: zod_1.z.string().optional(), // OPTIONAL: Sequence token for request matching
    traceId: zod_1.z.string().optional(), // OPTIONAL: Trace ID for DEBUG mode tracking
    canManuallyEnter: zod_1.z.boolean().optional() // OPTIONAL: Whether manual entry is available
});
/**
 * Error message
 * Comment 1: Always use structured payload format (never plain strings)
 */
exports.ErrorMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('proxyError'),
    payload: exports.ErrorMessagePayloadSchema // Always structured, never plain string
});
// Union of all extension → webview messages
exports.ExtensionToWebviewMessageSchema = zod_1.z.discriminatedUnion('type', [
    exports.StatusMessageSchema,
    exports.ModelsLoadedMessageSchema,
    exports.ConfigLoadedMessageSchema,
    exports.PopularModelsMessageSchema,
    exports.KeysLoadedMessageSchema,
    exports.KeyStoredMessageSchema,
    exports.ModelsSavedMessageSchema,
    exports.CombosLoadedMessageSchema,
    exports.CustomProvidersLoadedMessageSchema,
    exports.ErrorMessageSchema
]);
// ============================================================================
// Webview → Extension Messages
// ============================================================================
/**
 * Request models message (with optional token for response matching)
 */
exports.RequestModelsMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('requestModels'),
    provider: zod_1.z.string().optional(),
    token: zod_1.z.string().optional() // Sequence token to match with response
});
/**
 * Save models message (must include providerId)
 * Comment 5: Only accepts 'completion' key (canonical storage) - legacy 'coding' deprecated
 */
exports.SaveModelsMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('saveModels'),
    providerId: zod_1.z.string(), // REQUIRED: Avoid ambiguity and races
    reasoning: zod_1.z.string(),
    completion: zod_1.z.string(), // Canonical key for coding/completion model
    value: zod_1.z.string()
});
/**
 * Update provider message
 */
exports.UpdateProviderMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('updateProvider'),
    provider: zod_1.z.string()
});
/**
 * Store key message
 */
exports.StoreKeyMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('storeKey'),
    provider: zod_1.z.string().optional(),
    key: zod_1.z.string()
});
/**
 * Start/Stop proxy messages
 */
exports.ProxyControlMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('startProxy')
});
/**
 * Stop proxy message
 */
exports.StopProxyMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('stopProxy')
});
/**
 * Revert apply message
 */
exports.RevertApplyMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('revertApply')
});
/**
 * Toggle three-model mode message (canonical)
 */
exports.ToggleThreeModelModeMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('toggleThreeModelMode'),
    enabled: zod_1.z.boolean()
});
/**
 * Toggle two-model mode message (legacy alias)
 */
exports.ToggleTwoModelModeMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('toggleTwoModelMode'),
    enabled: zod_1.z.boolean()
});
/**
 * Toggle OpusPlan mode message
 */
exports.ToggleOpusPlanMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('toggleOpusPlan'),
    enabled: zod_1.z.boolean()
});
/**
 * KHA-267: Save mixed provider configuration
 * Sent when user configures per-tier provider bindings in mixed mode.
 */
exports.SaveMixedProvidersMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('saveMixedProviders'),
    enabled: zod_1.z.boolean(),
    reasoning: config_1.TierProviderBindingSchema,
    completion: config_1.TierProviderBindingSchema,
    value: config_1.TierProviderBindingSchema,
});
/**
 * Save combo message
 */
exports.SaveComboMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('saveCombo'),
    name: zod_1.z.string().optional(),
    reasoningModel: zod_1.z.string().optional(),
    codingModel: zod_1.z.string().optional(),
    valueModel: zod_1.z.string().optional(),
    providerId: zod_1.z.string().optional() // Provider ID to avoid race conditions with currentProvider
});
/**
 * Delete combo message
 */
exports.DeleteComboMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('deleteCombo'),
    index: zod_1.z.number()
});
/**
 * Save custom provider message
 */
exports.SaveCustomProviderMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('saveCustomProvider'),
    name: zod_1.z.string(),
    baseUrl: zod_1.z.string(),
    id: zod_1.z.string()
});
/**
 * Delete custom provider message
 */
exports.DeleteCustomProviderMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('deleteCustomProvider'),
    id: zod_1.z.string()
});
/**
 * Simple request messages (no payload)
 */
exports.SimpleRequestMessageSchema = zod_1.z.object({
    type: zod_1.z.enum([
        'webviewReady',
        'requestStatus',
        'requestKeys',
        'requestConfig',
        'requestPopularModels',
        'requestCustomProviders',
        'openSettings',
        'refreshAnthropicDefaults'
    ])
});
/**
 * Update messages with simple payloads
 */
exports.SimpleUpdateMessageSchema = zod_1.z.discriminatedUnion('type', [
    zod_1.z.object({
        type: zod_1.z.literal('updateCustomBaseUrl'),
        url: zod_1.z.string()
    }),
    zod_1.z.object({
        type: zod_1.z.literal('updatePort'),
        port: zod_1.z.number()
    }),
    zod_1.z.object({
        type: zod_1.z.literal('updateDebug'),
        enabled: zod_1.z.boolean()
    }),
    zod_1.z.object({
        type: zod_1.z.literal('updateEndpointKind'),
        baseUrl: zod_1.z.string(),
        endpointKind: zod_1.z.enum(['auto', 'openai', 'anthropic'])
    }),
    zod_1.z.object({
        // KHA-269: Feature flag update message
        type: zod_1.z.literal('updateFeatureFlag'),
        flag: zod_1.z.enum(['enableAgentTeams', 'enableMixedProviders']),
        value: zod_1.z.boolean()
    })
]);
/**
 * Open external URL message
 */
exports.OpenExternalMessageSchema = zod_1.z.object({
    type: zod_1.z.literal('openExternal'),
    url: zod_1.z.string().url()
});
// Union of all webview → extension messages
exports.WebviewToExtensionMessageSchema = zod_1.z.union([
    exports.RequestModelsMessageSchema,
    exports.SaveModelsMessageSchema,
    exports.UpdateProviderMessageSchema,
    exports.StoreKeyMessageSchema,
    exports.ProxyControlMessageSchema,
    exports.StopProxyMessageSchema,
    exports.RevertApplyMessageSchema,
    exports.ToggleThreeModelModeMessageSchema,
    exports.ToggleTwoModelModeMessageSchema,
    exports.ToggleOpusPlanMessageSchema,
    exports.SaveMixedProvidersMessageSchema,
    exports.SaveComboMessageSchema,
    exports.DeleteComboMessageSchema,
    exports.SaveCustomProviderMessageSchema,
    exports.DeleteCustomProviderMessageSchema,
    exports.SimpleRequestMessageSchema,
    exports.SimpleUpdateMessageSchema,
    exports.OpenExternalMessageSchema
]);
// ============================================================================
// Validation Functions
// ============================================================================
/**
 * Validate and parse a value as an extension→webview message.
 *
 * @param message - The input value to validate as an extension→webview message
 * @returns The validated message as an ExtensionToWebviewMessage
 * @throws ZodError if validation fails
 */
function validateExtensionMessage(message) {
    return exports.ExtensionToWebviewMessageSchema.parse(message);
}
/**
 * Validate a message sent from the webview to the extension.
 *
 * @returns The validated `WebviewToExtensionMessage`.
 * @throws ZodError if the message does not match the schema
 */
function validateWebviewMessage(message) {
    return exports.WebviewToExtensionMessageSchema.parse(message);
}
/**
 * Validate a message against the appropriate schema and return the parsed value or null on validation failure.
 *
 * Uses `direction` to choose the schema: `'toWebview'` validates as an Extension→Webview message, `'toExtension'` validates as a Webview→Extension message. When validation fails, Zod validation details are forwarded to `logger` if provided and the function returns `null`.
 *
 * @param message - The value to validate
 * @param direction - Which schema to validate against: `'toWebview'` or `'toExtension'`
 * @param logger - Optional function that receives validation details when validation fails
 * @returns The validated message (`ExtensionToWebviewMessage` or `WebviewToExtensionMessage`) if valid, `null` otherwise
 */
function safeValidateMessage(message, direction, logger) {
    try {
        if (direction === 'toWebview') {
            return validateExtensionMessage(message);
        }
        else {
            return validateWebviewMessage(message);
        }
    }
    catch (error) {
        if (logger && error instanceof zod_1.z.ZodError) {
            const errorDetails = 'issues' in error ? error.issues : [];
            logger(`[Schema Validation Error] Invalid ${direction} message: ${JSON.stringify(errorDetails)}`);
            logger(`[Schema Validation Error] Rejected message: ${JSON.stringify(message)}`);
        }
        return null;
    }
}
//# sourceMappingURL=messages.js.map