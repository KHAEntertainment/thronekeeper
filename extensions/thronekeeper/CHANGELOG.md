# Change Log

All notable changes to Thronekeeper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.62] - 2026-04-09

### Added
- Dynamic model fetching for Deepseek and GLM providers via `/v1/models` endpoints
- Three-model mode for separate reasoning, completion, and value model selection
- Real-time model loading with search and filtering capabilities
- CLI-first architecture with headless proxy management via `throne` command
- Per-provider model caching with token-based race condition protection
- Secure credential storage via VS Code secrets API

### Fixed
- Webview race conditions with sequence token validation
- Model selection persistence across provider switches
- Configuration hydration on proxy start/stop
- Schema alignment between root and extension message contracts
- Timeout budget for model fetching (50-second cap with explicit timeout classification)

### Changed
- Renamed extension directory from `claude-throne` to `thronekeeper` to minimize branding conflicts
- Refactored proxy lifecycle management for better reliability
- Improved error messages for authentication failures and network issues
- Enhanced provider validation and endpoint detection

## [1.5.55] - 2025-11-04

### Added
- Initial public release with multi-provider support
- Support for OpenRouter, OpenAI, Together AI, Deepseek, GLM, and custom endpoints
- VS Code extension with webview panel for configuration
- Auto-configuration of Claude Code settings
- Model pairing recommendations for optimal performance

### Fixed
- Provider detection and API key resolution
- Streaming response handling for all providers
- OpenRouter free model handling and header requirements

## Earlier Versions

Previous versions were internal development releases. See git history for details.
