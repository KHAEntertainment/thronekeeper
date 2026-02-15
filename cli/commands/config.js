/**
 * Config command - Manage configuration
 */

import { Command } from 'commander'
import { getConfig, setConfig, getConfigPath } from '../../lib/config.js'

const command = new Command('config')
  .description('Manage Thronekeeper configuration')

// config get <key>
command
  .command('get <key>')
  .description('Get a configuration value')
  .action((key) => {
    const config = getConfig()
    const value = config[key]
    if (value === undefined) {
      console.log(`Configuration key '${key}' not found.`)
      process.exit(1)
    }
    console.log(JSON.stringify(value, null, 2))
  })

// config set <key> <value>
command
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action((key, value) => {
    // Try to parse value as JSON, otherwise use as string
    let parsedValue = value
    try {
      parsedValue = JSON.parse(value)
    } catch {}
    
    setConfig(key, parsedValue)
    console.log(`✅ Set ${key} = ${JSON.stringify(parsedValue)}`)
  })

// config list
command
  .command('list')
  .description('List all configuration values')
  .action(() => {
    const config = getConfig()
    console.log('📋 Thronekeeper Configuration\n')
    console.log(`Config file: ${getConfigPath()}\n`)
    
    // Group config by category
    console.log('Provider:')
    console.log(`   provider: ${config.provider || 'not set'}`)
    console.log(`   customBaseUrl: ${config.customBaseUrl || 'not set'}`)
    console.log(`   customEndpointKind: ${config.customEndpointKind || 'auto'}`)
    
    console.log('\nModels:')
    console.log(`   twoModelMode: ${config.twoModelMode ? 'enabled' : 'disabled'}`)
    console.log(`   opusPlanMode: ${config.opusPlanMode ? 'enabled' : 'disabled'}`)
    console.log(`   reasoningModel: ${config.reasoningModel || 'not set'}`)
    console.log(`   completionModel: ${config.completionModel || 'not set'}`)
    console.log(`   valueModel: ${config.valueModel || 'not set'}`)
    
    console.log('\nProxy:')
    console.log(`   port: ${config.port || 3000}`)
    console.log(`   debug: ${config.debug ? 'enabled' : 'disabled'}`)
    
    console.log('\nClaude Code:')
    console.log(`   autoApply: ${config.autoApply !== false ? 'enabled' : 'disabled'}`)
    console.log(`   applyScope: ${config.applyScope || 'workspace'}`)
    console.log(`   applyToExtensions: ${config.applyToExtensions ? 'enabled' : 'disabled'}`)
    console.log(`   applyToTerminal: ${config.applyToTerminal ? 'enabled' : 'disabled'}`)
    console.log(`   apiTimeoutMs: ${config.apiTimeoutMs || 3000000}`)
    console.log(`   disableNonessentialTraffic: ${config.disableNonessentialTraffic ? 'enabled' : 'disabled'}`)
    
    console.log('\nAdvanced:')
    console.log(`   customProviders: ${(config.customProviders || []).length} provider(s) saved`)
    console.log(`   modelSelectionsByProvider: ${Object.keys(config.modelSelectionsByProvider || {}).length} provider(s) with selections`)
  })

// config path
command
  .command('path')
  .description('Show config file path')
  .action(() => {
    console.log(getConfigPath())
  })

export default command
