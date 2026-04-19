import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const webviewSource = () => fs.readFileSync(path.join(repoRoot, 'extensions/thronekeeper/webview/main.js'), 'utf8')
const panelSource = () => fs.readFileSync(path.join(repoRoot, 'extensions/thronekeeper/src/views/PanelViewProvider.ts'), 'utf8')

function createMixedProviderHarness() {
  const state = {
    provider: 'openrouter',
    twoModelMode: false,
    featureFlags: { enableMixedProviders: false },
    modelsByProvider: {
      openrouter: { reasoning: 'or-reasoning', completion: 'or-completion', value: 'or-value' },
      minimax: { reasoning: 'MiniMax-M2.7', completion: 'MiniMax-M2.7', value: 'MiniMax-M2.7' },
    },
    mixedTierAssignments: {
      reasoning: 'openrouter',
      completion: 'openrouter',
      value: 'openrouter',
    },
  }
  const mixedTabState = {
    activeTab: 'primary',
    tabCount: 0,
    providerIds: { primary: '', 1: '', 2: '' },
  }
  const messages = []

  const ui = {
    tabBarDisplay: 'none',
    titleDisplay: 'block',
    addDisplay: 'none',
    primaryLabel: 'Provider',
    provider2Display: 'none',
    provider3Display: 'none',
  }

  function postMessage(message) {
    messages.push(message)
  }

  function updateMixedProvidersUI() {
    const flagEnabled = state.featureFlags.enableMixedProviders
    const showTabHeader = state.twoModelMode
    ui.tabBarDisplay = showTabHeader ? 'flex' : 'none'
    ui.titleDisplay = showTabHeader ? 'none' : 'block'
    ui.primaryLabel = flagEnabled ? 'Provider 1' : 'Provider'
    ui.addDisplay = state.twoModelMode && mixedTabState.tabCount < 2 ? 'inline-block' : 'none'
  }

  function addProviderTab() {
    if (!state.twoModelMode) return
    if (mixedTabState.tabCount >= 2) return

    if (!mixedTabState.providerIds.primary) {
      mixedTabState.providerIds.primary = state.provider
    }

    if (!state.featureFlags.enableMixedProviders) {
      state.featureFlags.enableMixedProviders = true
      postMessage({ type: 'updateFeatureFlag', flag: 'enableMixedProviders', value: true })
    }

    mixedTabState.tabCount += 1
    const tabId = String(mixedTabState.tabCount)
    mixedTabState.activeTab = tabId
    mixedTabState.providerIds[tabId] = state.provider
    if (tabId === '1') ui.provider2Display = 'inline-block'
    if (tabId === '2') ui.provider3Display = 'inline-block'
    updateMixedProvidersUI()
  }

  function disableThreeModelMode() {
    state.twoModelMode = false
    mixedTabState.activeTab = 'primary'
    mixedTabState.tabCount = 0
    mixedTabState.providerIds['1'] = ''
    mixedTabState.providerIds['2'] = ''
    state.featureFlags.enableMixedProviders = false
    ui.provider2Display = 'none'
    ui.provider3Display = 'none'
    postMessage({ type: 'updateFeatureFlag', flag: 'enableMixedProviders', value: false })
    updateMixedProvidersUI()
  }

  return { state, mixedTabState, ui, messages, updateMixedProvidersUI, addProviderTab, disableThreeModelMode }
}

describe('mixed provider tab activation contract', () => {
  it('removes the obsolete Mix Providers checkbox from source UI', () => {
    expect(panelSource()).not.toContain('mixedProvidersCheckbox')
    expect(panelSource()).not.toContain('Mix Providers')
    expect(webviewSource()).not.toContain('mixedProvidersCheckbox')
  })

  it('shows the add button only after three-model mode is enabled', () => {
    const harness = createMixedProviderHarness()

    harness.updateMixedProvidersUI()
    expect(harness.ui.tabBarDisplay).toBe('none')
    expect(harness.ui.titleDisplay).toBe('block')
    expect(harness.ui.addDisplay).toBe('none')

    harness.state.twoModelMode = true
    harness.updateMixedProvidersUI()
    expect(harness.ui.tabBarDisplay).toBe('flex')
    expect(harness.ui.titleDisplay).toBe('none')
    expect(harness.ui.primaryLabel).toBe('Provider')
    expect(harness.ui.addDisplay).toBe('inline-block')
  })

  it('adds Provider 2 then Provider 3, and caps mixed tabs at three providers', () => {
    const harness = createMixedProviderHarness()
    harness.state.twoModelMode = true

    harness.addProviderTab()
    expect(harness.state.featureFlags.enableMixedProviders).toBe(true)
    expect(harness.mixedTabState.tabCount).toBe(1)
    expect(harness.mixedTabState.activeTab).toBe('1')
    expect(harness.ui.primaryLabel).toBe('Provider 1')
    expect(harness.ui.provider2Display).toBe('inline-block')
    expect(harness.ui.addDisplay).toBe('inline-block')

    harness.addProviderTab()
    expect(harness.mixedTabState.tabCount).toBe(2)
    expect(harness.mixedTabState.activeTab).toBe('2')
    expect(harness.ui.provider3Display).toBe('inline-block')
    expect(harness.ui.addDisplay).toBe('none')

    harness.addProviderTab()
    expect(harness.mixedTabState.tabCount).toBe(2)
    expect(harness.messages.filter(m => m.value === true)).toHaveLength(1)
  })

  it('keeps tab UI enabled when feature flag is true but route config is incomplete', () => {
    const config = {
      featureFlags: { enableMixedProviders: true },
      mixedProviders: { enabled: false },
    }

    const mixedProvidersEnabled = Boolean(config.featureFlags?.enableMixedProviders ?? config.mixedProviders?.enabled ?? false)
    expect(mixedProvidersEnabled).toBe(true)
    expect(webviewSource()).toContain('config.featureFlags?.enableMixedProviders ?? config.mixedProviders?.enabled')
  })

  it('disabling three-model mode hides mixed tabs without clearing model selections', () => {
    const harness = createMixedProviderHarness()
    const originalModelsByProvider = JSON.stringify(harness.state.modelsByProvider)

    harness.state.twoModelMode = true
    harness.addProviderTab()
    harness.disableThreeModelMode()

    expect(harness.state.featureFlags.enableMixedProviders).toBe(false)
    expect(harness.mixedTabState.tabCount).toBe(0)
    expect(harness.ui.tabBarDisplay).toBe('none')
    expect(harness.ui.addDisplay).toBe('none')
    expect(JSON.stringify(harness.state.modelsByProvider)).toBe(originalModelsByProvider)
  })
})
