---
sources: docs/WARP.md, .github/PULL_REQUEST_TEMPLATE.md
last_updated: 2026-04-09
status: current
---

<!-- sources: docs/WARP.md, .github/PULL_REQUEST_TEMPLATE.md -->

# WARP: Contribution & Codebase Exploration Workflow

This page covers two closely related workflows: exploring the Thronekeeper codebase effectively, and contributing changes back through pull requests.

## Codebase Exploration (Warp Grep)

Use the **Warp Grep subagent** for broad semantic queries at the start of codebase exploration.

| Good for | Not good for |
|----------|--------------|
| "Find the XYZ flow" | Finding a specific variable name |
| "How does XYZ work?" | Searching for a literal string |
| "Where is XYZ handled?" | Pinpointing a single symbol |

For precise keyword/symbol lookups, use `Grep` directly.

## Constitution-Guarded Areas

Before touching these files, read `CONSTITUTION.md`:

| File | Area label |
|------|------------|
| `webview/main.js` | `area:webview` |
| `PanelViewProvider.ts` | `area:webview` |
| `AnthropicApply.ts` | `area:config` |

Any PR touching a guarded file **must** include:
- A completed Constitution compliance section
- Manual smoke test results
- Invariant documentation

## Invariants (Summary)

Full definitions live in `CONSTITUTION.md`. Brief reference:

1. **Provider map structure** — always `{ reasoning, completion, value }` per provider.
2. **Start/Stop hydration** — hydrate `reasoningModel`, `completionModel`, `valueModel` from the active provider *before* any apply operation.
3. **Model loading rules** — validate request token and provider match before rendering; cache all responses by provider.
4. **Event listener discipline** — remove existing listeners before adding new ones; debounce filter inputs.
5. **Configuration persistence** — write both legacy globals and provider selections atomically.

## Area Labels

Apply at least one label per PR:

| Label | Scope |
|-------|-------|
| `area:model-selection` | Model selection UI, combos, hydration |
| `area:provider` | Provider configuration, detection, switching |
| `area:proxy` | Proxy server, routing, transformation |
| `area:webview` | Webview UI, rendering, state management |
| `area:config` | VS Code settings, persistence, migration |

## PR Checklist

### Required for all PRs

- [ ] `npm test` passes
- [ ] No new TypeScript/lint warnings
- [ ] Changes match the declared area label(s)

### Required for guarded-area PRs

- [ ] Constitution compliance section filled in
- [ ] Invariants-touched list checked
- [ ] Schema updated if message/config contracts changed (`extensions/thronekeeper/src/schemas/`)
- [ ] Unit + integration + contract tests added/updated
- [ ] Manual smoke test results attached

### Smoke test checklist

1. Switch providers (OpenRouter ↔ GLM ↔ custom) — confirm model list differs per provider.
2. Select models, Start/Stop — check `settings.json` shows active provider models on first start.
3. Type rapidly in filter input — confirm no flicker, no duplicate event listeners (check console).

## Running Tests

```bash
# Core proxy tests
npm test

# Extension tests (post-rename path)
cd extensions/thronekeeper && npm test

# Smoke test
bash scripts/smoke.sh
```

> **Note:** The PR template and some docs still reference `extensions/claude-throne/`. The correct path after the `02fc078` rename is `extensions/thronekeeper/`. See [contradictions.md](../contradictions.md).

## Common Pitfalls

| Anti-pattern | Correct approach |
|-------------|-----------------|
| Using `'coding'` as a storage key | Always use `'completion'` |
| Rendering models from stale payloads | Check `payload.provider === state.provider` first |
| Applying without hydrating globals | Hydrate from active provider before any apply |
| Binding duplicate event listeners | Remove existing before adding; throttle/debounce filters |

## PR Template Reference

The canonical PR template is `.github/PULL_REQUEST_TEMPLATE.md`. It includes:

- Description + type of change
- Constitution compliance (guarded files, invariants, schema, tests)
- Area labels
- Manual smoke test results (provider switching, model persistence, settings.json content)
- Test coverage sign-off
- General checklist

Reference links in the template:
- `CONSTITUTION.md` — invariants and guarded area requirements
- `CLAUDE.md` — development workflows and testing requirements
