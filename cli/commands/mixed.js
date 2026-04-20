/**
 * KHA-267: Mixed Provider CLI stub
 * 
 * This file is a stub for the future Phase 4 CLI operations for
 * managing mixed provider configurations outside of the VS Code extension.
 * 
 * Future responsibilities:
 * - Read mixed-presets.json
 * - Set MIXED_PROVIDERS_CONFIG environment variable for anthropic-proxy
 * - Pass through credentials from .env
 */

export const mixedCommand = {
  name: 'mixed',
  description: 'Manage mixed provider configuration (stub)',
  action: async (options) => {
    console.log('Mixed provider CLI is pending implementation (Phase 4).');
    console.log('Please configure mixed providers via the VS Code extension for now.');
  }
};
