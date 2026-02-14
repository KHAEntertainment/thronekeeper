/**
 * Configuration management for Thronekeeper CLI.
 * Reads/writes to ~/.claude-throne/config.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const CONFIG_DIR = join(homedir(), '.claude-throne')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG = {
  provider: 'openrouter',
  port: 3000,
  debug: false,
  twoModelMode: false,
  opusPlanMode: false,
  reasoningModel: '',
  completionModel: '',
  valueModel: '',
  customBaseUrl: '',
  customEndpointKind: 'auto',
  customEndpointOverrides: {},
  customProviders: [],
  selectedCustomProviderId: '',
  autoApply: true,
  applyToExtensions: false,
  applyToTerminal: false,
  applyScope: 'workspace',
  apiTimeoutMs: 3000000,
  disableNonessentialTraffic: false,
  modelSelectionsByProvider: {},
  savedCombosByProvider: {}
}

/**
 * Ensure the config directory exists
 */
function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

/**
 * Load configuration from file
 * @returns {object} Configuration object
 */
export function loadConfig() {
  ensureConfigDir()
  
  if (!existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG }
  }
  
  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8')
    const loaded = JSON.parse(content)
    return { ...DEFAULT_CONFIG, ...loaded }
  } catch (err) {
    console.warn('[Config] Failed to parse config file, using defaults:', err.message)
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * Save configuration to file
 * @param {object} config - Configuration to save
 */
export function saveConfig(config) {
  ensureConfigDir()
  
  const merged = { ...loadConfig(), ...config }
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2))
}

/**
 * Get a specific config value
 * @param {string} key - Configuration key
 * @returns {any} Configuration value
 */
export function getConfig(key) {
  const config = loadConfig()
  if (key === undefined) {
    return config
  }
  return config[key]
}

/**
 * Set a specific config value
 * @param {string} key - Configuration key
 * @param {any} value - Value to set
 */
export function setConfig(key, value) {
  const config = loadConfig()
  config[key] = value
  saveConfig(config)
}

/**
 * Get config file path
 * @returns {string} Path to config file
 */
export function getConfigPath() {
  return CONFIG_FILE
}

/**
 * Get config directory path
 * @returns {string} Path to config directory
 */
export function getConfigDir() {
  return CONFIG_DIR
}

export { CONFIG_DIR, CONFIG_FILE }
