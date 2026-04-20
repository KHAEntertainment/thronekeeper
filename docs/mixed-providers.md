# Mixed Provider Routing (KHA-267)

Claude Throne supports surgical, per-tier provider routing via the **Mixed Provider** configuration. This allows you to route different conceptual tiers (Reasoning, Completion, Value) to disparate API providers simultaneously within a single session.

## Architecture: The ProviderContext

The core of the mixed provider system is the `ProviderContext`. Unlike standard configurations which rely on globally active credentials (`API_KEY`), mixed routing evaluates each request and constructs a temporary `ProviderContext` mapping specifically for that request.

```javascript
const context = {
  providerId: 'deepseek',
  baseUrl: 'https://api.deepseek.com/anthropic',
  key: 'sk-deepseek-...',
  model: 'deepseek-reasoner',
  endpointKind: 'anthropic'
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
      "baseUrl": "https://api.deepseek.com/anthropic",
      "model": "deepseek-reasoner",
      "endpointKind": "anthropic"
    },
    "completion": {
      "providerId": "anthropic",
      "baseUrl": "https://api.anthropic.com",
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
3. The extension resolves each configured provider key from VS Code `SecretStorage` before proxy startup and injects only the enabled mixed configuration into `MIXED_PROVIDERS_CONFIG`.
4. If mixed mode is enabled but a configured provider key is missing, startup fails before the proxy is launched.

## Endpoint Kinds
- `openai`: Translates Anthropic messages to OpenAI chat completions format. 
- `anthropic`: Forwards Anthropic `/v1/messages` payloads transparently.

## Webview Flow

The webview now exposes tabbed provider controls when mixed providers and three-model mode are enabled. The primary provider tab owns the default provider state, and up to two additional provider tabs can be added for mixed routing. Each tab persists normal provider/model selections first, then `saveMixedProviders` stores the per-tier binding with `{ reasoning, completion, value }` keys.

Disabling the mixed provider toggle persists `enabled: false` so the extension clears `MIXED_PROVIDERS_CONFIG` on the next proxy start. Built-in providers contribute their known base URLs automatically; custom providers use their saved base URL and endpoint-kind override.
