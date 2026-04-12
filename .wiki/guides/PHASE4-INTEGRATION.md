---
title: "PHASE4 INTEGRATION"
ownership: managed
last-updated: 2026-04-09
updated-by: plexium-convert
confidence: medium
review-status: unreviewed
---

# Phase 4: Extension Integration Notes

## Current State

The [[guides/cli.md|CLI]] is fully functional with the shared `lib/` modules. The VS Code extension (`extensions/claude-throne/`) currently has its own implementations of:
- `Services/ProxyManager.ts` - process management (vs lib/proxy-lifecycle.js)
- `Services/ClaudeSettings.ts` - Claude settings (vs lib/claude-settings.js)
- `Services/Models.ts` - model listing (vs lib/models.js)
- `Services/endpoints.ts` - endpoint detection (vs lib/endpoints.js)

## Integration Options

### Option A: Delegate to lib/ (Recommended)
Refactor extension services to import from `../../../lib/*.js`:

```typescript
// Example: Services/Models.ts
import { listModels as libListModels } from '../../../lib/models.js'

export async function listModels(provider, baseUrl, apiKey) {
  return libListModels(provider, baseUrl, apiKey)
}
```

**Pros**: Single source of truth, easier maintenance
**Cons**: ESM/TypeScript compatibility requires testing

### Option B: Keep Separate Implementations
Maintain separate implementations - CLI and extension evolve independently

**Pros**: No integration risk, current approach works
**Cons**: Code duplication, potential drift

### Option C: Extract lib as npm Package
Move `lib/` to a separate npm package (`@[[Home.md|thronekeeper]]/core`)

**Pros**: Clean separation, proper TypeScript support
**Cons**: More complex setup, extra publish step

## Recommended Next Steps

1. Test the CLI thoroughly in headless environments
2. When the extension needs updates to config/models/endpoint logic, import from lib/ at that time
3. Consider migrating lib/ to TypeScript for better IDE support

## lib/ Module Reference

| lib Module | Extension Equivalent | Purpose |
|------------|---------------------|---------|
| config.js | vscode.workspace.getConfiguration() | User config storage |
| secrets-client.js | vscode.SecretStorage | API key storage |
| proxy-lifecycle.js | ProxyManager.ts | Process management |
| claude-settings.js | ClaudeSettings.ts | .claude/settings.json |
| models.js | Models.ts | Model listing |
| endpoints.js | endpoints.ts | Endpoint detection |
| provider-env.js | buildEnvForProvider() in ProxyManager.ts | Env var building |
