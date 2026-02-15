#!/usr/bin/env node
/**
 * Thronekeeper CLI - Main entry point
 * Universal AI model routing for Claude Code
 */

import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load package.json for version
let packageVersion = '0.0.0'
try {
  const pkgPath = join(__dirname, '..', 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  packageVersion = pkg.version
} catch {}

// Import commands
import start from './commands/start.js'
import stop from './commands/stop.js'
import status from './commands/status.js'
import configCmd from './commands/config.js'
import keys from './commands/keys.js'
import models from './commands/models.js'
import setup from './commands/setup.js'

const program = new Command()

program
  .name('throne')
  .description('Thronekeeper - Universal AI model routing for Claude Code')
  .version(packageVersion)

// Register commands
program.addCommand(start)
program.addCommand(stop)
program.addCommand(status)
program.addCommand(configCmd)
program.addCommand(keys)
program.addCommand(models)
program.addCommand(setup)

// Default to showing status if no command provided
program.parse(process.argv)

if (process.argv.length === 2) {
  // No arguments, show help
  program.help()
}
