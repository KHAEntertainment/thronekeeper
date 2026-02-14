/**
 * Models command - List and search models
 */

import { Command } from 'commander'
import { getConfig, setConfig } from '../../lib/config.js'
import models from '../../lib/models.js'
import providerEnv from '../../lib/provider-env.js'

const command = new Command('models')
  .description('List and search available models')

// models list
command
  .command('list')
  .alias('ls')
  .description('List models for a provider')
  .option('-p, --provider <provider>', 'Provider to list models for')
  .option('-s, --search <term>', 'Filter models by search term')
  .option('-l, --limit <n>', 'Limit number of results', (val) => parseInt(val))
  .option('--api-key <key>', 'API key (or set via environment)')
  .action(async (options) => {
    try {
      const config = getConfig()
      
      // Determine provider
      const provider = options.provider || config.provider || 'openrouter'
      
      console.log(`📋 Fetching models for ${provider}...\n`)
      
      // Get base URL and API key
      const providerConfig = providerEnv.getProviderConfig(provider)
      if (!providerConfig) {
        console.error(`Unknown provider: ${provider}`)
        process.exit(1)
      }
      
      let apiKey = options.apiKey
      
      if (!apiKey) {
        // Try to get from environment
        const keyEnvVar = providerConfig.keySource
        apiKey = process.env[keyEnvVar]
        
        if (!apiKey && providerConfig.secondaryKeySource) {
          apiKey = process.env[providerConfig.secondaryKeySource]
        }
      }
      
      if (!apiKey) {
        console.warn('⚠️  No API key provided. Set via --api-key or environment variable.')
        console.warn(`   Provider ${provider} may require authentication.`)
      }
      
      // Fetch models
      const modelList = await models.listModels(provider, providerConfig.baseUrl, apiKey)
      
      // Filter models
      let filteredModels = modelList
      if (options.search) {
        filteredModels = models.filterModels(modelList, options.search)
      }
      
      // Limit results
      if (options.limit) {
        filteredModels = filteredModels.slice(0, options.limit)
      }
      
      console.log(`Found ${modelList.length} models`)
      if (options.search) {
        console.log(`Filtered to ${filteredModels.length} models\n`)
      } else {
        console.log('')
      }
      
      // Display models
      for (const model of filteredModels) {
        console.log(`   ${model}`)
      }
      
      if (options.search && filteredModels.length === 0) {
        console.log(`\nNo models matching '${options.search}'`)
      }
      
    } catch (err) {
      console.error(`\n❌ Error: ${err.message}`)
      process.exit(1)
    }
  })

// models select <provider> <model>
command
  .command('select <type> <model>')
  .description('Select a model for reasoning/completion/value')
  .option('-p, --provider <provider>', 'Provider (defaults to current provider)')
  .action(async (type, model, options) => {
    try {
      const config = getConfig()
      const provider = options.provider || config.provider || 'openrouter'
      
      // Validate type
      const validTypes = ['reasoning', 'completion', 'value']
      if (!validTypes.includes(type)) {
        console.error(`Invalid type: ${type}. Must be one of: ${validTypes.join(', ')}`)
        process.exit(1)
      }
      
      // Get or create model selections
      const modelSelections = config.modelSelectionsByProvider || {}
      const providerModels = modelSelections[provider] || {}
      
      // Set the model
      providerModels[type] = model
      modelSelections[provider] = providerModels
      
      // Also set as legacy single-model for backward compatibility
      if (type === 'reasoning') {
        setConfig('reasoningModel', model)
      } else if (type === 'completion') {
        setConfig('completionModel', model)
      } else if (type === 'value') {
        setConfig('valueModel', model)
      }
      
      // Save model selections
      setConfig('modelSelectionsByProvider', modelSelections)
      
      console.log(`✅ Set ${type} model to: ${model}`)
      console.log(`   Provider: ${provider}`)
      
    } catch (err) {
      console.error(`\n❌ Error: ${err.message}`)
      process.exit(1)
    }
  })

export default command
