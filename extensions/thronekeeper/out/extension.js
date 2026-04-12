"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const os = __importStar(require("os"));
const undici_1 = require("undici");
const Secrets_1 = require("./services/Secrets");
const ProxyManager_1 = require("./services/ProxyManager");
const PanelViewProvider_1 = require("./views/PanelViewProvider");
const ClaudeSettings_1 = require("./services/ClaudeSettings");
let proxy = null;
/**
 * Update a claudeThrone setting in VS Code with validation and structured fallback handling.
 *
 * Attempts to read the existing value before writing, updates `claudeThrone.{key}` to `value` for the given target, and invokes the optional `fallback` if the property is unregistered or the update fails.
 *
 * @param config - The workspace configuration object to update
 * @param key - Configuration key under the `claudeThrone` namespace (without the `claudeThrone.` prefix)
 * @param value - The value to write for the configuration key
 * @param target - The configuration target (global or workspace) to apply the change to
 * @param fallback - Optional async action to run when the configuration key is not recognized or the update cannot be applied
 * @returns `true` if the configuration was updated successfully, `false` otherwise
 */
async function safeConfigUpdate(config, key, value, target, fallback) {
    try {
        const fullKey = `claudeThrone.${key}`;
        // Check if configuration property exists by attempting to read it first
        try {
            const currentValue = config.get(key);
            console.log(`[safeConfigUpdate] Updating ${fullKey}, current value:`, currentValue, 'new value:', value);
        }
        catch (readErr) {
            console.warn(`[safeConfigUpdate] Configuration property ${fullKey} may not be registered:`, readErr);
            if (fallback) {
                await fallback();
                return false;
            }
            // Continue with update attempt anyway
        }
        await config.update(key, value, target);
        console.log(`[safeConfigUpdate] ✅ Successfully updated ${fullKey}`);
        return true;
    }
    catch (err) {
        console.error(`[safeConfigUpdate] ❌ Failed to update claudeThrone.${key}:`, err);
        // Handle specific configuration errors
        if (err?.name === 'CodeExpectedError' || err?.message?.includes('not a registered configuration')) {
            console.warn(`[safeConfigUpdate] Configuration property not recognized, attempting fallback...`);
            if (fallback) {
                await fallback();
                return false;
            }
            // Suggest configuration reload
            vscode.window.showWarningMessage(`Configuration property 'claudeThrone.${key}' is not available. Try reloading VS Code or check extension installation.`, 'Reload VS Code').then(selection => {
                if (selection === 'Reload VS Code') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        }
        return false;
    }
}
/**
 * Retrieves the latest Anthropic model IDs for opus, sonnet, and haiku, falling back to hardcoded defaults when necessary.
 *
 * @param secrets - Optional SecretsService instance to retrieve Anthropic API key for authenticated requests
 * @returns An object with `opus`, `sonnet`, and `haiku` fields containing the chosen model IDs; if fetching or selection fails, returns predefined default model IDs.
 */
async function fetchAnthropicDefaults(secrets) {
    try {
        // Build headers conditionally with authentication if available
        const headers = {
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
        };
        let isAuthenticated = false;
        if (secrets) {
            const apiKey = await secrets.getAnthropicKey();
            if (apiKey) {
                headers['x-api-key'] = apiKey;
                isAuthenticated = true;
            }
        }
        console.log(`[fetchAnthropicDefaults] Making ${isAuthenticated ? 'authenticated' : 'unauthenticated'} request to Anthropic API`);
        const response = await (0, undici_1.request)('https://api.anthropic.com/v1/models', {
            method: 'GET',
            headers
        });
        // Handle authentication errors specifically
        if (response.statusCode === 401 || response.statusCode === 403) {
            console.log(`[fetchAnthropicDefaults] Authentication failed (${response.statusCode}), falling back to defaults`);
            if (secrets) {
                // Show user-friendly guidance
                vscode.window.showWarningMessage('Anthropic API key is missing or invalid. Run "Thronekeeper: Store Anthropic API Key" to set your key and get the latest model defaults.', 'Set API Key').then(selection => {
                    if (selection === 'Set API Key') {
                        vscode.commands.executeCommand('claudeThrone.storeAnthropicKey');
                    }
                });
            }
            // Fall through to catch block to return defaults
            throw new Error(`Authentication failed: ${response.statusCode}`);
        }
        const data = await response.body.json();
        const models = data.data || [];
        // Helper to select best model: prefer -latest alias, exclude -preview and other unstable suffixes
        const selectBestModel = (filtered, fallback) => {
            if (filtered.length === 0)
                return fallback;
            // Filter out models without valid IDs
            const validModels = filtered.filter((m) => m && m.id && typeof m.id === 'string');
            if (validModels.length === 0)
                return fallback;
            // First, look for -latest alias (most stable and recommended)
            const latestAlias = validModels.find((m) => m.id.endsWith('-latest'));
            if (latestAlias)
                return latestAlias.id;
            // Filter out preview/unstable versions
            const stable = validModels.filter((m) => !m.id.includes('-preview') &&
                !m.id.includes('-beta') &&
                !m.id.includes('-alpha'));
            // Sort stable versions descending and take first
            if (stable.length > 0) {
                // Add major version family filtering
                const majorVersions = stable.map((m) => {
                    const match = m.id.match(/-(\d+)(?:-|$)/);
                    return match ? parseInt(match[1]) : 0;
                }).filter(v => v > 0);
                if (majorVersions.length === 0) {
                    // Skip major family filter and sort by date instead
                    stable.sort((a, b) => {
                        const aDateMatch = a.id.match(/(\d{8})$/);
                        const bDateMatch = b.id.match(/(\d{8})$/);
                        const aDate = aDateMatch ? parseInt(aDateMatch[1]) : 0;
                        const bDate = bDateMatch ? parseInt(bDateMatch[1]) : 0;
                        return bDate - aDate; // Descending by date
                    });
                    return stable[0].id;
                }
                const maxMajorVersion = Math.max(...majorVersions);
                const latestMajorFamily = stable.filter((m) => {
                    const match = m.id.match(/-(\d+)(?:-|$)/);
                    return match ? parseInt(match[1]) === maxMajorVersion : false;
                });
                // Replace broken lexicographic sorting with date-based sorting
                latestMajorFamily.sort((a, b) => {
                    const aDateMatch = a.id.match(/(\d{8})$/);
                    const bDateMatch = b.id.match(/(\d{8})$/);
                    const aDate = aDateMatch ? parseInt(aDateMatch[1]) : 0;
                    const bDate = bDateMatch ? parseInt(bDateMatch[1]) : 0;
                    return bDate - aDate; // Descending by date
                });
                return latestMajorFamily[0].id;
            }
            // If no stable versions, fall back to any version (sorted)
            validModels.sort((a, b) => b.id.localeCompare(a.id));
            return validModels[0].id;
        };
        // Find latest Opus model
        const opusModels = models.filter((m) => m.id.includes('opus'));
        const opus = selectBestModel(opusModels, 'claude-opus-4-1-20250805');
        // Find latest Sonnet model
        const sonnetModels = models.filter((m) => m.id.includes('sonnet'));
        const sonnet = selectBestModel(sonnetModels, 'claude-sonnet-4-5-20250929');
        // Find latest Haiku model
        const haikuModels = models.filter((m) => m.id.includes('haiku'));
        const haiku = selectBestModel(haikuModels, 'claude-3-5-haiku-latest');
        // Add detailed logging
        console.log(`[fetchAnthropicDefaults] Model selection summary:`);
        console.log(`  Opus: ${opusModels.length} candidates, selected: ${opus}`);
        console.log(`  Sonnet: ${sonnetModels.length} candidates, selected: ${sonnet}`);
        console.log(`  Haiku: ${haikuModels.length} candidates, selected: ${haiku}`);
        if (opusModels.length > 0) {
            console.log(`  Opus candidates: ${opusModels.map((m) => m.id).join(', ')}`);
        }
        if (sonnetModels.length > 0) {
            console.log(`  Sonnet candidates: ${sonnetModels.map((m) => m.id).join(', ')}`);
        }
        if (haikuModels.length > 0) {
            console.log(`  Haiku candidates: ${haikuModels.map((m) => m.id).join(', ')}`);
        }
        return { opus, sonnet, haiku };
    }
    catch (error) {
        const authStatus = secrets ? (await secrets.getAnthropicKey() ? 'authenticated' : 'unauthenticated') : 'no secrets service';
        console.error(`[fetchAnthropicDefaults] Failed to fetch (${authStatus}):`, error);
        // Return hardcoded fallbacks if fetch fails
        return { opus: 'claude-opus-4-1-20250805', sonnet: 'claude-sonnet-4-5-20250929', haiku: 'claude-3-5-haiku-latest' };
    }
}
/**
 * Initialize and register Thronekeeper extension services, views, and commands.
 *
 * Sets up the output channel (shown when debug is enabled), initializes secrets and proxy managers,
 * caches Anthropic model defaults, registers webview view providers, and registers commands for:
 * storing provider keys, starting/stopping the local proxy, applying/reverting Anthropic/Claude settings,
 * and reporting proxy status. Subscribes created disposables to the provided extension context.
 *
 * @param context - The VS Code extension context used to register subscriptions and persist state
 */
function activate(context) {
    const log = vscode.window.createOutputChannel('Thronekeeper');
    log.appendLine('🚀 Thronekeeper extension activating...');
    // Only show output channel if debug mode is enabled
    const cfg = vscode.workspace.getConfiguration('claudeThrone');
    const debug = cfg.get('proxy.debug', false);
    if (debug) {
        log.show();
    }
    const secrets = new Secrets_1.SecretsService(context.secrets);
    log.appendLine('✅ Secrets service initialized');
    proxy = new ProxyManager_1.ProxyManager(context, log, secrets);
    log.appendLine('✅ Proxy manager initialized');
    // Cache Anthropic defaults in background
    fetchAnthropicDefaults(secrets).then(async (defaults) => {
        const cfg = vscode.workspace.getConfiguration('claudeThrone');
        await cfg.update('anthropicDefaults', defaults, vscode.ConfigurationTarget.Global);
        await cfg.update('anthropicDefaultsTimestamp', Date.now(), vscode.ConfigurationTarget.Global);
        log.appendLine(`✅ Cached Anthropic defaults: opus=${defaults.opus}, sonnet=${defaults.sonnet}, haiku=${defaults.haiku}`);
    }).catch((err) => {
        log.appendLine(`⚠️ Failed to cache Anthropic defaults: ${err}`);
    });
    // Register the sidebar/activity bar panel view
    log.appendLine('📋 Registering webview view providers...');
    let panelProvider = null;
    try {
        panelProvider = new PanelViewProvider_1.PanelViewProvider(context, secrets, proxy, log);
        log.appendLine('✅ Panel provider created');
        context.subscriptions.push(vscode.window.registerWebviewViewProvider('claudeThrone.panel', panelProvider), vscode.window.registerWebviewViewProvider('claudeThrone.activity', panelProvider));
        log.appendLine('✅ Webview providers registered (panel + activity bar)');
    }
    catch (err) {
        log.appendLine(`❌ FATAL: Failed to initialize webview panel: ${err?.stack || err}`);
        log.show(); // Show output channel on fatal error
        vscode.window.showErrorMessage('Thronekeeper failed to initialize. Check the Output panel for details.', 'Show Output', 'Enable Debug Logging', 'Reload Window').then(async (action) => {
            if (action === 'Show Output') {
                log.show();
            }
            else if (action === 'Enable Debug Logging') {
                const cfg = vscode.workspace.getConfiguration('claudeThrone');
                await cfg.update('proxy.debug', true, vscode.ConfigurationTarget.Global);
                log.show();
                vscode.window.showInformationMessage('Debug logging enabled. Reload window to apply changes.');
            }
            else if (action === 'Reload Window') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
        // Continue with extension activation even if panel fails to load
        // This allows commands to still work for troubleshooting
    }
    // Commands
    const openPanel = vscode.commands.registerCommand('claudeThrone.openPanel', async () => {
        // Try bottom panel first, fallback to Activity Bar view
        if (panelProvider) {
            const panelOpened = await tryOpenView('claudeThrone.panel');
            if (!panelOpened) {
                const activityBarOpened = await tryOpenView('claudeThrone.activity');
                if (!activityBarOpened) {
                    await panelProvider.reveal();
                }
            }
        }
        else {
            vscode.window.showErrorMessage('Thronekeeper panel failed to initialize. Check the Output panel for details.');
            log.show();
        }
    });
    const revertApply = vscode.commands.registerCommand('claudeThrone.revertApply', async (options) => {
        try {
            const cfg = vscode.workspace.getConfiguration('claudeThrone');
            const scopeStr = cfg.get('applyScope', 'workspace');
            const scope = scopeStr === 'global' ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace;
            let settingsDir;
            if (scopeStr === 'global') {
                settingsDir = os.homedir();
            }
            else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                // Multi-root workspace support: allow user to select target folder
                if (vscode.workspace.workspaceFolders.length > 1) {
                    // Auto-select first folder if requested (e.g., when called from stopProxy)
                    if (options?.autoSelectFirstFolder) {
                        log.appendLine('[revertApply] Auto-selecting first workspace folder (called from stopProxy)');
                        settingsDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
                    }
                    else {
                        const items = vscode.workspace.workspaceFolders.map(folder => ({
                            label: folder.name,
                            description: folder.uri.fsPath,
                            folder: folder
                        }));
                        const selected = await vscode.window.showQuickPick(items, {
                            placeHolder: 'Select workspace folder to revert Claude Code settings',
                            ignoreFocusOut: true
                        });
                        if (!selected) {
                            return; // User cancelled
                        }
                        settingsDir = selected.folder.uri.fsPath;
                    }
                }
                else {
                    settingsDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
                }
            }
            // Check cache age before fetching fresh defaults
            const cachedTimestamp = cfg.get('anthropicDefaultsTimestamp', 0);
            const cacheAge = Date.now() - cachedTimestamp;
            const stalenessThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
            if (cachedTimestamp > 0 && cacheAge > stalenessThreshold) {
                const daysOld = Math.floor(cacheAge / (24 * 60 * 60 * 1000));
                log.appendLine(`[revertApply] ⚠️ Cache is ${daysOld} days old (threshold: 7 days), fetching fresh defaults...`);
            }
            else if (cachedTimestamp > 0) {
                const daysOld = Math.floor(cacheAge / (24 * 60 * 60 * 1000));
                log.appendLine(`[revertApply] Cache is ${daysOld} days old, fetching fresh defaults...`);
            }
            else {
                log.appendLine('[revertApply] No cache timestamp found, fetching fresh defaults...');
            }
            // Try to fetch fresh defaults from API (if key is available)
            log.appendLine('[revertApply] Attempting to fetch fresh Anthropic model defaults...');
            let defaults = await fetchAnthropicDefaults(secrets);
            let usedFreshDefaults = true;
            if (defaults.opus && defaults.sonnet && defaults.haiku) {
                log.appendLine(`[revertApply] ✅ Fetched fresh defaults: opus=${defaults.opus}, sonnet=${defaults.sonnet}, haiku=${defaults.haiku}`);
                // Update cache with fresh values using safe configuration updates
                const defaultsSuccess = await safeConfigUpdate(cfg, 'anthropicDefaults', defaults, vscode.ConfigurationTarget.Global);
                const timestampSuccess = await safeConfigUpdate(cfg, 'anthropicDefaultsTimestamp', Date.now(), vscode.ConfigurationTarget.Global);
                if (!defaultsSuccess || !timestampSuccess) {
                    log.appendLine('[revertApply] ⚠️ Failed to cache fresh defaults, but will continue with revert operation');
                }
            }
            else {
                // Should not happen since fetchAnthropicDefaults always returns defaults, but keep fallback logic
                log.appendLine('[revertApply] ⚠️ Unexpected: defaults missing fields, falling back to cached values');
                usedFreshDefaults = false;
                const cached = cfg.get('anthropicDefaults', null);
                if (cached)
                    defaults = cached;
            }
            // Single atomic operation: remove Thronekeeper overrides and restore Anthropic defaults
            if (settingsDir) {
                const restoreEnv = {
                    // Always set base URL to Anthropic
                    ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
                };
                // If we have cached defaults, restore model settings
                if (defaults?.opus && defaults?.sonnet && defaults?.haiku) {
                    restoreEnv.ANTHROPIC_MODEL = defaults.sonnet;
                    restoreEnv.ANTHROPIC_DEFAULT_OPUS_MODEL = defaults.opus;
                    restoreEnv.ANTHROPIC_DEFAULT_SONNET_MODEL = defaults.sonnet;
                    restoreEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL = defaults.haiku;
                }
                else {
                    // No cached defaults: explicitly remove model env vars
                    // (Claude Code will use its own defaults)
                    restoreEnv.ANTHROPIC_MODEL = null;
                    restoreEnv.ANTHROPIC_DEFAULT_OPUS_MODEL = null;
                    restoreEnv.ANTHROPIC_DEFAULT_SONNET_MODEL = null;
                    restoreEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL = null;
                }
                // Remove Claude Code environment variables when reverting
                restoreEnv.API_TIMEOUT_MS = null;
                restoreEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = null;
                restoreEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = null;
                // Single call: atomic update
                await (0, ClaudeSettings_1.updateClaudeSettings)(settingsDir, restoreEnv, /*revert*/ false);
            }
            // NOTE: We do NOT clear reasoningModel/completionModel here anymore
            // User's saved model preferences should persist across proxy stop/start cycles
            // Only .claude/settings.json is reverted to Anthropic defaults for Claude Code CLI
            // Restore base URL to Anthropic defaults in extension settings
            const candidates = [
                { section: 'anthropic', key: 'baseUrl' },
                { section: 'claude', key: 'baseUrl' },
                { section: 'claudeCode', key: 'baseUrl' },
                { section: 'claude-code', key: 'baseUrl' },
                { section: 'claude', key: 'apiBaseUrl' },
                { section: 'claudeCode', key: 'apiBaseUrl' },
            ];
            const restored = [];
            for (const c of candidates) {
                try {
                    const s = vscode.workspace.getConfiguration(c.section);
                    const current = s.get(c.key);
                    if (current !== undefined) {
                        // Restore to Anthropic default instead of just removing
                        await s.update(c.key, 'https://api.anthropic.com', scope);
                        restored.push(`${c.section}.${c.key}`);
                    }
                }
                catch { }
            }
            // Handle terminal env vars based on applyToTerminal setting
            const applyToTerminal = cfg.get('applyToTerminal', false);
            let termTouched = 0;
            const termKeys = [
                'terminal.integrated.env.osx',
                'terminal.integrated.env.linux',
                'terminal.integrated.env.windows',
            ];
            if (applyToTerminal) {
                // applyToTerminal is enabled: restore ANTHROPIC_BASE_URL to Anthropic default
                for (const key of termKeys) {
                    try {
                        const wsConfig = vscode.workspace.getConfiguration();
                        const cur = (wsConfig.get(key) || {});
                        if ('ANTHROPIC_BASE_URL' in cur) {
                            const next = { ...cur, ANTHROPIC_BASE_URL: 'https://api.anthropic.com' };
                            await wsConfig.update(key, next, scope);
                            termTouched++;
                        }
                    }
                    catch { }
                }
            }
            else {
                // applyToTerminal is disabled: clean up any stale ANTHROPIC_* vars
                // (they may have been left by old versions or manual edits)
                log.appendLine('[revertApply] applyToTerminal=false, cleaning any stale terminal env vars...');
                for (const key of termKeys) {
                    try {
                        const wsConfig = vscode.workspace.getConfiguration();
                        const cur = wsConfig.get(key);
                        // If ANTHROPIC_* vars exist, remove them
                        if (cur && (cur.ANTHROPIC_BASE_URL || cur.ANTHROPIC_MODEL)) {
                            const cleaned = { ...cur };
                            delete cleaned.ANTHROPIC_BASE_URL;
                            delete cleaned.ANTHROPIC_MODEL;
                            delete cleaned.ANTHROPIC_DEFAULT_OPUS_MODEL;
                            delete cleaned.ANTHROPIC_DEFAULT_SONNET_MODEL;
                            delete cleaned.ANTHROPIC_DEFAULT_HAIKU_MODEL;
                            // Only update if we actually removed something
                            if (Object.keys(cleaned).length !== Object.keys(cur).length) {
                                await wsConfig.update(key, Object.keys(cleaned).length > 0 ? cleaned : undefined, scope);
                                termTouched++;
                                log.appendLine(`[revertApply] Cleaned stale ANTHROPIC_* vars from ${key}`);
                            }
                        }
                    }
                    catch (err) {
                        log.appendLine(`[revertApply] Failed to clean ${key}: ${err}`);
                    }
                }
            }
            const parts = [];
            if (restored.length)
                parts.push(`extensions: ${restored.join(', ')}`);
            if (termTouched)
                parts.push(`terminal env: ${termTouched} target(s)`);
            if (defaults && defaults.opus && defaults.sonnet && defaults.haiku) {
                const source = usedFreshDefaults ? 'fetched latest from API' : 'cached';
                parts.push(`models (${source}): ${defaults.opus.split('-').slice(-1)[0]} (Opus), ${defaults.sonnet.split('-').slice(-1)[0]} (Sonnet), ${defaults.haiku.split('-').slice(-1)[0]} (Haiku)`);
            }
            if (parts.length) {
                vscode.window.showInformationMessage(`Restored Anthropic defaults (${parts.join(' | ')}). Open a new terminal for env changes to take effect.`);
            }
            else {
                vscode.window.showInformationMessage('No Claude overrides were found to restore.');
            }
        }
        catch (err) {
            log.appendLine(`[revertApply] Unexpected error during revert: ${err?.stack || err}`);
            // Handle configuration errors specifically
            if (err?.message?.includes('not a registered configuration') || err?.name === 'CodeExpectedError') {
                const action = await vscode.window.showWarningMessage('Configuration error during revert. Some configuration properties may not be available. Try reloading VS Code or run "Thronekeeper: Check Configuration Health".', 'Check Config Health', 'Reload VS Code');
                if (action === 'Check Config Health') {
                    await vscode.commands.executeCommand('claudeThrone.checkConfigHealth');
                }
                else if (action === 'Reload VS Code') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            }
            else {
                vscode.window.showErrorMessage(`Failed to revert settings: ${err?.message || err}`);
            }
        }
    });
    const storeOpenRouterKey = vscode.commands.registerCommand('claudeThrone.storeOpenRouterKey', async () => {
        await storeKey('openrouter', secrets);
    });
    const storeOpenAIKey = vscode.commands.registerCommand('claudeThrone.storeOpenAIKey', async () => {
        await storeKey('openai', secrets);
    });
    const storeTogetherKey = vscode.commands.registerCommand('claudeThrone.storeTogetherKey', async () => {
        await storeKey('together', secrets);
    });
    const storeDeepseekKey = vscode.commands.registerCommand('claudeThrone.storeDeepseekKey', async () => {
        await storeKey('deepseek', secrets);
    });
    const storeGlmKey = vscode.commands.registerCommand('claudeThrone.storeGlmKey', async () => {
        await storeKey('glm', secrets);
    });
    const storeKimiKey = vscode.commands.registerCommand('claudeThrone.storeKimiKey', async () => {
        await storeKey('kimi', secrets);
    });
    const storeMinimaxKey = vscode.commands.registerCommand('claudeThrone.storeMinimaxKey', async () => {
        await storeKey('minimax', secrets);
    });
    const storeCustomKey = vscode.commands.registerCommand('claudeThrone.storeCustomKey', async () => {
        await storeKey('custom', secrets);
    });
    const storeAnyKey = vscode.commands.registerCommand('claudeThrone.storeAnyKey', async () => {
        const pick = await vscode.window.showQuickPick([
            { label: 'OpenRouter', id: 'openrouter' },
            { label: 'OpenAI', id: 'openai' },
            { label: 'Together', id: 'together' },
            { label: 'Deepseek', id: 'deepseek' },
            { label: 'GLM', id: 'glm' },
            { label: 'Kimi', id: 'kimi' },
            { label: 'Minimax', id: 'minimax' },
            { label: 'Custom', id: 'custom' },
        ], { title: 'Choose Provider', canPickMany: false });
        if (!pick)
            return;
        await storeKey(pick.id, secrets);
    });
    const storeAnthropicKey = vscode.commands.registerCommand('claudeThrone.storeAnthropicKey', async () => {
        await storeAnthropicKeyHelper(secrets);
    });
    context.subscriptions.push(openPanel, storeOpenRouterKey, storeOpenAIKey, storeTogetherKey, storeDeepseekKey, storeGlmKey, storeKimiKey, storeMinimaxKey, storeCustomKey, storeAnyKey, storeAnthropicKey);
    const refreshAnthropicDefaults = vscode.commands.registerCommand('claudeThrone.refreshAnthropicDefaults', async () => {
        try {
            const defaults = await fetchAnthropicDefaults(secrets);
            const cfg = vscode.workspace.getConfiguration('claudeThrone');
            // Use safe configuration updates for both properties
            const defaultsSuccess = await safeConfigUpdate(cfg, 'anthropicDefaults', defaults, vscode.ConfigurationTarget.Global);
            const timestampSuccess = await safeConfigUpdate(cfg, 'anthropicDefaultsTimestamp', Date.now(), vscode.ConfigurationTarget.Global);
            if (defaultsSuccess && timestampSuccess) {
                log.appendLine(`[refreshAnthropicDefaults] ✅ Successfully refreshed defaults: Opus=${defaults.opus}, Sonnet=${defaults.sonnet}, Haiku=${defaults.haiku}`);
                vscode.window.showInformationMessage(`Anthropic defaults refreshed: Opus=${defaults.opus}, Sonnet=${defaults.sonnet}, Haiku=${defaults.haiku}`);
            }
            else {
                log.appendLine(`[refreshAnthropicDefaults] ⚠️ Partial success - some configuration updates failed`);
            }
        }
        catch (err) {
            log.appendLine(`Failed to refresh Anthropic defaults: ${err?.message || err}`);
            // Check if it's a settings conflict error
            if (err?.message?.includes('unsaved changes') || err?.name === 'CodeExpectedError') {
                const action = await vscode.window.showWarningMessage('Could not update Anthropic defaults: Please save your VS Code settings first, then try again.', 'Open Settings');
                if (action === 'Open Settings') {
                    await vscode.commands.executeCommand('workbench.action.openSettings', 'claudeThrone.anthropicDefaults');
                }
            }
            else {
                vscode.window.showErrorMessage(`Failed to refresh Anthropic defaults: ${err?.message || err}`);
            }
        }
    });
    const startProxy = vscode.commands.registerCommand('claudeThrone.startProxy', async () => {
        try {
            const startTime = Date.now();
            const cfg = vscode.workspace.getConfiguration('claudeThrone');
            const provider = cfg.get('provider', 'openrouter');
            const customBaseUrl = cfg.get('customBaseUrl', '');
            const port = cfg.get('proxy.port', 3000);
            const debug = cfg.get('proxy.debug', false);
            const reasoningModel = cfg.get('reasoningModel');
            const completionModel = cfg.get('completionModel');
            const twoModelMode = cfg.get('twoModelMode', false);
            log.appendLine(`[startProxy] Starting with config: provider=${provider}, port=${port}, twoModelMode=${twoModelMode}`);
            log.appendLine(`[startProxy] Models: reasoning=${reasoningModel}, completion=${completionModel}`);
            // All providers (including Deepseek, GLM, and custom Anthropic endpoints) now route through the proxy
            // The proxy handles authentication and forwards requests to the appropriate provider URL
            await proxy.start({ provider, customBaseUrl, port, debug, reasoningModel, completionModel });
            const elapsed = Date.now() - startTime;
            log.appendLine(`[startProxy] Proxy started in ${elapsed}ms`);
            vscode.window.showInformationMessage(`Thronekeeper: proxy started on port ${port}`);
            const auto = cfg.get('autoApply', true);
            if (auto) {
                log.appendLine('[startProxy] autoApply enabled, applying settings to Claude Code...');
                // Wait for proxy to be fully ready before applying settings
                await new Promise(resolve => setTimeout(resolve, 1000));
                await vscode.commands.executeCommand('claudeThrone.applyToClaudeCode');
            }
            else {
                log.appendLine('[startProxy] autoApply disabled, configuration must be applied manually');
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to start proxy: ${err?.message || err}`);
            log.appendLine(`[extension] start proxy error: ${err?.stack || err}`);
        }
    });
    const stopProxy = vscode.commands.registerCommand('claudeThrone.stopProxy', async () => {
        try {
            const ok = await proxy.stop();
            vscode.window.showInformationMessage(`Thronekeeper: proxy stopped${ok ? '' : ' (not running)'}`);
            const cfg = vscode.workspace.getConfiguration('claudeThrone');
            const auto = cfg.get('autoApply', true);
            if (auto) {
                await vscode.commands.executeCommand('claudeThrone.revertApply', { autoSelectFirstFolder: true });
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to stop proxy: ${err?.message || err}`);
            log.appendLine(`[extension] stop proxy error: ${err?.stack || err}`);
        }
    });
    const status = vscode.commands.registerCommand('claudeThrone.status', async () => {
        const s = proxy.getStatus();
        vscode.window.showInformationMessage(`Thronekeeper: proxy ${s.running ? 'running' : 'stopped'}${s.port ? ' on ' + s.port : ''}`);
    });
    const applyToClaudeCode = vscode.commands.registerCommand('claudeThrone.applyToClaudeCode', async () => {
        const cfg = vscode.workspace.getConfiguration('claudeThrone');
        const port = cfg.get('proxy.port', 3000);
        const baseUrl = `http://127.0.0.1:${port}`;
        const reasoningModel = cfg.get('reasoningModel');
        const completionModel = cfg.get('completionModel');
        const valueModel = cfg.get('valueModel');
        const scopeStr = cfg.get('applyScope', 'workspace');
        const scope = scopeStr === 'global' ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace;
        const twoModelMode = cfg.get('twoModelMode', false);
        const opusPlanMode = cfg.get('opusPlanMode', false);
        const env = { ANTHROPIC_BASE_URL: baseUrl };
        // Add optional Claude Code environment variables
        const apiTimeoutMs = cfg.get('claudeCode.apiTimeoutMs');
        if (apiTimeoutMs !== undefined && apiTimeoutMs !== null) {
            env.API_TIMEOUT_MS = String(apiTimeoutMs);
        }
        const disableNonessentialTraffic = cfg.get('claudeCode.disableNonessentialTraffic', false);
        if (disableNonessentialTraffic) {
            env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = 1;
        }
        log.appendLine(`[applyToClaudeCode] Scope: ${scopeStr}`);
        log.appendLine(`[applyToClaudeCode] Applying config: twoModelMode=${twoModelMode}, opusPlanMode=${opusPlanMode}`);
        log.appendLine(`[applyToClaudeCode] Input models: reasoning='${reasoningModel || 'EMPTY'}', coding='${completionModel || 'EMPTY'}', value='${valueModel || 'EMPTY'}'`);
        // Comment 7: Log model configuration to verify propagation
        log.appendLine(`[applyToClaudeCode] Model configuration - reasoningModel: ${reasoningModel || 'NOT SET'}, completionModel: ${completionModel || 'NOT SET'}, valueModel: ${valueModel || 'NOT SET'}`);
        log.appendLine(`[applyToClaudeCode] Two-model mode: ${twoModelMode}`);
        // Fallback: If reasoningModel is empty but completionModel is set, use completionModel for all defaults
        let effectiveReasoningModel = reasoningModel;
        let effectiveCompletionModel = completionModel;
        let effectiveValueModel = valueModel;
        if (!effectiveReasoningModel && effectiveCompletionModel) {
            log.appendLine(`[applyToClaudeCode] Fallback: reasoningModel empty, using completionModel='${effectiveCompletionModel}' for all tiers`);
            effectiveReasoningModel = effectiveCompletionModel;
        }
        if (twoModelMode && effectiveReasoningModel && effectiveCompletionModel && effectiveValueModel) {
            // Three-model mode: use specific models for each task type
            // OpusPlan mode: Use 'opusplan' model identifier while respecting user's tier mappings
            const modelIdentifier = (opusPlanMode && twoModelMode) ? 'opusplan' : effectiveReasoningModel;
            log.appendLine(`[applyToClaudeCode] Three-model mode enabled${opusPlanMode ? ' with OpusPlan mode' : ''}`);
            log.appendLine(`[applyToClaudeCode] - Model identifier: ${modelIdentifier}`);
            log.appendLine(`[applyToClaudeCode] - OPUS (complex reasoning): ${effectiveReasoningModel}`);
            log.appendLine(`[applyToClaudeCode] - SONNET (balanced coding): ${effectiveCompletionModel}`);
            log.appendLine(`[applyToClaudeCode] - HAIKU (fast value): ${effectiveValueModel}`);
            env.ANTHROPIC_MODEL = modelIdentifier;
            env.ANTHROPIC_DEFAULT_OPUS_MODEL = effectiveReasoningModel;
            env.ANTHROPIC_DEFAULT_SONNET_MODEL = effectiveCompletionModel;
            env.ANTHROPIC_DEFAULT_HAIKU_MODEL = effectiveValueModel;
        }
        else if (twoModelMode && effectiveReasoningModel && effectiveCompletionModel && !effectiveValueModel) {
            // Legacy two-model mode: fallback for partial configuration
            log.appendLine(`[applyToClaudeCode] Two-model mode (legacy): using reasoning for Opus, completion for Sonnet/Haiku`);
            log.appendLine(`[applyToClaudeCode] - OPUS (complex reasoning): ${effectiveReasoningModel}`);
            log.appendLine(`[applyToClaudeCode] - SONNET (balanced coding): ${effectiveCompletionModel}`);
            log.appendLine(`[applyToClaudeCode] - HAIKU (fast value): ${effectiveCompletionModel}`);
            env.ANTHROPIC_MODEL = effectiveReasoningModel;
            env.ANTHROPIC_DEFAULT_OPUS_MODEL = effectiveReasoningModel;
            env.ANTHROPIC_DEFAULT_SONNET_MODEL = effectiveCompletionModel;
            env.ANTHROPIC_DEFAULT_HAIKU_MODEL = effectiveCompletionModel;
        }
        else if (effectiveReasoningModel) {
            // Single-model mode: use reasoning model for everything
            log.appendLine(`[applyToClaudeCode] Single-model mode: using ${effectiveReasoningModel} for all tiers (Opus/Sonnet/Haiku)`);
            env.ANTHROPIC_MODEL = effectiveReasoningModel;
            env.ANTHROPIC_DEFAULT_OPUS_MODEL = effectiveReasoningModel;
            env.ANTHROPIC_DEFAULT_SONNET_MODEL = effectiveReasoningModel;
            env.ANTHROPIC_DEFAULT_HAIKU_MODEL = effectiveReasoningModel;
        }
        else {
            // No models configured at all - explicitly remove model env vars to prevent stale values
            log.appendLine(`[applyToClaudeCode] ⚠️ WARNING: No models configured!`);
            log.appendLine(`[applyToClaudeCode] ⚠️ Explicitly removing model env vars to prevent stale values`);
            env.ANTHROPIC_MODEL = null;
            env.ANTHROPIC_DEFAULT_OPUS_MODEL = null;
            env.ANTHROPIC_DEFAULT_SONNET_MODEL = null;
            env.ANTHROPIC_DEFAULT_HAIKU_MODEL = null;
        }
        // KHA-269: Agent Teams feature (Claude Agent Teams is the evolution of sub-agents)
        const featureFlags = cfg.get('featureFlags', {});
        if (featureFlags.enableAgentTeams === true) {
            env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
            log.appendLine('[applyToClaudeCode] Agent Teams enabled via feature flag');
        }
        else {
            env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = null;
        }
        log.appendLine(`[applyToClaudeCode] Env vars to write: ${JSON.stringify(Object.keys(env))}`);
        log.appendLine(`[applyToClaudeCode] Will write models to settings.json: ${!!reasoningModel}`);
        let settingsDir;
        if (scopeStr === 'global') {
            settingsDir = os.homedir();
        }
        else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            // Multi-root workspace support: allow user to select target folder
            if (vscode.workspace.workspaceFolders.length > 1) {
                const items = vscode.workspace.workspaceFolders.map(folder => ({
                    label: folder.name,
                    description: folder.uri.fsPath,
                    folder: folder
                }));
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select workspace folder to apply Claude Code settings',
                    ignoreFocusOut: true
                });
                if (!selected) {
                    log.appendLine('[applyToClaudeCode] User cancelled workspace folder selection');
                    return; // User cancelled
                }
                settingsDir = selected.folder.uri.fsPath;
                log.appendLine(`[applyToClaudeCode] Selected workspace folder: ${settingsDir}`);
            }
            else {
                settingsDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
            }
        }
        if (settingsDir) {
            log.appendLine(`[applyToClaudeCode] Settings directory: ${settingsDir}`);
            const settingsPath = require('path').join(settingsDir, '.claude', 'settings.json');
            log.appendLine(`[applyToClaudeCode] Target path: ${settingsPath}`);
            log.appendLine(`[applyToClaudeCode] Environment variables: ${JSON.stringify(env, null, 2)}`);
            try {
                await (0, ClaudeSettings_1.updateClaudeSettings)(settingsDir, env);
                log.appendLine('[applyToClaudeCode] ✅ Successfully wrote .claude/settings.json');
            }
            catch (err) {
                log.appendLine(`[applyToClaudeCode] ❌ ERROR writing settings: ${err}`);
                throw err;
            }
        }
        else {
            log.appendLine('[applyToClaudeCode] ⚠️ WARNING: No settings directory found (no workspace open?)');
        }
        // 1) Try to apply to known Claude/Anthropic extension settings (if enabled)
        const applyToExtensions = cfg.get('applyToExtensions', false);
        const applied = [];
        if (applyToExtensions) {
            log.appendLine('[applyToClaudeCode] applyToExtensions=true, writing to other extension settings...');
            const candidates = [
                { section: 'anthropic', key: 'baseUrl' },
                { section: 'claude', key: 'baseUrl' },
                { section: 'claudeCode', key: 'baseUrl' },
                { section: 'claude-code', key: 'baseUrl' },
                { section: 'claude', key: 'apiBaseUrl' },
                { section: 'claudeCode', key: 'apiBaseUrl' },
            ];
            for (const c of candidates) {
                try {
                    const s = vscode.workspace.getConfiguration(c.section);
                    await s.update(c.key, baseUrl, scope);
                    applied.push(`${c.section}.${c.key}`);
                }
                catch { }
            }
            log.appendLine(`[applyToClaudeCode] Updated ${applied.length} extension setting(s)`);
        }
        else {
            log.appendLine('[applyToClaudeCode] applyToExtensions=false, skipping other extension settings');
        }
        // 2) Apply to VS Code integrated terminal env for CLI usage (claude/claude-code)
        // This is now OPTIONAL and disabled by default (controlled by applyToTerminal setting)
        const applyToTerminal = cfg.get('applyToTerminal', false);
        const termApplied = [];
        if (applyToTerminal) {
            log.appendLine('[applyToClaudeCode] applyToTerminal=true, writing terminal env vars...');
            const termKeys = [
                'terminal.integrated.env.osx',
                'terminal.integrated.env.linux',
                'terminal.integrated.env.windows',
            ];
            for (const key of termKeys) {
                try {
                    const current = vscode.workspace.getConfiguration().get(key) || {};
                    if (current['ANTHROPIC_BASE_URL'] === baseUrl) {
                        termApplied.push(key);
                        continue;
                    }
                    const updated = { ...current, ANTHROPIC_BASE_URL: baseUrl };
                    await vscode.workspace.getConfiguration().update(key, updated, scope);
                    termApplied.push(key);
                }
                catch { }
            }
            log.appendLine(`[applyToClaudeCode] Terminal env vars written to ${termApplied.length} platform(s)`);
        }
        else {
            log.appendLine('[applyToClaudeCode] applyToTerminal=false, skipping terminal env vars');
        }
        const parts = [];
        if (settingsDir)
            parts.push('.claude/settings.json');
        if (applied.length)
            parts.push(`extensions: ${applied.join(', ')}`);
        if (termApplied.length)
            parts.push(`terminal env (new terminals): ${termApplied.length} target(s)`);
        log.appendLine(`[applyToClaudeCode] Summary: Applied to ${parts.join(', ')}`);
        if (parts.length) {
            const message = `Applied proxy configuration to Claude Code (${parts.join(', ')}). ${termApplied.length > 0 ? 'Open a new terminal for env changes.' : 'Restart Claude Code or open a new chat to use the proxy.'}`;
            vscode.window.showInformationMessage(message);
            log.appendLine(`[applyToClaudeCode] ✅ ${message}`);
        }
        else {
            const warning = `No Claude Code settings detected. Set base URL to ${baseUrl} in the Claude/Anthropic extension or export ANTHROPIC_BASE_URL in your shell.`;
            vscode.window.showWarningMessage(warning);
            log.appendLine(`[applyToClaudeCode] ⚠️ WARNING: ${warning}`);
        }
    });
    // Diagnostic command to check configuration health
    const checkConfigHealthCommand = vscode.commands.registerCommand('claudeThrone.checkConfigHealth', async () => {
        try {
            console.log('[checkConfigHealth] Starting configuration health check...');
            const healthIssues = [];
            const cfg = vscode.workspace.getConfiguration('claudeThrone');
            // Keys to check for scope conflicts
            const keysToCheck = [
                'modelSelectionsByProvider',
                'reasoningModel',
                'completionModel',
                'valueModel',
                'provider'
            ];
            console.log('[checkConfigHealth] Checking scope configurations...');
            // Collect scope issues using inspect()
            const scopeIssues = [];
            for (const key of keysToCheck) {
                const inspection = cfg.inspect(key);
                if (!inspection) {
                    // Key is not registered - append report line and continue
                    healthIssues.push(`⚠️ **Unregistered Configuration Key**: '${key}' is not registered in extension contributions.`);
                    healthIssues.push('**Suggestion**: Reload the window or reinstall the extension build.');
                    healthIssues.push('');
                    console.warn(`[checkConfigHealth] Key '${key}' is not registered in extension contributions`);
                    continue;
                }
                const { defaultValue, globalValue, workspaceValue, workspaceFolderValue } = inspection;
                const hasWorkspace = workspaceValue !== undefined && workspaceValue !== null &&
                    (typeof workspaceValue === 'string' ? workspaceValue.trim() !== '' : true);
                const hasGlobal = globalValue !== undefined && globalValue !== null &&
                    (typeof globalValue === 'string' ? globalValue.trim() !== '' : true);
                const hasWorkspaceFolder = workspaceFolderValue !== undefined && workspaceFolderValue !== null &&
                    (typeof workspaceFolderValue === 'string' ? workspaceFolderValue.trim() !== '' : true);
                // Check for conflicts between global and workspace
                if (hasWorkspace && hasGlobal && JSON.stringify(workspaceValue) !== JSON.stringify(globalValue)) {
                    scopeIssues.push({
                        key,
                        defaultValue,
                        globalValue,
                        workspaceValue,
                        workspaceFolderValue,
                        hasWorkspace,
                        hasGlobal,
                        hasWorkspaceFolder
                    });
                }
                // Check if workspace-scoped keys are set only in global (potential issue)
                if (!hasWorkspace && hasGlobal && ['reasoningModel', 'completionModel', 'valueModel'].includes(key)) {
                    scopeIssues.push({
                        key,
                        defaultValue,
                        globalValue,
                        workspaceValue,
                        workspaceFolderValue,
                        hasWorkspace,
                        hasGlobal,
                        hasWorkspaceFolder
                    });
                }
            }
            if (scopeIssues.length > 0) {
                healthIssues.push(`Found ${scopeIssues.length} configuration value(s) with scope conflicts (Global vs Workspace). This may indicate manual edits or import issues.`);
                healthIssues.push('');
                // Add detailed scope information for each issue
                for (const issue of scopeIssues) {
                    healthIssues.push(`### **${issue.key}**`);
                    // Show which scopes have values
                    if (issue.hasGlobal) {
                        healthIssues.push(`- **Global**: ${JSON.stringify(issue.globalValue)}`);
                    }
                    if (issue.hasWorkspace) {
                        healthIssues.push(`- **Workspace**: ${JSON.stringify(issue.workspaceValue)}`);
                    }
                    if (issue.hasWorkspaceFolder) {
                        healthIssues.push(`- **Workspace Folder**: ${JSON.stringify(issue.workspaceFolderValue)}`);
                    }
                    if (issue.defaultValue !== undefined) {
                        healthIssues.push(`- **Default**: ${JSON.stringify(issue.defaultValue)}`);
                    }
                    // Special handling for modelSelectionsByProvider
                    if (issue.key === 'modelSelectionsByProvider' && issue.hasGlobal && issue.hasWorkspace) {
                        const globalModels = issue.globalValue;
                        const workspaceModels = issue.workspaceValue;
                        // Compare provider entries
                        const allProviders = new Set([...Object.keys(globalModels || {}), ...Object.keys(workspaceModels || {})]);
                        const differingProviders = [];
                        for (const provider of allProviders) {
                            const globalProvider = globalModels?.[provider];
                            const workspaceProvider = workspaceModels?.[provider];
                            if (JSON.stringify(globalProvider) !== JSON.stringify(workspaceProvider)) {
                                differingProviders.push(provider);
                            }
                        }
                        if (differingProviders.length > 0) {
                            healthIssues.push(`- **Differing providers**: ${differingProviders.join(', ')}`);
                        }
                    }
                    healthIssues.push('');
                }
            }
            // Check for stale model combinations
            const modelSelectionsByProvider = cfg.get('modelSelectionsByProvider', {});
            const provider = cfg.get('provider', 'openrouter');
            if (modelSelectionsByProvider[provider]) {
                const providerModels = modelSelectionsByProvider[provider];
                if (providerModels.reasoning) {
                    const reasoning = providerModels.reasoning;
                    const isStaleCombination = (provider === 'deepseek' && reasoning.includes('gpt')) ||
                        (provider === 'glm' && reasoning.includes('gpt')) ||
                        (provider === 'together' && reasoning.includes('gpt') && !reasoning.includes('meta-llama')) ||
                        (provider === 'openrouter' && reasoning.startsWith('gpt-') && !providerModels.completion);
                    if (isStaleCombination) {
                        healthIssues.push(`⚠️ **Stale Model Detected**: Using "${reasoning}" for ${provider}. This may be from a different provider. Consider re-selecting models.`);
                    }
                }
            }
            // Generate health report
            let report = '# Thronekeeper Configuration Health Report\n\n';
            if (healthIssues.length === 0) {
                report += '✅ **All checks passed!** No configuration issues detected.\n\n';
                report += 'Configuration is healthy and properly scoped.\n';
            }
            else {
                report += '## Issues Found\n\n';
                report += healthIssues.join('\n');
                report += '\n## Recommended Actions\n\n';
                report += 'To fix scope conflicts:\n';
                report += '1. Use "Thronekeeper: Reset Configuration" to clear all values and reconfigure\n';
                report += '2. OR manually ensure values exist in only one scope (Global OR Workspace)\n';
                report += '3. Use VS Code Settings editor to view values across all scopes\n';
            }
            report += '\n---\n';
            report += `Generated: ${new Date().toISOString()}\n`;
            // Always show details - provide action options
            const action = await vscode.window.showInformationMessage(healthIssues.length === 0
                ? 'Configuration health check: All good!'
                : `Configuration issues found: ${healthIssues.length}`, healthIssues.length > 0 ? 'Show Details' : 'Show Report', 'Copy to Clipboard', healthIssues.length > 0 ? 'Reset Config' : 'OK');
            if (action === 'Show Report' || action === 'Show Details' || (action === 'OK' && healthIssues.length === 0)) {
                const doc = await vscode.workspace.openTextDocument({
                    content: report,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc);
            }
            else if (action === 'Copy to Clipboard') {
                await vscode.env.clipboard.writeText(report);
                vscode.window.showInformationMessage('Configuration health report copied to clipboard');
            }
            else if (action === 'Reset Config') {
                await resetConfiguration(cfg);
                const reload = await vscode.window.showInformationMessage('Configuration reset complete. Please restart VS Code to ensure UI reflects the clean state.', 'Restart Now', 'Later');
                if (reload === 'Restart Now') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            }
        }
        catch (err) {
            console.error('[checkConfigHealth] Unexpected error:', err);
            vscode.window.showErrorMessage(`Configuration health check failed: ${err?.message || err}`);
        }
    });
    /**
     * Clears Thronekeeper-related settings from both workspace and user (global) scopes, then writes a minimal baseline configuration.
     *
     * Attempts to remove known Thronekeeper keys from workspace and global scopes, sets the default provider to "openrouter" in the global scope, and restores cached `anthropicDefaults` to global if present.
     *
     * @param cfg - The VS Code workspace configuration instance to update.
     * @throws Propagates any unexpected error that occurs during the reset operation.
     */
    async function resetConfiguration(cfg) {
        try {
            console.log('[resetConfiguration] Clearing all Thronekeeper settings from both scopes...');
            // Keys to clear from both scopes
            const keysToClear = [
                'modelSelectionsByProvider',
                'reasoningModel',
                'completionModel',
                'valueModel',
                'provider',
                'selectedCustomProviderId',
                'customBaseUrl',
                'customProviders',
                'savedCombos',
                'twoModelMode',
                'proxy.port',
                'proxy.debug',
                'autoApply',
                'applyScope'
            ];
            // Clear from Workspace scope
            for (const key of keysToClear) {
                try {
                    await cfg.update(key, undefined, vscode.ConfigurationTarget.Workspace);
                }
                catch (err) {
                    console.warn(`[resetConfiguration] Failed to clear ${key} from Workspace:`, err);
                }
            }
            // Clear from Global scope
            for (const key of keysToClear) {
                try {
                    await cfg.update(key, undefined, vscode.ConfigurationTarget.Global);
                }
                catch (err) {
                    console.warn(`[resetConfiguration] Failed to clear ${key} from Global:`, err);
                }
            }
            // Write minimal baseline configuration to appropriate scope
            try {
                console.log('[resetConfiguration] Writing baseline configuration...');
                // Set default provider to Global scope (as it's typically a user preference)
                await cfg.update('provider', 'openrouter', vscode.ConfigurationTarget.Global);
                // Restore anthropicDefaults from cache if available
                const cachedDefaults = cfg.get('anthropicDefaults');
                if (cachedDefaults && cachedDefaults.opus && cachedDefaults.sonnet && cachedDefaults.haiku) {
                    await safeConfigUpdate(cfg, 'anthropicDefaults', cachedDefaults, vscode.ConfigurationTarget.Global);
                }
                console.log('[resetConfiguration] Baseline configuration written successfully');
            }
            catch (err) {
                console.warn('[resetConfiguration] Failed to write baseline configuration:', err);
            }
            console.log('[resetConfiguration] Configuration cleared successfully from both scopes');
        }
        catch (err) {
            console.error('[resetConfiguration] Error during reset:', err);
            throw err;
        }
    }
    context.subscriptions.push(openPanel, storeOpenRouterKey, storeOpenAIKey, storeTogetherKey, storeDeepseekKey, storeGlmKey, storeCustomKey, storeAnyKey, storeAnthropicKey, refreshAnthropicDefaults, startProxy, stopProxy, status, applyToClaudeCode, revertApply, log, checkConfigHealthCommand);
    log.appendLine('✅ Thronekeeper extension fully activated and ready');
}
/**
 * Attempts to open a VS Code view by its view ID.
 *
 * @param viewId - The identifier of the view to open (e.g., the view's registered ID)
 * @returns `true` if the view was opened successfully, `false` otherwise.
 */
async function tryOpenView(viewId) {
    try {
        await vscode.commands.executeCommand('workbench.view.openView', viewId, true);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Prompt the user for an Anthropic API key, store it securely, and attempt to refresh and cache the latest Anthropic model defaults.
 *
 * If the entered key does not begin with "sk-" a non-blocking warning is shown but the key is accepted. On success the extension will fetch model defaults and update its cached Anthropic defaults and timestamp; if fetching or configuration updates fail, the key remains stored and the user is notified.
 *
 * @param secrets - SecretsService used to persist the Anthropic API key securely
 */
async function storeAnthropicKeyHelper(secrets) {
    const key = await vscode.window.showInputBox({
        title: 'Enter Anthropic API Key',
        prompt: 'Used to fetch latest model defaults from Anthropic API. Optional - extension works without it.',
        password: true,
        ignoreFocusOut: true,
        validateInput: (v) => {
            // Only check for non-empty input; accept any format
            if (!v || v.trim().length === 0)
                return 'Key is required';
            return undefined;
        }
    });
    if (!key)
        return; // User cancelled
    // Optional non-blocking warning for unusual key formats
    if (!key.startsWith('sk-')) {
        vscode.window.showWarningMessage('Key does not start with "sk-"; please verify it is correct');
    }
    // Split key storage from defaults update
    try {
        // Store the key first
        await secrets.setAnthropicKey(key);
        vscode.window.showInformationMessage('Anthropic API key stored securely. Fetching latest model defaults...');
    }
    catch (err) {
        vscode.window.showErrorMessage(`Failed to store Anthropic API key: ${err?.message || err}`);
        return;
    }
    // Then attempt to update defaults in a separate try-catch
    try {
        const defaults = await fetchAnthropicDefaults(secrets);
        if (defaults) {
            // Update cached defaults using safe configuration updates
            const cfg = vscode.workspace.getConfiguration('claudeThrone');
            const defaultsSuccess = await safeConfigUpdate(cfg, 'anthropicDefaults', defaults, vscode.ConfigurationTarget.Global);
            const timestampSuccess = await safeConfigUpdate(cfg, 'anthropicDefaultsTimestamp', Date.now(), vscode.ConfigurationTarget.Global);
            // Show success with discovered versions
            if (defaultsSuccess && timestampSuccess) {
                vscode.window.showInformationMessage(`Updated Anthropic defaults: Opus=${defaults.opus}, Sonnet=${defaults.sonnet}, Haiku=${defaults.haiku}`);
            }
            else {
                vscode.window.showWarningMessage('Anthropic API key stored, but some configuration updates failed. See logs for details.');
            }
        }
        else {
            vscode.window.showWarningMessage('Anthropic API key stored, but failed to fetch model defaults. Will use cached values.');
        }
    }
    catch (err) {
        // Check if it's a settings conflict error
        if (err?.message?.includes('unsaved changes') || err?.name === 'CodeExpectedError') {
            vscode.window.showWarningMessage('Anthropic API key stored. To update model defaults, please save your VS Code settings and run "Thronekeeper: Refresh Anthropic Defaults".', 'Open Settings').then(selection => {
                if (selection === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'claudeThrone.anthropicDefaults');
                }
            });
        }
        else {
            vscode.window.showWarningMessage(`Anthropic API key stored, but could not refresh defaults: ${err?.message || err}`);
        }
    }
}
/**
 * Prompt for an API key for the given provider and store it in the extension's secret storage.
 *
 * @param provider - Provider identifier (e.g., `openrouter`, `openai`, `together`, `deepseek`, `glm`, `custom`)
 */
async function storeKey(provider, secrets) {
    const titles = {
        openrouter: 'OpenRouter API Key',
        openai: 'OpenAI API Key',
        together: 'Together API Key',
        deepseek: 'Deepseek API Key',
        glm: 'GLM API Key',
        kimi: 'Kimi Coding Plan API Key',
        minimax: 'Minimax API Key',
        custom: 'Custom Provider API Key',
    };
    const key = await vscode.window.showInputBox({
        title: `Enter ${titles[provider]}`,
        prompt: 'Your key will be stored securely in your OS keychain via VS Code SecretStorage',
        password: true,
        ignoreFocusOut: true,
        validateInput: (v) => v && v.trim().length > 0 ? undefined : 'Key is required'
    });
    if (!key)
        return;
    await secrets.setProviderKey(provider, key);
    vscode.window.showInformationMessage(`${titles[provider]} stored successfully`);
}
function deactivate() {
    try {
        proxy?.stop();
    }
    catch { }
}
//# sourceMappingURL=extension.js.map