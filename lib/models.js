/**
 * Model listing for providers - ported from extension's Models.ts
 */

import { request as undiciRequest } from 'undici'
import { getModelsEndpointForBase } from './endpoints.js'

const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true'

/**
 * Fetch models with retry logic, exponential backoff, and overall budget tracking.
 */
async function fetchModelsWithRetry(
  url,
  headers,
  maxRetries = 3,
  provider,
  startTime,
  overallBudgetMs = 50000
) {
  const fetchStartTime = startTime || Date.now()
  
  // Provider-specific timeouts
  let timeoutMs = 15000
  if (url.includes('openrouter.ai')) {
    timeoutMs = 15000
  } else if (url.includes('api.openai.com')) {
    timeoutMs = 10000
  } else if (url.includes('api.together.xyz')) {
    timeoutMs = 15000
  } else if (url.includes('api.deepseek.com')) {
    timeoutMs = 20000
  } else if (url.includes('api.z.ai')) {
    timeoutMs = 20000
  }
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const elapsedMs = Date.now() - fetchStartTime
    if (elapsedMs >= overallBudgetMs) {
      const error = new Error(`Model list request exceeded overall budget of ${Math.round(overallBudgetMs / 1000)} seconds`)
      error.errorType = 'timeout'
      throw error
    }
    
    const remainingBudgetMs = overallBudgetMs - elapsedMs
    const adjustedTimeoutMs = Math.min(timeoutMs, remainingBudgetMs)
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), adjustedTimeoutMs)
    
    try {
      if (DEBUG && attempt > 1) {
        console.log(`[Models] Retry attempt ${attempt}/${maxRetries + 1} for ${url}`)
      }
      
      const res = await undiciRequest(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      
      // Handle rate limiting
      if (res.statusCode === 429) {
        if (attempt <= maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
          const remainingBeforeBackoff = overallBudgetMs - (Date.now() - fetchStartTime)
          const adjustedBackoffMs = Math.min(backoffMs, remainingBeforeBackoff)
          
          if (DEBUG) console.log(`[Models] Rate limited (429), retrying after ${adjustedBackoffMs}ms`)
          await new Promise(resolve => setTimeout(resolve, adjustedBackoffMs))
          continue
        }
        throw new Error(`Model list request rate limited (429) after ${maxRetries} retries`)
      }
      
      // Handle server errors
      if (res.statusCode >= 500 && res.statusCode < 600) {
        if (attempt <= maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
          const remainingBeforeBackoff = overallBudgetMs - (Date.now() - fetchStartTime)
          const adjustedBackoffMs = Math.min(backoffMs, remainingBeforeBackoff)
          
          if (DEBUG) console.log(`[Models] Server error (${res.statusCode}), retrying after ${adjustedBackoffMs}ms`)
          await new Promise(resolve => setTimeout(resolve, adjustedBackoffMs))
          continue
        }
        throw new Error(`Model list request failed with server error (${res.statusCode}) after ${maxRetries} retries`)
      }
      
      if (res.statusCode !== 200) {
        let errorSnippet = ''
        try {
          const bodyText = await res.body.text()
          errorSnippet = bodyText.slice(0, 500)
        } catch {}
        
        if ((res.statusCode === 401 || res.statusCode === 403) && url.includes('together.xyz')) {
          throw new Error(`Together AI authentication failed (${res.statusCode}). Please check your API key.`)
        }
        
        throw new Error(errorSnippet
          ? `Model list failed (${res.statusCode}): ${errorSnippet}`
          : `Model list failed (${res.statusCode})`)
      }
      
      return await res.body.json()
    } catch (err) {
      clearTimeout(timeoutId)
      
      const currentElapsed = Date.now() - fetchStartTime
      if (currentElapsed >= overallBudgetMs) {
        const error = new Error(`Model list request exceeded overall budget of ${Math.round(overallBudgetMs / 1000)} seconds`)
        error.errorType = 'timeout'
        throw error
      }
      
      // Handle timeout errors
      if (err.name === 'AbortError' || err.code === 'UND_ERR_ABORTED') {
        if (attempt <= maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
          const remainingBeforeBackoff = overallBudgetMs - currentElapsed
          const adjustedBackoffMs = Math.min(backoffMs, remainingBeforeBackoff)
          
          if (DEBUG) console.log(`[Models] Timeout, retrying after ${adjustedBackoffMs}ms`)
          await new Promise(resolve => setTimeout(resolve, adjustedBackoffMs))
          continue
        }
        const error = new Error(`Model list request timed out after ${Math.round(adjustedTimeoutMs / 1000)} seconds`)
        error.errorType = 'timeout'
        throw error
      }
      
      // Handle network errors
      if (attempt <= maxRetries && (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND')) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
        const remainingBeforeBackoff = overallBudgetMs - currentElapsed
        const adjustedBackoffMs = Math.min(backoffMs, remainingBeforeBackoff)
        
        if (DEBUG) console.log(`[Models] Network error (${err.code}), retrying after ${adjustedBackoffMs}ms`)
        await new Promise(resolve => setTimeout(resolve, adjustedBackoffMs))
        continue
      }
      
      throw err
    }
  }
}

/**
 * List models for a provider
 * @param {string} provider - Provider ID (e.g., 'openrouter', 'openai', 'together', 'deepseek', 'glm', 'custom')
 * @param {string} baseUrl - Base URL for the provider
 * @param {string} apiKey - API key for authentication
 * @returns {Promise<string[]>} Array of model IDs
 */
export async function listModels(provider, baseUrl, apiKey) {
  if (provider === 'custom' && (!baseUrl || !baseUrl.trim())) {
    throw new Error('Custom provider requires a base URL')
  }
  
  const startTime = Date.now()
  const overallBudgetMs = 50000
  
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  
  console.log(`[Models] Listing models for provider: ${provider}`)
  
  const base = baseUrl.replace(/\/$/, '')
  let url = provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1/models'
    : getModelsEndpointForBase(base)
  
  // Provider-specific logic for TogetherAI
  if (provider === 'together' || (provider === 'custom' && url.includes('together.xyz'))) {
    if (!apiKey) {
      throw new Error('API key required for Together AI')
    }
    url = 'https://api.together.xyz/v1/models'
  }
  
  console.log(`[Models] Fetching models from: ${url}`)
  
  try {
    const data = await fetchModelsWithRetry(url, headers, 3, provider, startTime, overallBudgetMs)
    
    // Try OpenAI-like shape first
    if (Array.isArray(data.data)) {
      return data.data
        .map(m => m?.id)
        .filter(id => typeof id === 'string')
    }
    
    // Try OpenRouter shape { models: [] }
    if (Array.isArray(data.models)) {
      return data.models
        .map(m => m?.id)
        .filter(id => typeof id === 'string')
    }
    
    // Fallback try common fields
    const arr = Array.isArray(data) ? data : []
    return arr.map(m => m?.id).filter(id => typeof id === 'string')
  } catch (err) {
    console.error(`[Models] Failed to fetch from ${url}:`, err.message)
    throw err
  }
}

/**
 * Filter models by search term
 * @param {string[]} models - Array of model IDs
 * @param {string} search - Search term
 * @returns {string[]} Filtered model IDs
 */
export function filterModels(models, search) {
  if (!search) return models
  const term = search.toLowerCase()
  return models.filter(m => m.toLowerCase().includes(term))
}

export default {
  listModels,
  filterModels,
}
