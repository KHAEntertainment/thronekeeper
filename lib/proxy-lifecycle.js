/**
 * Proxy lifecycle management - start/stop/health for the proxy server.
 * Manages PID file and background daemon process.
 */

import { spawn, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import * as http from 'http'

const CONFIG_DIR = join(homedir(), '.claude-throne')
const PID_FILE = join(CONFIG_DIR, 'proxy.pid')
const LOG_FILE = join(CONFIG_DIR, 'proxy.log')

let currentProc = null

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

/**
 * Read PID from file
 */
function readPid() {
  if (!existsSync(PID_FILE)) {
    return null
  }
  try {
    return parseInt(readFileSync(PID_FILE, 'utf-8').trim())
  } catch {
    return null
  }
}

/**
 * Check if a process is running by PID
 */
function isProcessRunning(pid) {
  try {
    // On Unix, kill with signal 0 checks if process exists
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Check if proxy is running
 */
export function isProxyRunning() {
  const pid = readPid()
  if (!pid) return false
  return isProcessRunning(pid)
}

/**
 * Wait for port to be listening
 */
async function waitForPort(port, timeoutMs = 10000) {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeoutMs) {
    const available = await new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        resolve(res.statusCode === 200)
      })
      req.on('error', () => resolve(false))
      req.setTimeout(500, () => {
        req.destroy()
        resolve(false)
      })
    })
    
    if (available) return true
    await new Promise(r => setTimeout(r, 100))
  }
  
  return false
}

/**
 * Check proxy health
 */
export async function checkHealth(port = 3000) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data)
            resolve(json.status === 'ok')
          } catch {
            resolve(false)
          }
        } else {
          resolve(false)
        }
      })
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

/**
 * Get proxy status
 */
export async function getStatus(port = 3000) {
  const pid = readPid()
  const running = pid && isProcessRunning(pid)
  
  if (!running) {
    return { running: false, port: null, pid: null }
  }
  
  const healthy = await checkHealth(port)
  
  return {
    running: true,
    port,
    pid,
    healthy,
  }
}

/**
 * Start the proxy as a background daemon
 * @param {object} options - Start options
 * @param {number} options.port - Port to run on
 * @param {boolean} options.debug - Enable debug logging
 * @param {object} options.env - Additional environment variables
 */
export async function startProxy(options = {}) {
  const { port = 3000, debug = false, env = {} } = options
  
  // Check if already running
  if (isProxyRunning()) {
    const status = await getStatus(port)
    if (status.running && status.port === port) {
      throw new Error(`Proxy already running on port ${port}`)
    }
    // Different port, kill old one
    await stopProxy()
  }
  
  ensureConfigDir()
  
  // Find the proxy entry point
  const possiblePaths = [
    join(process.cwd(), 'index.js'),
  ]
  
  let entryPath = null
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      entryPath = p
      break
    }
  }
  
  if (!entryPath) {
    throw new Error('Could not find proxy entry point (index.js)')
  }
  
  // Build environment
  const proxyEnv = {
    ...process.env,
    PORT: String(port),
    ...env,
  }
  if (debug) {
    proxyEnv.DEBUG = '1'
  }
  
  // Start proxy as detached process
  const proc = spawn(
    process.execPath,
    [entryPath, '--port', String(port)],
    {
      env: proxyEnv,
      detached: true,
      stdio: 'ignore',
    }
  )
  
  // Write PID file
  writeFileSync(PID_FILE, String(proc.pid))
  
  // Detach from parent
  proc.unref()
  
  // Wait for port to be available
  if (!await waitForPort(port, 15000)) {
    throw new Error(`Proxy failed to start on port ${port} within timeout`)
  }
  
  console.log(`[Proxy] Started with PID ${proc.pid} on port ${port}`)
  
  return {
    pid: proc.pid,
    port,
  }
}

/**
 * Stop the proxy daemon
 */
export async function stopProxy() {
  const pid = readPid()
  
  if (!pid) {
    console.log('[Proxy] No PID file found, nothing to stop')
    return true
  }
  
  if (!isProcessRunning(pid)) {
    // Stale PID file
    try { unlinkSync(PID_FILE) } catch {}
    return true
  }
  
  // Try graceful shutdown first
  try {
    process.kill(pid, 'SIGTERM')
    
    // Wait for process to exit (up to 5 seconds)
    for (let i = 0; i < 50; i++) {
      if (!isProcessRunning(pid)) {
        break
      }
      await new Promise(r => setTimeout(r, 100))
    }
  } catch (err) {
    console.warn('[Proxy] SIGTERM failed:', err.message)
  }
  
  // Force kill if still running
  if (isProcessRunning(pid)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
  }
  
  // Clean up PID file
  try { unlinkSync(PID_FILE) } catch {}
  
  console.log('[Proxy] Stopped')
  
  return true
}

/**
 * Restart the proxy
 */
export async function restartProxy(options = {}) {
  await stopProxy()
  return startProxy(options)
}

export default {
  isProxyRunning,
  checkHealth,
  getStatus,
  startProxy,
  stopProxy,
  restartProxy,
}
