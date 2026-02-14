/**
 * Stop command - Stop the proxy daemon
 */

import { Command } from 'commander'
import { getConfig } from '../../lib/config.js'
import proxyLifecycle from '../../lib/proxy-lifecycle.js'
import claudeSettings from '../../lib/claude-settings.js'

const command = new Command('stop')
  .description('Stop the Thronekeeper proxy daemon')
  .option('--no-revert', 'Skip reverting Claude Code settings')
  .action(async (options) => {
    try {
      console.log('🔴 Stopping Thronekeeper proxy...\n')
      
      const config = getConfig()
      const port = config.port || 3000
      
      // Check if running
      const status = await proxyLifecycle.getStatus(port)
      if (!status.running) {
        console.log('Proxy is not running.')
        process.exit(0)
      }
      
      console.log(`   PID: ${status.pid}`)
      console.log(`   Port: ${port}`)
      
      // Stop the proxy
      await proxyLifecycle.stopProxy()
      
      console.log('✅ Proxy stopped')
      
      // Revert Claude Code settings
      if (options.revert !== false && config.autoApply !== false) {
        console.log('\n📝 Reverting Claude Code settings...')
        
        const workspaceDir = process.cwd()
        
        await claudeSettings.revertClaudeCode(workspaceDir)
        
        console.log(`✅ Reverted settings in ${workspaceDir}/.claude/settings.json`)
      }
      
      console.log('\n✨ Thronekeeper has been stopped.')
      
    } catch (err) {
      console.error(`\n❌ Failed to stop proxy: ${err.message}`)
      process.exit(1)
    }
  })

export default command
