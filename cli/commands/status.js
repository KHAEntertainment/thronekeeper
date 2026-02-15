/**
 * Status command - Show proxy status
 */

import { Command } from 'commander'
import { getConfig } from '../../lib/config.js'
import proxyLifecycle from '../../lib/proxy-lifecycle.js'

const command = new Command('status')
  .description('Show Thronekeeper proxy status')
  .option('-p, --port <port>', 'Port to check', (val) => parseInt(val))
  .action(async (options) => {
    try {
      const config = getConfig()
      const port = options.port || config.port || 3000
      
      console.log('📊 Thronekeeper Status\n')
      console.log(`   Port: ${port}`)
      
      // Get proxy status
      const status = await proxyLifecycle.getStatus(port)
      
      if (status.running) {
        console.log(`   Status: 🟢 Running`)
        console.log(`   PID: ${status.pid}`)
        console.log(`   Healthy: ${status.healthy ? '✅ Yes' : '❌ No'}`)
      } else {
        console.log(`   Status: 🔴 Stopped`)
      }
      
      console.log(`\n📡 Provider: ${config.provider || 'not set'}`)
      
      // Show model selections
      const modelSelections = config.modelSelectionsByProvider || {}
      const provider = config.provider || 'openrouter'
      const providerModels = modelSelections[provider] || {}
      
      console.log(`\n🤖 Models:`)
      console.log(`   Reasoning: ${providerModels.reasoning || config.reasoningModel || 'not set'}`)
      console.log(`   Completion: ${providerModels.completion || config.completionModel || 'not set'}`)
      if (config.twoModelMode) {
        console.log(`   Value: ${providerModels.value || config.valueModel || 'not set'}`)
        console.log(`   Mode: Three-model (reasoning, completion, value)`)
      } else {
        console.log(`   Mode: Single model`)
      }
      
      console.log(`\n⚙️  Settings:`)
      console.log(`   Auto-apply: ${config.autoApply !== false ? '✅ Enabled' : '❌ Disabled'}`)
      console.log(`   Debug: ${config.debug ? '✅ Enabled' : '❌ Disabled'}`)
      console.log(`   Apply Scope: ${config.applyScope || 'workspace'}`)
      
      if (config.customBaseUrl) {
        console.log(`\n🔗 Custom Base URL: ${config.customBaseUrl}`)
      }
      
    } catch (err) {
      console.error(`\n❌ Error: ${err.message}`)
      process.exit(1)
    }
  })

export default command
