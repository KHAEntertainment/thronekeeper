/**
 * Claude Settings management - writes .claude/settings.json for Claude Code.
 * Ported from extension's ClaudeSettings.ts with modifications for CLI usage.
 */

import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true'

function debug(...args) {
  if (DEBUG) {
    console.log(...args)
  }
}

function info(...args) {
  console.log(...args)
}

/**
 * Update or revert environment variables in Claude Code settings files.
 */
export async function updateClaudeSettings(
  workspaceDir,
  newEnv,
  revert = false
) {
  const fileNames = ['.claude/settings.json', '.claude/settings_local.json']
  
  debug(`[ClaudeSettings] ${revert ? 'Reverting' : 'Updating'} settings in: ${workspaceDir}`)
  debug(`[ClaudeSettings] Environment variables: ${JSON.stringify(newEnv)}`)
  
  for (const fileName of fileNames) {
    const filePath = join(workspaceDir, fileName)
    
    let settings = {}
    let fileExistedBefore = false

    try {
      debug(`[ClaudeSettings] Processing file: ${filePath}`)
      
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        if (content.trim()) {
          settings = JSON.parse(content)
          fileExistedBefore = true
          debug(`[ClaudeSettings] Existing settings loaded from ${fileName}`)
        } else {
          debug(`[ClaudeSettings] File ${fileName} is empty, will create new`)
        }
      } catch (err) {
        if (err.code === 'ENOENT') {
          debug(`[ClaudeSettings] File ${fileName} does not exist, will create new`)
        } else if (err instanceof SyntaxError) {
          debug(`[ClaudeSettings] File ${fileName} has invalid JSON, will create new`)
        } else {
          console.error(`[ClaudeSettings] Error reading ${fileName}:`, err)
          throw err
        }
      }

      if (revert) {
        if (settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)) {
          for (const key in newEnv) {
            delete settings.env[key]
            debug(`[ClaudeSettings] Removed key from ${fileName}: ${key}`)
          }
          if (Object.keys(settings.env).length === 0) {
            delete settings.env
          }
        }
        debug(`[ClaudeSettings] Reverted settings for ${fileName}`)
      } else {
        const baseEnv = (settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)) 
          ? { ...settings.env }
          : {}
        
        for (const key in newEnv) {
          if (newEnv[key] === null) {
            delete baseEnv[key]
            debug(`[ClaudeSettings] Removing key from ${fileName}: ${key}`)
          } else {
            baseEnv[key] = newEnv[key]
            debug(`[ClaudeSettings] Setting ${key} in ${fileName}: ${baseEnv[key]}`)
          }
        }
        
        settings.env = baseEnv
      }

      const dir = dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      debug(`[ClaudeSettings] Created/verified directory: ${dir}`)

      if (Object.keys(settings).length > 0) {
        const fileContent = JSON.stringify(settings, null, 2)
        debug(`[ClaudeSettings] Writing to ${filePath}`)
        await fs.writeFile(filePath, fileContent)
        info(`[ClaudeSettings] ✅ Successfully wrote ${fileName}`)
      } else if (fileExistedBefore && Object.keys(settings).length === 0 && revert) {
        try {
          await fs.unlink(filePath)
          debug(`[ClaudeSettings] Deleted empty file ${fileName}`)
        } catch (err) {
          debug(`[ClaudeSettings] Could not delete ${fileName} (may not exist)`)
        }
      }
    } catch (error) {
      console.error(`[ClaudeSettings] Error processing ${fileName}:`, error)
      throw error
    }
  }
}

/**
 * Build environment variables to apply to Claude Code settings
 * @param {object} options - Configuration options
 * @param {string} options.proxyUrl - Base URL of the proxy
 * @param {string} options.reasoningModel - Reasoning model ID
 * @param {string} options.completionModel - Completion model ID
 * @param {string} options.valueModel - Value model ID
 * @param {boolean} options.twoModelMode - Enable three-model mode
 * @param {boolean} options.opusPlanMode - Enable OpusPlan mode
 * @param {number} options.apiTimeoutMs - API timeout in milliseconds
 * @param {boolean} options.disableNonessentialTraffic - Disable non-essential traffic
 */
export function buildClaudeEnv(options = {}) {
  const {
    proxyUrl = 'http://127.0.0.1:3000',
    reasoningModel = '',
    completionModel = '',
    valueModel = '',
    twoModelMode = false,
    opusPlanMode = false,
    apiTimeoutMs = 3000000,
    disableNonessentialTraffic = false,
  } = options
  
  const env = {
    ANTHROPIC_BASE_URL: proxyUrl,
    API_TIMEOUT_MS: String(apiTimeoutMs),
  }
  
  if (disableNonessentialTraffic) {
    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
  } else {
    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = null
  }
  
  if (reasoningModel) {
    if (twoModelMode && reasoningModel && completionModel && valueModel) {
      // Three-model mode
      env.ANTHROPIC_MODEL = (opusPlanMode && twoModelMode) ? 'opusplan' : reasoningModel
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = reasoningModel
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = completionModel
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = valueModel
    } else if (twoModelMode && reasoningModel && completionModel && !valueModel) {
      // Legacy two-model mode (deprecated)
      env.ANTHROPIC_MODEL = reasoningModel
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = reasoningModel
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = completionModel
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = completionModel
    } else {
      // Single-model mode
      env.ANTHROPIC_MODEL = reasoningModel
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = reasoningModel
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = reasoningModel
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = reasoningModel
    }
  }
  
  return env
}

/**
 * Get the default Claude settings directory
 * @param {'home' | 'workspace'} scope - 'home' for global, 'workspace' for cwd
 */
export function getClaudeSettingsDir(scope = 'workspace') {
  if (scope === 'home') {
    return join(homedir())
  }
  return process.cwd()
}

/**
 * Apply proxy configuration to Claude Code settings
 */
export async function applyToClaudeCode(options = {}) {
  const {
    workspaceDir = getClaudeSettingsDir(),
    proxyUrl = 'http://127.0.0.1:3000',
    reasoningModel = '',
    completionModel = '',
    valueModel = '',
    twoModelMode = false,
    opusPlanMode = false,
    apiTimeoutMs = 3000000,
    disableNonessentialTraffic = false,
  } = options
  
  const env = buildClaudeEnv({
    proxyUrl,
    reasoningModel,
    completionModel,
    valueModel,
    twoModelMode,
    opusPlanMode,
    apiTimeoutMs,
    disableNonessentialTraffic,
  })
  
  await updateClaudeSettings(workspaceDir, env, false)
}

/**
 * Revert Claude Code settings to defaults
 */
export async function revertClaudeCode(workspaceDir) {
  const env = {
    ANTHROPIC_BASE_URL: null,
    ANTHROPIC_MODEL: null,
    ANTHROPIC_DEFAULT_OPUS_MODEL: null,
    ANTHROPIC_DEFAULT_SONNET_MODEL: null,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: null,
    API_TIMEOUT_MS: null,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: null,
  }
  
  await updateClaudeSettings(workspaceDir, env, true)
}

export default {
  updateClaudeSettings,
  buildClaudeEnv,
  applyToClaudeCode,
  revertClaudeCode,
  getClaudeSettingsDir,
}
