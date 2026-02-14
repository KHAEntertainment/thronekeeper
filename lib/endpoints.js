/**
 * Endpoint detection and URL manipulation - ported from extension's endpoints.ts
 */

/**
 * Determine whether a URL corresponds to a known Anthropic-related endpoint.
 */
export function isAnthropicEndpoint(url) {
  if (!url) return false
  
  try {
    const u = new URL(url.trim())
    const host = u.hostname.toLowerCase()
    const path = u.pathname.toLowerCase()

    const hasAnthropicPath =
      path === '/anthropic' ||
      path.startsWith('/anthropic/') ||
      path.startsWith('/api/anthropic')

    // Bedrock: require 'anthropic' in path
    if (host.includes('bedrock') && host.endsWith('amazonaws.com')) {
      return /anthropic/.test(path)
    }
    
    // For Deepseek/GLM, require /anthropic path to avoid false positives
    if (host === 'api.deepseek.com' || host === 'api.z.ai') {
      return hasAnthropicPath
    }
    
    // For api.anthropic.com accept either root or /anthropic* paths
    if (host.endsWith('anthropic.com')) {
      return true
    }
    
    // Claude.ai (heuristic; rarely used as API base)
    if (host.endsWith('claude.ai')) {
      return true
    }
    
    // For any other host, check if it has an Anthropic path
    return hasAnthropicPath
  } catch {
    return false
  }
}

/**
 * Determine endpoint kind (OpenAI-compatible vs Anthropic-native)
 */
export function getEndpointKind(baseUrl) {
  if (!baseUrl) return 'unknown'
  
  if (isAnthropicEndpoint(baseUrl)) {
    return 'anthropic'
  }
  
  return 'openai'
}

export const ENDPOINT_KIND = {
  OPENAI_COMPATIBLE: 'openai-compatible',
  ANTHROPIC_NATIVE: 'anthropic-native',
  UNKNOWN: 'unknown',
}

/**
 * Produce the models endpoint URL corresponding to a provided base URL.
 */
export function getModelsEndpointForBase(baseUrl) {
  if (!baseUrl) return baseUrl

  try {
    const url = new URL(baseUrl.replace(/\/$/, ''))
    const host = url.hostname.toLowerCase()
    const path = url.pathname.toLowerCase()

    // Guard against double-normalization
    if (path.endsWith('/models')) {
      return baseUrl.replace(/\/$/, '')
    }

    // Anthropic-style endpoints
    if (isAnthropicEndpoint(baseUrl)) {
      let basePath = ''
      let modelsPath = '/v1/models'
      
      if (path.includes('/anthropic')) {
        basePath = path.substring(0, path.indexOf('/anthropic'))
      }
      
      // Special case for api.z.ai
      if (host === 'api.z.ai') {
        modelsPath = '/api/paas/v4/models'
      } else {
        modelsPath = `${basePath}/v1/models`
      }
      
      const finalPath = modelsPath.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
      return `${url.protocol}//${url.host}${finalPath}`
    }

    // Non-Anthropic endpoints: just append /models
    return `${baseUrl.replace(/\/$/, '')}/models`
  } catch {
    return `${baseUrl.replace(/\/$/, '')}/models`
  }
}

/**
 * Get base URL for a provider
 */
export function getProviderBaseUrl(provider) {
  const baseUrls = {
    openrouter: 'https://openrouter.ai/api',
    openai: 'https://api.openai.com',
    together: 'https://api.together.xyz',
    deepseek: 'https://api.deepseek.com/anthropic',
    glm: 'https://api.z.ai/api/anthropic',
  }
  
  return baseUrls[provider] || null
}

export default {
  isAnthropicEndpoint,
  getEndpointKind,
  getModelsEndpointForBase,
  getProviderBaseUrl,
  ENDPOINT_KIND,
}
