---
title: "Cli"
ownership: managed
last-updated: 2026-04-10
updated-by: plexium-convert
confidence: medium
review-status: unreviewed
---

# Thronekeeper CLI Reference

Command-line interface for headless [[Home.md|Thronekeeper]] usage.

## Installation

```bash
npm install -g anthropic-proxy
# Or run directly:
node cli/index.js <command>
```

## Commands

### `throne status`
Show proxy status, health, and current configuration.

### `throne start`
Start the proxy as a background daemon.
- `--port, -p` - Port (default: 3000)
- `--debug, -d` - Enable debug logging
- `--no-apply` - Skip applying Claude Code settings
- `--force` - Force start even if already running

### `throne stop`
Stop the proxy daemon and revert Claude Code settings.
- `--no-revert` - Skip reverting Claude Code settings

### `throne config`
Manage configuration.
- `throne config list` - Show all config
- `throne config get <key>` - Get a value
- `throne config set <key> <value>` - Set a value
- `throne config path` - Show config file path

### `throne keys`
Manage API keys (via ct_secretsd).
- `throne keys list` - Show providers with stored keys
- `throne keys set <provider>` - Store API key (prompts for key)
- `throne keys delete <provider>` - Delete stored key
- `throne keys test <provider>` - Test provider connectivity

### `throne models`
List and manage models.
- `throne models list` - List available models
- `throne models list --search <term>` - Filter models
- `throne models select <type> <model>` - Select model (reasoning/completion/value)

### `throne setup`
Run interactive setup wizard to configure provider, API key, and models.

## Configuration

Config file: `~/.claude-throne/config.json`

Key settings:
- `provider` - Current provider (openrouter, openai, together, deepseek, glm, custom)
- `port` - Proxy port (default: 3000)
- `reasoningModel` / `completionModel` / `valueModel` - Model selections
- `twoModelMode` - Enable three-model mode
- `autoApply` - Auto-apply Claude Code settings

## Examples

```bash
# Quick setup
throne setup

# Configure manually
throne config set provider openrouter
throne keys set openrouter
throne models list
throne start

# Check status
throne status
```
