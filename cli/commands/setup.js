/**
 * Setup command - Interactive TUI setup wizard
 * Note: This is a placeholder that will be enhanced with Ink in Phase 3
 */

import { Command } from 'commander'
import { getConfig, setConfig, saveConfig } from '../../lib/config.js'
import secretsClient from '../../lib/secrets-client.js'
import models from '../../lib/models.js'
import providerEnv from '../../lib/provider-env.js'

const command = new Command('setup')
  .description('Run the interactive setup wizard')
  .option('-p, --provider <provider>', 'Skip provider selection and use specified provider')
  .option('-k, --key <key>', 'Skip key prompt and use specified API key')
  .action(async (options) => {
    try {
      console.log('\n🧙 Thronekeeper Setup Wizard\n')
      console.log('Welcome! This wizard will help you configure Thronekeeper.\n')
      
      const config = getConfig()
      const readline = await import('readline')
      
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })
      
      const prompt = (question) => new Promise(resolve => rl.question(question, resolve))
      
      // Step 1: Provider Selection
      let provider = options.provider
      if (!provider) {
        console.log('Step 1: Select your AI Provider\n')
        console.log('   1. OpenRouter (200+ models)')
        console.log('   2. OpenAI (GPT models)')
        console.log('   3. Together AI (Open source models)')
        console.log('   4. DeepSeek (Anthropic-compatible)')
        console.log('   5. GLM / Zhipu AI (Anthropic-compatible)')
        console.log('   6. Custom (Your own OpenAI-compatible endpoint)')
        
        const choice = await prompt('\nEnter your choice (1-6): ')
        
        const providers = ['openrouter', 'openai', 'together', 'deepseek', 'glm', 'custom']
        const choiceNum = parseInt(choice) - 1
        
        if (isNaN(choiceNum) || choiceNum < 0 || choiceNum >= providers.length) {
          console.log('Invalid choice. Using OpenRouter as default.')
          provider = 'openrouter'
        } else {
          provider = providers[choiceNum]
        }
      }
      
      console.log(`\n✅ Selected provider: ${provider}`)
      
      // Step 2: API Key
      let apiKey = options.key
      if (!apiKey) {
        const providerConfig = providerEnv.getProviderConfig(provider)
        
        console.log('\nStep 2: Enter API Key\n')
        console.log(`   Provider: ${providerConfig?.name || provider}`)
        
        // Check if key exists in environment
        const keyEnvVar = providerConfig?.keySource
        if (keyEnvVar && process.env[keyEnvVar]) {
          console.log(`   Found ${keyEnvVar} in environment. Using that.`)
        } else {
          apiKey = await prompt('   Enter your API key: ')
          
          if (!apiKey.trim()) {
            console.log('   No API key provided. You can set it later with: throne keys set ' + provider)
          }
        }
      }
      
      // Store the key
      if (apiKey?.trim()) {
        console.log('\n🔐 Storing API key...')
        await secretsClient.ensureSecretsd()
        await secretsClient.storeKey(provider, apiKey)
        console.log('   ✅ API key stored')
      }
      
      // Step 3: Select Models
      console.log('\nStep 3: Model Selection\n')
      
      let modelList = []
      let reasoningModel = ''
      let completionModel = ''
      let valueModel = ''
      
      if (apiKey?.trim()) {
        const providerConfig = providerEnv.getProviderConfig(provider)
        
        try {
          console.log('   Fetching available models...')
          modelList = await models.listModels(provider, providerConfig.baseUrl, apiKey)
          console.log(`   Found ${modelList.length} models\n`)
          
          // Reasoning model
          console.log('   Available reasoning models (showing first 20):')
          modelList.slice(0, 20).forEach((m, i) => console.log(`      ${i + 1}. ${m}`))
          
          const reasoningChoice = await prompt('\n   Enter reasoning model (or press Enter to skip): ')
          if (reasoningChoice.trim()) {
            const idx = parseInt(reasoningChoice) - 1
            if (!isNaN(idx) && idx >= 0 && idx < modelList.length) {
              reasoningModel = modelList[idx]
            } else {
              reasoningModel = reasoningChoice.trim()
            }
          }
          
          // Completion model
          if (reasoningModel) {
            const completionChoice = await prompt('   Enter completion model (or press Enter to use same): ')
            if (completionChoice.trim()) {
              const idx = parseInt(completionChoice) - 1
              if (!isNaN(idx) && idx >= 0 && idx < modelList.length) {
                completionModel = modelList[idx]
              } else {
                completionModel = completionChoice.trim()
              }
            } else {
              completionModel = reasoningModel
            }
          }
          
          // Value model (three-model mode)
          const twoModelMode = await prompt('   Enable three-model mode? (y/N): ')
          if (twoModelMode.toLowerCase() === 'y') {
            setConfig('twoModelMode', true)
            
            console.log(`\n   Available value models (showing first 20):`)
            modelList.slice(0, 20).forEach((m, i) => console.log(`      ${i + 1}. ${m}`))
            
            const valueChoice = await prompt('\n   Enter value model: ')
            if (valueChoice.trim()) {
              const idx = parseInt(valueChoice) - 1
              if (!isNaN(idx) && idx >= 0 && idx < modelList.length) {
                valueModel = modelList[idx]
              } else {
                valueModel = valueChoice.trim()
              }
            }
          }
          
        } catch (err) {
          console.log(`   ⚠️  Could not fetch models: ${err.message}`)
          console.log('   You can set models later with: throne models select <type> <model>')
        }
      }
      
      // Save configuration
      setConfig('provider', provider)
      
      if (reasoningModel) {
        setConfig('reasoningModel', reasoningModel)
      }
      if (completionModel) {
        setConfig('completionModel', completionModel)
      }
      if (valueModel) {
        setConfig('valueModel', valueModel)
      }
      
      // Save model selections
      const modelSelections = config.modelSelectionsByProvider || {}
      modelSelections[provider] = {
        reasoning: reasoningModel,
        completion: completionModel || reasoningModel,
        value: valueModel,
      }
      setConfig('modelSelectionsByProvider', modelSelections)
      
      // Step 4: Port
      console.log('\nStep 4: Port Configuration\n')
      const portStr = await prompt(`   Enter proxy port (default: ${config.port || 3000}): `)
      const port = parseInt(portStr) || config.port || 3000
      setConfig('port', port)
      
      console.log(`\n✅ Configuration saved!`)
      console.log(`\n📝 Summary:`)
      console.log(`   Provider: ${provider}`)
      console.log(`   Port: ${port}`)
      if (reasoningModel) {
        console.log(`   Reasoning Model: ${reasoningModel}`)
        console.log(`   Completion Model: ${completionModel || reasoningModel}`)
      }
      if (valueModel) {
        console.log(`   Value Model: ${valueModel}`)
      }
      
      console.log('\n✨ Setup complete!')
      console.log('\nTo start the proxy, run:')
      console.log(`   throne start\n`)
      
    } catch (err) {
      console.error(`\n❌ Setup failed: ${err.message}`)
      process.exit(1)
    } finally {
      if (rl) rl.close()
    }
  })

export default command
