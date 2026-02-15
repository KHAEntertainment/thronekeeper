/**
 * Start command - Start the proxy as a daemon
 */

import { Command } from 'commander'
import { getConfig, setConfig } from '../../lib/config.js'
import proxyLifecycle from '../../lib/proxy-lifecycle.js'
import providerEnv from '../../lib/provider-env.js'
import claudeSettings from '../../lib/claude-settings.js'

const command = new Command('start')
  .description('Start the Thronekeeper proxy daemon')
  .option('-p, --port <port>', 'Port to run proxy on', (val) => parseInt(val))
  .option('-d, --debug', 'Enable debug logging')
  .option('--no-apply', 'Skip applying Claude Code settings')
  .option('--force', 'Force start even if already running')
  .action(async (options) => {
    try {
      console.log('🟢 Starting Thronekeeper proxy...\n')
      
      const config = getConfig()
      
      // Get options with config fallbacks
      const port = options.port || config.port || 3000
      const debug = options.debug ?? config.debug ?? false
      
      // Check if already running
      if (!options.force) {
        const status = await proxyLifecycle.getStatus(port)
        if (status.running) {
          console.log(`❌ Proxy already running on port ${status.port || port}`)
          console.log(`   Run 'throne stop' to stop it first, or use --force`)
          process.exit(1)
        }
      }
      
      // Get model selections
      const modelSelections = config.modelSelectionsByProvider || {}
      const provider = config.provider || 'openrouter'
      const providerModels = modelSelections[provider] || {}
      
      const reasoningModel = providerModels.reasoning || config.reasoningModel || ''
      const completionModel = providerModels.completion || config.completionModel || ''
      const valueModel = providerModels.value || config.valueModel || ''
      const twoModelMode = config.twoModelMode || false
      const opusPlanMode = config.opusPlanMode || false
      
      console.log(`📡 Provider: ${provider}`)
      console.log(`   Port: ${port}`)
      console.log(`   Debug: ${debug}`)
      console.log(`   Reasoning Model: ${reasoningModel || 'not set'}`)
      console.log(`   Completion Model: ${completionModel || 'not set'}`)
      if (twoModelMode) {
        console.log(`   Value Model: ${valueModel || 'not set'}`)
      }
      
      // Build environment for proxy
      const env = await providerEnv.buildProxyEnv({
        provider,
        port,
        debug,
        reasoningModel,
        completionModel,
      })
      
      // Start the proxy
      console.log('\n🚀 Starting proxy daemon...')
      await proxyLifecycle.startProxy({ port, debug, env })
      
      console.log(`✅ Proxy started on http://127.0.0.1:${port}`)
      
      // Apply to Claude Code settings
      if (options.apply !== false && config.autoApply !== false) {
        console.log('\n📝 Applying settings to Claude Code...')
        
        const proxyUrl = `http://127.0.0.1:${port}`
        const workspaceDir = process.cwd()
        
        await claudeSettings.applyToClaudeCode({
          workspaceDir,
          proxyUrl,
          reasoningModel,
          completionModel,
          valueModel,
          twoModelMode,
          opusPlanMode,
          apiTimeoutMs: config.apiTimeoutMs || 3000000,
          disableNonessentialTraffic: config.disableNonessentialTraffic || false,
        })
        
        console.log(`✅ Applied to ${workspaceDir}/.claude/settings.json`)
      }
      
      console.log('\n✨ Thronekeeper is running!')
      console.log(`   Proxy URL: http://127.0.0.1:${port}`)
      console.log(`   Health check: http://127.0.0.1:${port}/health`)
      
    } catch (err) {
      console.error(`\n❌ Failed to start proxy: ${err.message}`)
      process.exit(1)
    }
  })

export default command
