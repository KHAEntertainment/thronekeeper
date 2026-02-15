/**
 * Provider environment builder - builds environment variables for proxy startup.
 * Ported from ProxyManager.ts buildEnvForProvider method.
 */

import { getConfig } from './config.js'
import secrets from './secrets-client.js'
import { getProviderBaseUrl } from './endpoints.js'

/**
 * Built-in provider configurations
 */
const PROVIDER_CONFIGS = {
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    keySource: 'OPENROUTER_API_KEY',
    requiresKey: true,
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    keySource: 'OPENAI_API_KEY',
    requiresKey: true,
  },
  together: {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz',
    keySource: 'TOGETHER_API_KEY',
    requiresKey: true,
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    keySource: 'DEEPSEEK_API_KEY',
    requiresKey: true,
  },
  glm: {
    name: 'GLM (Zhipu AI)',
    baseUrl: 'https://api.z.ai/api/anthropic',
    keySource: 'ZAI_API_KEY',
    secondaryGLM_API_KEYKeySource: '',
    requiresKey: true,
  },
}

/**
 * Get provider configuration
 * @param {string} provider - Provider ID
 * @returns {object|null} Provider config or null if not found
 */
export function getProviderConfig(provider) {
  // Check built-in providers first
  if (PROVIDER_CONFIGS[provider]) {
    return PROVIDER_CONFIGS[provider]
  }
  
  // Check custom providers from config
  const customProviders = getConfig('customProviders') || []
  const customProvider = customProviders.find(p => p.id === provider)
  
  if (customProvider) {
    return {
      name: customProvider.name,
      baseUrl: customProvider.baseUrl,
      keySource: 'API_KEY',
      requiresKey: true,
      isCustom: true,
    }
  }
  
  return null
}

/**
 * Build environment variables for starting the proxy
 * @param {object} options - Start options
 * @param {string} options.provider - Provider ID
 * @param {number} options.port - Port number
 * @param {boolean} options.debug - Enable debug mode
 * @param {string} options.reasoningModel - Reasoning model ID
 * @param {string} options.completionModel - Completion model ID
 * @param {string} options.customBaseUrl - Custom base URL for custom provider
 * @returns {Promise<object>} Environment variables object
 */
export async function buildProxyEnv(options = {}) {
  const {
    provider = getConfig('provider') || 'openrouter',
    port = getConfig('port') || 3000,
    debug = getConfig('debug') || false,
    reasoningModel = getConfig('reasoningModel') || '',
    completionModel = getConfig('completionModel') || '',
  } = options
  
  const env = {
    ...process.env,
    PORT: String(port),
    FORCE_PROVIDER: provider,
  }
  
  if (debug) {
    env.DEBUG = '1'
  }
  
  if (reasoningModel) {
    env.REASONING_MODEL = reasoningModel
  }
  
  if (completionModel) {
    env.COMPLETION_MODEL = completionModel
  }
  
  // Get custom endpoint overrides from config
  const customEndpointOverrides = getConfig('customEndpointOverrides') || {}
  if (Object.keys(customEndpointOverrides).length > 0) {
    env.CUSTOM_ENDPOINT_OVERRIDES = JSON.stringify(customEndpointOverrides)
  }
  
  // Determine base URL
  let baseUrl = ''
  
  // Check if this is a built-in provider
  const providerConfig = getProviderConfig(provider)
  
  if (providerConfig) {
    baseUrl = providerConfig.baseUrl
  } else if (provider === 'custom') {
    // Custom provider - use config or provided customBaseUrl
    baseUrl = options.customBaseUrl || getConfig('customBaseUrl') || ''
  } else {
    // Unknown provider - check custom providers
    const customProviders = getConfig('customProviders') || []
    const customProvider = customProviders.find(p => p.id === provider)
    if (customProvider) {
      baseUrl = customProvider.baseUrl
    } else {
      // Fallback - use config customBaseUrl
      baseUrl = getConfig('customBaseUrl') || ''
    }
  }
  
  if (!baseUrl) {
    throw new Error(`Could not determine base URL for provider: ${provider}`)
  }
  
  env.ANTHROPIC_PROXY_BASE_URL = baseUrl
  
  // Get API key from secrets daemon
  // First ensure secrets daemon is running
  try {
    await secrets.ensureSecretsd()
  } catch (err) {
    console.warn('[ProviderEnv] Warning: Could not start secrets daemon:', err.message)
  }
  
  // Get key from secrets daemon or fall back to environment
  let apiKey = null
  
  if (providerConfig) {
    // Built-in provider - try secrets daemon first
    try {
      const providers = await secrets.listProviders()
      const providerStatus = providers.find(p => p.id === provider)
      if (providerStatus?.has_key) {
        // Key exists in secrets daemon
        // Note: We'd need a getKey endpoint to retrieve it
        // For now, fall back to env var
      }
    } catch {}
    
    // Fall back to environment variable
    const keyEnvVar = providerConfig.keySource
    apiKey = process.env[keyEnvVar]
    
    if (!apiKey && providerConfig.secondaryKeySource) {
      apiKey = process.env[providerConfig.secondaryKeySource]
    }
    
    if (!apiKey && providerConfig.requiresKey) {
      throw new Error(`${providerConfig.name} API key not set. Set ${providerConfig.keySource} environment variable or store via 'throne keys set ${provider}'`)
    }
    
    if (apiKey) {
      env[providerConfig.keySource] = apiKey
      if (providerConfig.secondaryKeySource) {
        env[providerConfig.secondaryKeySource] = apiKey
      }
    }
  } else {
    // Custom provider
    const customProviderId = getConfig('selectedCustomProviderId') || provider
    
    try {
      const providers = await secrets.listProviders()
      const providerStatus = providers.find(p => p.id === customProviderId)
      if (providerStatus?.has_key) {
        // Key stored in secrets daemon
        // Note: Need getKey API to retrieve
      }
    } catch {}
    
    // Fall back to environment
    apiKey = process.env.CUSTOM_API_KEY || process.env.API_KEY
    
    if (!apiKey) {
      throw new Error(`API key not set for provider: ${provider}`)
    }
    
    env.API_KEY = apiKey
  }
  
  console.log(`[ProviderEnv] Built environment for provider: ${provider}`)
  console.log(`[ProviderEnv] Base URL: ${baseUrl}`)
  console.log(`[ProviderEnv] Debug: ${debug}`)
  console.log(`[ProviderEnv] Reasoning Model: ${reasoningModel || 'not set'}`)
  console.log(`[ProviderEnv] Completion Model: ${completionModel || 'not set'}`)
  
  return env
}

/**
 * Validate provider configuration
 * @param {string} provider - Provider ID
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export async function validateProvider(provider) {
  const config = getProviderConfig(provider)
  
  if (!config) {
    // Check if it's a saved custom provider
    const customProviders = getConfig('customProviders') || []
    const customProvider = customProviders.find(p => p.id === provider)
    
    if (!customProvider) {
      return { valid: false, error: `Unknown provider: ${provider}` }
    }
    
    return { valid: true }
  }
  
  return { valid: true }
}

/**
 * Get list of built-in provider IDs
 * @returns {string[]} Array of built-in provider IDs
 */
export function getBuiltInProviderIds() {
  return Object.keys(PROVIDER_CONFIGS)
}

export default {
  getProviderConfig,
  buildProxyEnv,
  validateProvider,
  PROVIDER_CONFIGS,
  getBuiltInProviderIds,
}
