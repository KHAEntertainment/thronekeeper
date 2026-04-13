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
exports.ProxyManager = void 0;
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("node:child_process"));
const path = __importStar(require("node:path"));
const redaction_1 = require("../utils/redaction");
const http = __importStar(require("http"));
class ProxyManager {
    constructor(ctx, log, secrets) {
        this.ctx = ctx;
        this.log = log;
        this.secrets = secrets;
        this.proc = null;
        this.onStatusChangedEmitter = new vscode.EventEmitter();
        this.onStatusChanged = this.onStatusChangedEmitter.event;
        this.healthCheckTimer = null;
    }
    getStatus() {
        return { running: !!this.proc && !this.proc.killed, port: this.currentPort, pid: this.proc?.pid };
    }
    async checkHealth() {
        if (!this.currentPort || !this.proc || this.proc.killed) {
            return false;
        }
        return new Promise(resolve => {
            const req = http.get(`http://127.0.0.1:${this.currentPort}/health`, res => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const json = JSON.parse(data);
                            resolve(json && json.status === 'ok');
                        }
                        catch {
                            resolve(false);
                        }
                    }
                    else {
                        resolve(false);
                    }
                });
            });
            req.on('error', () => resolve(false));
            const cfg = vscode.workspace.getConfiguration('claudeThrone');
            const healthTimeoutMs = cfg.get('proxy.healthTimeoutMs', 500);
            req.setTimeout(healthTimeoutMs, () => {
                req.destroy();
                resolve(false);
            });
        });
    }
    async waitForPort(port, timeout) {
        // Use configured timeout or default
        const cfg = vscode.workspace.getConfiguration('claudeThrone');
        const effectiveTimeout = timeout ?? cfg.get('proxy.startupTimeoutMs', 3000);
        const startTime = Date.now();
        while (Date.now() - startTime < effectiveTimeout) {
            const isListening = await new Promise(resolve => {
                const testReq = http.get(`http://127.0.0.1:${port}/health`, res => {
                    resolve(res.statusCode === 200);
                });
                testReq.on('error', () => resolve(false));
                testReq.setTimeout(100, () => {
                    testReq.destroy();
                    resolve(false);
                });
            });
            if (isListening) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return false;
    }
    async checkStaleInstance(port) {
        return new Promise(resolve => {
            const req = http.get(`http://127.0.0.1:${port}/health`, res => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    // Check if response is 200 and has expected health check shape
                    if (res.statusCode === 200) {
                        try {
                            const json = JSON.parse(data);
                            // If we get a valid health check response, consider it a stale proxy
                            resolve(json && json.status === 'ok');
                        }
                        catch {
                            // If we can't parse JSON, treat as non-health check response
                            resolve(false);
                        }
                    }
                    else {
                        resolve(false);
                    }
                });
            });
            req.on('error', () => resolve(false));
            req.setTimeout(500, () => {
                req.destroy();
                resolve(false);
            });
        });
    }
    async start(opts) {
        if (this.proc && !this.proc.killed) {
            this.log.appendLine('[proxy] already running');
            return;
        }
        const isStale = await this.checkStaleInstance(opts.port);
        if (isStale) {
            const choice = await vscode.window.showWarningMessage(`Another process is already running on port ${opts.port}.`, 'Start Anyway', 'Cancel');
            if (choice !== 'Start Anyway') {
                return;
            }
        }
        const startTime = Date.now();
        const nodeBin = process.execPath;
        const entry = this.ctx.asAbsolutePath(path.join('bundled', 'proxy', 'index.cjs'));
        // Read saved models from VS Code configuration if not explicitly provided
        const cfg = vscode.workspace.getConfiguration('claudeThrone');
        if (!opts.reasoningModel) {
            const savedReasoningModel = cfg.get('reasoningModel');
            if (savedReasoningModel) {
                opts.reasoningModel = savedReasoningModel;
                this.log.appendLine(`[ProxyManager] Loaded saved reasoning model from config: ${savedReasoningModel}`);
            }
        }
        if (!opts.completionModel) {
            const savedCompletionModel = cfg.get('completionModel');
            if (savedCompletionModel) {
                opts.completionModel = savedCompletionModel;
                this.log.appendLine(`[ProxyManager] Loaded saved completion model from config: ${savedCompletionModel}`);
            }
        }
        // Build provider env
        const env = await this.buildEnvForProvider(opts);
        // Log configuration for diagnostics
        this.log.appendLine(`[ProxyManager] Starting proxy with configuration:`);
        this.log.appendLine(`[ProxyManager] - Provider: ${opts.provider}`);
        this.log.appendLine(`[ProxyManager] - Port: ${opts.port}`);
        this.log.appendLine(`[ProxyManager] - Debug: ${opts.debug || false}`);
        this.log.appendLine(`[ProxyManager] - Reasoning Model: ${opts.reasoningModel || 'not set'} ${opts.reasoningModel && cfg.get('reasoningModel') === opts.reasoningModel ? '(from config)' : ''}`);
        this.log.appendLine(`[ProxyManager] - Completion Model: ${opts.completionModel || 'not set'} ${opts.completionModel && cfg.get('completionModel') === opts.completionModel ? '(from config)' : ''}`);
        this.log.appendLine(`[ProxyManager] - Custom Base URL: ${opts.customBaseUrl || 'none'}`);
        // Log Anthropic-native provider mode
        if (opts.provider === 'deepseek' || opts.provider === 'glm') {
            this.log.appendLine(`[ProxyManager] Anthropic-native provider detected: ${opts.provider}`);
            this.log.appendLine(`[ProxyManager] Proxy will inject x-api-key header and forward to provider endpoint`);
            this.log.appendLine(`[ProxyManager] Provider endpoint: ${opts.provider === 'deepseek' ? 'https://api.deepseek.com/anthropic' : 'https://api.z.ai/api/anthropic'}`);
        }
        // Log environment variable keys (without exposing sensitive values)
        const envKeys = Object.keys(env).filter(k => k.includes('API_KEY') || k.includes('MODEL') || k.includes('BASE_URL'));
        this.log.appendLine(`[ProxyManager] - Environment variables set: ${envKeys.join(', ')}`);
        // Comment 1: Verify Anthropic-native provider keys are present before spawn
        if (opts.provider === 'deepseek' && !env.DEEPSEEK_API_KEY) {
            const errorMsg = 'Deepseek API key missing. Store key before starting proxy.';
            this.log.appendLine(`[ProxyManager] ERROR: ${errorMsg}`);
            throw new Error(errorMsg);
        }
        if (opts.provider === 'glm' && !env.ZAI_API_KEY && !env.GLM_API_KEY) {
            const errorMsg = 'GLM API key missing. Store key before starting proxy.';
            this.log.appendLine(`[ProxyManager] ERROR: ${errorMsg}`);
            throw new Error(errorMsg);
        }
        this.log.appendLine(`[proxy] starting via ${nodeBin} ${entry} on port ${opts.port}`);
        // Explicitly add ZAI_API_KEY to environment if it exists
        const proxyEnv = { ...env };
        if (process.env.ZAI_API_KEY) {
            proxyEnv.ZAI_API_KEY = process.env.ZAI_API_KEY;
        }
        this.proc = cp.spawn(nodeBin, [entry, '--port', String(opts.port)], {
            env: proxyEnv,
            stdio: 'pipe',
            detached: false,
        });
        const pid = this.proc.pid;
        this.log.appendLine(`[ProxyManager] Proxy process spawned with PID: ${pid}`);
        const shouldRedact = opts.debug || vscode.workspace.getConfiguration('claudeThrone').get('proxy.debug', false);
        let firstOutput = true;
        this.proc.stdout?.on('data', (b) => {
            let output = b.toString().trimEnd();
            if (shouldRedact) {
                output = (0, redaction_1.redactSecrets)(output);
            }
            if (firstOutput) {
                const elapsed = Date.now() - startTime;
                this.log.appendLine(`[ProxyManager] First stdout received after ${elapsed}ms`);
                firstOutput = false;
            }
            this.log.appendLine(`[proxy] ${output}`);
        });
        this.proc.stderr?.on('data', (b) => {
            let output = b.toString().trimEnd();
            if (shouldRedact) {
                output = (0, redaction_1.redactSecrets)(output);
            }
            this.log.appendLine(`[proxy:err] ${output}`);
        });
        this.proc.on('exit', (code, signal) => {
            this.log.appendLine(`[proxy] exited code=${code} signal=${signal}`);
            this.proc = null;
            this.currentPort = undefined;
        });
        this.currentPort = opts.port;
        // Check if we should skip health check for faster startup
        const healthCfg = vscode.workspace.getConfiguration('claudeThrone');
        const skipHealthCheck = healthCfg.get('proxy.skipHealthCheck', false);
        if (skipHealthCheck) {
            this.log.appendLine('[ProxyManager] Skipping detailed health check (fast mode enabled)');
            // But still verify the port is at least listening
            const isListening = await this.waitForPort(opts.port, 2000);
            if (!isListening) {
                this.log.appendLine(`[ProxyManager] Warning: Port ${opts.port} is not responding after 2 seconds`);
                throw new Error(`Proxy started but port ${opts.port} is not listening`);
            }
            this.log.appendLine('[ProxyManager] Port is listening, proxy ready');
            return;
        }
        // Try health check immediately first (no delay)
        if (await this.checkHealth()) {
            const readyElapsed = Date.now() - startTime;
            this.log.appendLine(`[ProxyManager] Proxy ready immediately (${readyElapsed}ms)`);
            this.startHealthMonitoring();
            return;
        }
        // Only retry with delays if the immediate check failed
        let retries = 0;
        const maxRetries = 10;
        const retryDelay = 200; // Reduced from 500ms
        while (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            if (await this.checkHealth()) {
                const readyElapsed = Date.now() - startTime;
                this.log.appendLine(`[ProxyManager] Proxy ready after ${readyElapsed}ms`);
                this.startHealthMonitoring();
                return;
            }
            retries++;
        }
        // If we get here, proxy didn't start properly
        const failedElapsed = Date.now() - startTime;
        this.log.appendLine(`[ProxyManager] Proxy failed to start after ${failedElapsed}ms`);
        throw new Error('Proxy started but health check failed. Check the output for errors.');
    }
    startHealthMonitoring() {
        this.stopHealthMonitoring();
        // Check health every 30 seconds
        this.healthCheckTimer = setInterval(async () => {
            const isHealthy = await this.checkHealth();
            if (!isHealthy && this.proc && !this.proc.killed) {
                this.log.appendLine('[ProxyManager] Health check failed - proxy may have crashed');
                this.onStatusChangedEmitter.fire({ running: false });
            }
        }, 30000);
    }
    stopHealthMonitoring() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }
    async stop() {
        this.stopHealthMonitoring();
        if (!this.proc)
            return false;
        try {
            this.proc.kill('SIGTERM');
            this.proc = null;
            return true;
        }
        catch {
            return false;
        }
    }
    async buildEnvForProvider(opts) {
        const base = { ...process.env };
        base.PORT = String(opts.port);
        base.FORCE_PROVIDER = opts.provider;
        if (opts.debug)
            base.DEBUG = '1';
        // Only set model env vars if they have actual values (don't override with empty strings)
        if (opts.reasoningModel)
            base.REASONING_MODEL = opts.reasoningModel;
        if (opts.completionModel)
            base.COMPLETION_MODEL = opts.completionModel;
        // Load custom endpoint overrides from extension settings
        const cfg = vscode.workspace.getConfiguration('claudeThrone');
        const customEndpointOverrides = cfg.get('customEndpointOverrides', {});
        if (Object.keys(customEndpointOverrides).length > 0) {
            try {
                base.CUSTOM_ENDPOINT_OVERRIDES = JSON.stringify(customEndpointOverrides);
            }
            catch (err) {
                this.log.appendLine(`[ProxyManager] Failed to serialize customEndpointOverrides: ${err}`);
            }
        }
        const setBaseUrl = (url) => {
            base.ANTHROPIC_PROXY_BASE_URL = url;
        };
        switch (opts.provider) {
            case 'openrouter': {
                const key = await this.secrets.getProviderKey('openrouter');
                if (!key)
                    throw new Error('OpenRouter API key not set. Run: Claude Throne: Store OpenRouter API Key');
                base.OPENROUTER_API_KEY = key;
                setBaseUrl('https://openrouter.ai/api');
                break;
            }
            case 'openai': {
                const key = await this.secrets.getProviderKey('openai');
                if (!key)
                    throw new Error('OpenAI API key not set');
                base.OPENAI_API_KEY = key;
                setBaseUrl('https://api.openai.com');
                break;
            }
            case 'together': {
                const key = await this.secrets.getProviderKey('together');
                if (!key)
                    throw new Error('Together API key not set');
                base.TOGETHER_API_KEY = key;
                setBaseUrl('https://api.together.xyz');
                break;
            }
            case 'deepseek': {
                const key = await this.secrets.getProviderKey('deepseek');
                if (!key) {
                    const errorMsg = 'Deepseek API key not set. Run: Claude Throne: Store Deepseek API Key';
                    this.log.appendLine(`[ProxyManager] ERROR: ${errorMsg}`);
                    throw new Error(errorMsg);
                }
                base.DEEPSEEK_API_KEY = key;
                setBaseUrl('https://api.deepseek.com/anthropic');
                this.log.appendLine(`[ProxyManager] Deepseek key found: DEEPSEEK_API_KEY set`);
                break;
            }
            case 'glm': {
                const key = await this.secrets.getProviderKey('glm');
                if (!key) {
                    const errorMsg = 'GLM API key not set. Run: Claude Throne: Store GLM API Key';
                    this.log.appendLine(`[ProxyManager] ERROR: ${errorMsg}`);
                    throw new Error(errorMsg);
                }
                base.ZAI_API_KEY = key;
                base.GLM_API_KEY = key; // Comment 2: Also set GLM_API_KEY for backward compatibility
                setBaseUrl('https://api.z.ai/api/anthropic');
                this.log.appendLine(`[ProxyManager] GLM key found: ZAI_API_KEY and GLM_API_KEY set`);
                break;
            }
            case 'kimi': {
                const key = await this.secrets.getProviderKey('kimi');
                if (!key) {
                    const errorMsg = 'Kimi Coding Plan API key not set. Run: Claude Throne: Store Kimi API Key';
                    this.log.appendLine(`[ProxyManager] ERROR: ${errorMsg}`);
                    throw new Error(errorMsg);
                }
                base.ANTHROPIC_API_KEY = key;
                setBaseUrl('https://api.kimi.com/coding');
                this.log.appendLine(`[ProxyManager] Kimi Coding Plan key found: ANTHROPIC_API_KEY set`);
                break;
            }
            case 'minimax': {
                const key = await this.secrets.getProviderKey('minimax');
                if (!key) {
                    const errorMsg = 'Minimax API key not set. Run: Claude Throne: Store Minimax API Key';
                    this.log.appendLine(`[ProxyManager] ERROR: ${errorMsg}`);
                    throw new Error(errorMsg);
                }
                base.ANTHROPIC_AUTH_TOKEN = key;
                setBaseUrl('https://api.minimax.io/anthropic');
                this.log.appendLine(`[ProxyManager] Minimax key found: ANTHROPIC_AUTH_TOKEN set`);
                break;
            }
            case 'custom': {
                const baseUrl = (opts.customBaseUrl || '').trim();
                if (!baseUrl)
                    throw new Error('Custom base URL is empty; set claudeThrone.customBaseUrl');
                setBaseUrl(baseUrl);
                // Use customProviderId if provided, otherwise fall back to 'custom'
                const providerId = opts.customProviderId || 'custom';
                // Comment 3: Preflight check - verify secret key exists before starting proxy
                this.log.appendLine(`[ProxyManager] Checking secret key for custom provider: ${providerId}`);
                const key = await this.secrets.getProviderKey(providerId);
                if (!key) {
                    const errorMsg = `API key not set for provider: ${providerId}. Store key before starting proxy.`;
                    this.log.appendLine(`[ProxyManager] ERROR: ${errorMsg}`);
                    throw new Error(errorMsg);
                }
                this.log.appendLine(`[ProxyManager] Custom provider key found for: ${providerId}`);
                // The proxy resolves API key with CUSTOM_API_KEY / API_KEY first for custom URL
                base.API_KEY = key;
                break;
            }
            default: {
                // Handle dynamic custom providers (any string not in built-in cases)
                const customProviders = vscode.workspace.getConfiguration('claudeThrone').get('customProviders', []);
                const customProvider = customProviders.find(p => p.id === opts.provider);
                if (customProvider) {
                    // This is a saved custom provider
                    setBaseUrl(customProvider.baseUrl);
                    // Comment 3: Preflight check - verify secret key exists
                    this.log.appendLine(`[ProxyManager] Checking secret key for custom provider: ${opts.provider}`);
                    const key = await this.secrets.getProviderKey(opts.provider);
                    if (!key) {
                        const errorMsg = `API key not set for provider: ${opts.provider}. Store key before starting proxy.`;
                        this.log.appendLine(`[ProxyManager] ERROR: ${errorMsg}`);
                        throw new Error(errorMsg);
                    }
                    this.log.appendLine(`[ProxyManager] Custom provider key found for: ${opts.provider}`);
                    base.API_KEY = key;
                }
                else {
                    // Fallback for unknown providers
                    const baseUrl = (opts.customBaseUrl || '').trim();
                    if (!baseUrl)
                        throw new Error('Custom base URL is empty; set claudeThrone.customBaseUrl');
                    setBaseUrl(baseUrl);
                    // Comment 3: Preflight check - verify secret key exists
                    this.log.appendLine(`[ProxyManager] Checking secret key for provider: ${opts.provider}`);
                    const key = await this.secrets.getProviderKey(opts.provider);
                    if (!key) {
                        const errorMsg = `API key not set for provider: ${opts.provider}. Store key before starting proxy.`;
                        this.log.appendLine(`[ProxyManager] ERROR: ${errorMsg}`);
                        throw new Error(errorMsg);
                    }
                    this.log.appendLine(`[ProxyManager] Provider key found for: ${opts.provider}`);
                    base.API_KEY = key;
                }
                break;
            }
        }
        // KHA-267: Serialize mixed-provider config if enabled
        if (opts.mixedProviders?.enabled) {
            try {
                const mp = opts.mixedProviders;
                const tiers = ['reasoning', 'completion', 'value'];
                // Collect unique provider IDs to resolve keys
                const uniqueProviders = new Set();
                for (const tier of tiers) {
                    uniqueProviders.add(mp[tier].providerId);
                }
                // Resolve keys for each unique provider (smart key validation)
                const providerKeys = new Map();
                for (const pid of uniqueProviders) {
                    const key = await this.secrets.getProviderKey(pid);
                    if (key) {
                        providerKeys.set(pid, key);
                        this.log.appendLine(`[ProxyManager] Mixed provider key found for: ${pid}`);
                    }
                    else {
                        this.log.appendLine(`[ProxyManager] WARNING: No key found for mixed provider: ${pid}`);
                    }
                }
                // Build MIXED_PROVIDERS_CONFIG object
                const mixedConfig = {};
                for (const tier of tiers) {
                    const binding = mp[tier];
                    mixedConfig[tier] = {
                        providerId: binding.providerId,
                        baseUrl: binding.baseUrl,
                        key: providerKeys.get(binding.providerId) || null,
                        model: binding.model,
                        endpointKind: binding.endpointKind || undefined,
                    };
                }
                base.MIXED_PROVIDERS_CONFIG = JSON.stringify(mixedConfig);
                this.log.appendLine(`[ProxyManager] Mixed provider config serialized: ${uniqueProviders.size} unique providers`);
                this.log.appendLine(`[ProxyManager] Mixed tiers: reasoning=${mp.reasoning.providerId}/${mp.reasoning.model}, completion=${mp.completion.providerId}/${mp.completion.model}, value=${mp.value.providerId}/${mp.value.model}`);
            }
            catch (err) {
                this.log.appendLine(`[ProxyManager] Failed to serialize mixed provider config: ${err}`);
            }
        }
        return base;
    }
}
exports.ProxyManager = ProxyManager;
//# sourceMappingURL=ProxyManager.js.map