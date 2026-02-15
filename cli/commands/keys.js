/**
 * Keys command - Manage API keys
 */

import { Command } from 'commander'
import secretsClient from '../../lib/secrets-client.js'
import { getProviderConfig, getBuiltInProviderIds } from '../../lib/provider-env.js'

const command = new Command('keys')
  .description('Manage API keys')

// keys list
command
  .command('list')
  .description('List providers with stored keys')
  .action(async () => {
    try {
      console.log('🔑 API Key Status\n')
      
      // Ensure secrets daemon is running
      await secretsClient.ensureSecretsd()
      
      const providers = await secretsClient.listProviders()
      
      // Built-in providers (from shared source)
      const builtInProviders = [...getBuiltInProviderIds(), 'anthropic']
      
      console.log('Built-in Providers:')
      for (const id of builtInProviders) {
        const p = providers.find(p => p.id === id)
        const status = p?.has_key ? '✅ Has key' : '❌ No key'
        const name = getProviderConfig(id)?.name || id
        console.log(`   ${name}: ${status}`)
      }
      
      // Custom providers
      const customProviders = providers.filter(p => !builtInProviders.includes(p.id))
      if (customProviders.length > 0) {
        console.log('\nCustom Providers:')
        for (const p of customProviders) {
          const status = p.has_key ? '✅ Has key' : '❌ No key'
          console.log(`   ${p.name} (${p.id}): ${status}`)
        }
      }
      
    } catch (err) {
      console.error(`\n❌ Error: ${err.message}`)
      process.exit(1)
    }
  })

// keys set <provider>
command
  .command('set <provider>')
  .description('Store an API key for a provider')
  .option('-k, --key <key>', 'API key (will prompt if not provided)')
  .action(async (provider, options) => {
    try {
      const readline = await import('readline')
      
      let apiKey = options.key
      
      if (!apiKey) {
        // Prompt for key
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        })
        
        apiKey = await new Promise((resolve) => {
          rl.question(`Enter API key for ${provider}: `, (answer) => {
            rl.close()
            resolve(answer.trim())
          })
        })
      }
      
      if (!apiKey) {
        console.error('❌ API key is required')
        process.exit(1)
      }
      
      console.log(`\n🔐 Storing API key for ${provider}...`)
      
      // Ensure secrets daemon is running
      await secretsClient.ensureSecretsd()
      
      // Store the key
      await secretsClient.storeKey(provider, apiKey)
      
      console.log('✅ API key stored successfully')
      
    } catch (err) {
      console.error(`\n❌ Failed to store key: ${err.message}`)
      process.exit(1)
    }
  })

// keys delete <provider>
command
  .command('delete <provider>')
  .description('Delete an API key for a provider')
  .action(async (provider) => {
    try {
      console.log(`🗑️  Deleting API key for ${provider}...`)
      
      // Ensure secrets daemon is running
      await secretsClient.ensureSecretsd()
      
      await secretsClient.deleteKey(provider)
      
      console.log('✅ API key deleted')
      
    } catch (err) {
      console.error(`\n❌ Failed to delete key: ${err.message}`)
      process.exit(1)
    }
  })

// keys test <provider>
command
  .command('test <provider>')
  .description('Test connectivity to a provider')
  .action(async (provider) => {
    try {
      console.log(`🧪 Testing connectivity to ${provider}...`)
      
      // Ensure secrets daemon is running
      await secretsClient.ensureSecretsd()
      
      const result = await secretsClient.testProvider(provider)
      
      if (result.success) {
        console.log(`✅ Provider is reachable`)
        console.log(`   Latency: ${Math.round(result.latency_ms)}ms`)
      } else {
        console.log(`❌ Provider test failed: ${result.error_message}`)
        process.exit(1)
      }
      
    } catch (err) {
      console.error(`\n❌ Test failed: ${err.message}`)
      process.exit(1)
    }
  })

export default command
