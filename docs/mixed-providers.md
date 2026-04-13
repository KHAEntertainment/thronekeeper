# Mixed Provider Routing (KHA-267)

Claude Throne supports surgical, per-tier provider routing via the **Mixed Provider** configuration. This allows you to route different conceptual tiers (Reasoning, Completion, Value) to disparate API providers simultaneously within a single session.

## Architecture: The ProviderContext

The core of the mixed provider system is the `ProviderContext`. Unlike standard configurations which rely on globally active credentials (`API_KEY`), mixed routing evaluates each request and constructs a temporary `ProviderContext` mapping specifically for that request.

```javascript
const context = {
  providerId: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  key: 'sk-deepseek-...',
  model: 'deepseek-reasoner',
  endpointKind: 'openai'
}
```

The `ProviderRouter` handles intercepting incoming metadata from Claude Code (`anthropic-metadata` sequence identifiers) and injecting the exact API key, base URL, and formatting required for the specific tier's target provider.

## Enabling Mixed Providers

Mixed providers are gated by a feature flag:

```json
{
  "claudeThrone.featureFlags": {
    "enableMixedProviders": true
  }
}
```

When enabled, a new configuration key `claudeThrone.mixedProviders` is read:

```json
{
  "claudeThrone.mixedProviders": {
    "enabled": true,
    "reasoning": {
      "providerId": "deepseek",
      "baseUrl": "https://api.deepseek.com/v1",
      "model": "deepseek-reasoner",
      "endpointKind": "openai"
    },
    "completion": {
      "providerId": "anthropic",
      "baseUrl": "https://api.anthropic.com/v1",
      "model": "claude-3-5-sonnet-20241022",
      "endpointKind": "anthropic"
    },
    "value": {
      "providerId": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "model": "anthropic/claude-3-haiku",
      "endpointKind": "openai"
    }
  }
}
```

## Security & Isolation (Invariant 6)

Per **Invariant 6**, all provider state must remain strictly isolated. 
1. `ProviderRouter` never leaks headers between requests.
2. If `MIXED_PROVIDERS_CONFIG` is not set, the router gracefully degrades to the globally active provider (`effectiveProvider`).
3. Keys are dynamically fetched per request, mapped through VS Code's `SecretStorage`.

## Endpoint Kinds
- `openai`: Translates Anthropic messages to OpenAI chat completions format. 
- `anthropic`: Forwards Anthropic `/v1/messages` payloads transparently.

## Future Phases (Phase 3b)
The Webview UI currently displays a single mix-provider toggle. The complete per-tier dropdown controls will be deployed in a future iteration. Until then, mixed config can be set programmatically via `mixed-presets.json` or by deploying CLI scripts that invoke `saveMixedProviders` payloads.
