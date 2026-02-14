/**
 * Secrets client for communicating with ct_secretsd (Python backend).
 * Provides secure API key storage using the OS keyring via the secrets daemon.
 */

import { request as undiciRequest } from 'undici'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import * as http from 'http'
import { randomBytes } from 'node:crypto'

const CONFIG_DIR = join(homedir(), '.claude-throne')
const SECRETSD_TOKEN_FILE = join(CONFIG_DIR, 'secretsd.token')
const SECRETSD_PID_FILE = join(CONFIG_DIR, 'secretsd.pid')
const DEFAULT_PORT = 34567

let _authToken = null

/**
 * Get or create auth token for secrets daemon
 */
function getAuthToken() {
  if (_authToken) return _authToken
  
  // Try to load existing token
  if (existsSync(SECRETSD_TOKEN_FILE)) {
    try {
      _authToken = readFileSync(SECRETSD_TOKEN_FILE, 'utf-8').trim()
      return _authToken
    } catch {}
  }
  
  // Generate new token
  _authToken = randomBytes(24).toString('base64url')
  
  // Ensure config dir exists
  try {
    mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(SECRETSD_TOKEN_FILE, _authToken)
  } catch {}
  
  return _authToken
}

/**
 * Get the secrets daemon port (from config or default)
 */
function getSecretsdPort() {
  return DEFAULT_PORT
}

/**
 * Check if secrets daemon is running
 */
async function isSecretsdRunning() {
  const port = getSecretsdPort()
  
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

/**
 * Start the secrets daemon in the background
 */
export async function startSecretsd() {
  if (await isSecretsdRunning()) {
    console.log('[SecretsClient] Secrets daemon already running')
    return true
  }
  
  const token = getAuthToken()
  const port = getSecretsdPort()
  
  // Try to find the Python backend
  const { existsSync } = await import('node:fs')
  const { dirname } = await import('node:path')
  
  const possiblePaths = [
    join(process.cwd(), 'backends/python/ct_secretsd'),
    join(process.cwd(), 'backends/python/ct_secretsd/ct_secretsd'),
    join(homedir(), 'claude-throne/backends/python/ct_secretsd'),
  ]
  
  let secretsdPath = null
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      secretsdPath = p
      break
    }
  }
  
  if (!secretsdPath) {
    throw new Error('Could not find ct_secretsd backend. Please ensure Python backend is installed.')
  }
  
  const logFile = join(CONFIG_DIR, 'secretsd.log')
  
  const proc = spawn(
    'python3',
    ['-m', 'ct_secretsd', '--port', String(port), '--auth-token', token, '--text-logs'],
    {
      cwd: secretsdPath,
      detached: true,
      stdio: ['ignore', 'open', 'open'],
    }
  )
  
  // Write PID file
  try {
    writeFileSync(SECRETSD_PID_FILE, String(proc.pid))
  } catch {}
  
  proc.unref()
  
  // Wait for daemon to start
  const startTime = Date.now()
  while (Date.now() - startTime < 5000) {
    if (await isSecretsdRunning()) {
      console.log('[SecretsClient] Secrets daemon started')
      return true
    }
    await new Promise(r => setTimeout(r, 100))
  }
  
  throw new Error('Failed to start secrets daemon')
}

/**
 * Stop the secrets daemon
 */
export async function stopSecretsd() {
  if (!existsSync(SECRETSD_PID_FILE)) {
    return true
  }
  
  try {
    const pid = parseInt(readFileSync(SECRETSD_PID_FILE, 'utf-8').trim())
    process.kill(pid, 'SIGTERM')
  } catch {}
  
  try {
    unlinkSync(SECRETSD_PID_FILE)
  } catch {}
  
  return true
}

/**
 * Make authenticated request to secrets daemon
 */
async function apiRequest(method, path, body = null) {
  const port = getSecretsdPort()
  const token = getAuthToken()
  
  if (!await isSecretsdRunning()) {
    await startSecretsd()
  }
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  
  const options = {
    method,
    headers,
    origin: `http://127.0.0.1:${port}`,
  }
  
  if (body) {
    options.body = JSON.stringify(body)
  }
  
  const url = `http://127.0.0.1:${port}${path}`
  const response = await undiciRequest(url, options)
  
  if (response.statusCode >= 400) {
    const errorBody = await response.body.text()
    throw new Error(`Secrets daemon error (${response.statusCode}): ${errorBody}`)
  }
  
  if (response.headers['content-type']?.includes('application/json')) {
    return response.body.json()
  }
  
  return response.body.text()
}

/**
 * Store an API key for a provider
 */
export async function storeKey(providerId, apiKey) {
  return apiRequest('PUT', `/secrets/provider/${providerId}`, { api_key: apiKey })
}

/**
 * Get an API key for a provider
 */
export async function getKey(providerId) {
  const providers = await listProviders()
  const provider = providers.find(p => p.id === providerId)
  return provider?.has_key ? '[stored]' : null
}

/**
 * Delete an API key for a provider
 */
export async function deleteKey(providerId) {
  return apiRequest('DELETE', `/secrets/provider/${providerId}`)
}

/**
 * List all providers and their key status
 */
export async function listProviders() {
  const response = await apiRequest('GET', '/secrets/providers')
  return response.providers
}

/**
 * Test connectivity to a provider
 */
export async function testProvider(providerId) {
  return apiRequest('POST', `/test/provider/${providerId}`)
}

/**
 * Ensure secrets daemon is running before operations
 */
export async function ensureSecretsd() {
  if (!await isSecretsdRunning()) {
    await startSecretsd()
  }
}

export default {
  startSecretsd,
  stopSecretsd,
  storeKey,
  getKey,
  deleteKey,
  listProviders,
  testProvider,
  ensureSecretsd,
}
