"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUBLIC_API_ENDPOINTS = void 0;
exports.fetchPublicModels = fetchPublicModels;
exports.filterModels = filterModels;
exports.sortModels = sortModels;
exports.searchModels = searchModels;
// Static model catalogs for providers without public APIs
const STATIC_MODEL_CATALOGS = {
    openai: [
        {
            id: 'gpt-4o',
            name: 'GPT-4o',
            description: 'Multimodal flagship model with vision, audio, and text capabilities',
            context_length: 128000,
            provider: 'openai',
            pricing: { prompt: '0.005', completion: '0.015' },
            isFree: false
        },
        {
            id: 'gpt-4o-mini',
            name: 'GPT-4o Mini',
            description: 'Affordable, fast model for most tasks',
            context_length: 128000,
            provider: 'openai',
            pricing: { prompt: '0.00015', completion: '0.0006' },
            isFree: false
        },
        {
            id: 'gpt-4-turbo',
            name: 'GPT-4 Turbo',
            description: 'Knowledge up to April 2024, larger context window',
            context_length: 128000,
            provider: 'openai',
            pricing: { prompt: '0.01', completion: '0.03' },
            isFree: false
        },
        {
            id: 'gpt-3.5-turbo',
            name: 'GPT-3.5 Turbo',
            description: 'Fast, reliable for most text generation tasks',
            context_length: 16385,
            provider: 'openai',
            pricing: { prompt: '0.0015', completion: '0.002' },
            isFree: false
        },
        {
            id: 'o1-preview',
            name: 'OpenAI o1 Preview',
            description: 'Advanced reasoning model for complex problems',
            context_length: 128000,
            provider: 'openai',
            pricing: { prompt: '0.015', completion: '0.06' },
            isFree: false
        },
        {
            id: 'o1-mini',
            name: 'OpenAI o1 Mini',
            description: 'Fast reasoning model for coding and math',
            context_length: 128000,
            provider: 'openai',
            pricing: { prompt: '0.003', completion: '0.012' },
            isFree: false
        }
    ],
    anthropic: [
        {
            id: 'claude-3-5-sonnet-20241022',
            name: 'Claude 3.5 Sonnet',
            description: 'Advanced reasoning with 200K context window',
            context_length: 200000,
            provider: 'anthropic',
            pricing: { prompt: '0.003', completion: '0.015' },
            isFree: false
        },
        {
            id: 'claude-3-5-haiku-20241022',
            name: 'Claude 3.5 Haiku',
            description: 'Fast, efficient model for quick tasks',
            context_length: 200000,
            provider: 'anthropic',
            pricing: { prompt: '0.0008', completion: '0.004' },
            isFree: false
        },
        {
            id: 'claude-3-opus-20240229',
            name: 'Claude 3 Opus',
            description: 'Most capable model for complex research and analysis',
            context_length: 200000,
            provider: 'anthropic',
            pricing: { prompt: '0.015', completion: '0.075' },
            isFree: false
        },
        {
            id: 'claude-3-sonnet-20240229',
            name: 'Claude 3 Sonnet',
            description: 'Balanced model for most tasks',
            context_length: 200000,
            provider: 'anthropic',
            pricing: { prompt: '0.003', completion: '0.015' },
            isFree: false
        },
        {
            id: 'claude-3-haiku-20240307',
            name: 'Claude 3 Haiku',
            description: 'Fastest model for quick responses',
            context_length: 200000,
            provider: 'anthropic',
            pricing: { prompt: '0.00025', completion: '0.00125' },
            isFree: false
        }
    ],
    grok: [
        {
            id: 'grok-2',
            name: 'Grok 2',
            description: 'Advanced reasoning model',
            context_length: 131072,
            provider: 'grok',
            pricing: { prompt: '0.003', completion: '0.015' },
            isFree: false
        },
        {
            id: 'grok-2-vision-preview',
            name: 'Grok 2 Vision Preview',
            description: 'Multimodal model with image understanding',
            context_length: 8192,
            provider: 'grok',
            pricing: { prompt: '0.005', completion: '0.015' },
            isFree: false
        },
        {
            id: 'grok-2-mini',
            name: 'Grok 2 Mini',
            description: 'Fast, cost-effective model for quick completion',
            context_length: 131072,
            provider: 'grok',
            pricing: { prompt: '0.0003', completion: '0.0005' },
            isFree: false
        }
    ]
};
// Public API endpoints (work without authentication)
exports.PUBLIC_API_ENDPOINTS = {
    openrouter: 'https://openrouter.ai/api/v1/models',
    together: 'https://api.together.xyz/v1/models',
};
async function fetchPublicModels(provider) {
    try {
        // Check if provider has public API endpoint
        const publicUrl = exports.PUBLIC_API_ENDPOINTS[provider];
        if (publicUrl) {
            const response = await fetch(publicUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                // Add timeout
                signal: AbortSignal.timeout(5000)
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: Failed to fetch models`);
            }
            const data = await response.json();
            // Transform API response to our format
            let models = [];
            if (data.data) {
                // OpenRouter format
                models = data.data.map((model) => ({
                    id: model.id,
                    name: model.name || model.id,
                    description: model.description,
                    context_length: model.context_length,
                    pricing: {
                        prompt: model.pricing?.prompt || 'unknown',
                        completion: model.pricing?.completion || 'unknown'
                    },
                    provider: provider,
                    isFree: model.pricing?.prompt === '0' && model.pricing?.completion === '0'
                }));
            }
            else if (data.models) {
                // Together AI format
                models = data.models.map((model) => ({
                    id: model.id,
                    name: model.display_name || model.id,
                    description: model.description,
                    context_length: model.context_length,
                    pricing: model.pricing || { prompt: 'unknown', completion: 'unknown' },
                    provider: provider,
                    isFree: model.pricing?.prompt === '0' && model.pricing?.completion === '0'
                }));
            }
            return models;
        }
        // Fall back to static catalog for providers without public APIs
        const staticModels = STATIC_MODEL_CATALOGS[provider.toLowerCase()];
        if (staticModels) {
            return staticModels;
        }
        // Return empty array if no models available
        return [];
    }
    catch (error) {
        console.error(`Failed to fetch public models for ${provider}:`, error);
        // Fall back to static catalog on error
        const staticModels = STATIC_MODEL_CATALOGS[provider.toLowerCase()];
        if (staticModels) {
            return staticModels;
        }
        throw new Error(`Failed to fetch models for ${provider}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
function filterModels(models, showFreeOnly = false) {
    if (!showFreeOnly) {
        return models;
    }
    return models.filter(model => {
        if (model.pricing) {
            return model.pricing.prompt === '0' || model.isFree === true;
        }
        return false;
    });
}
function sortModels(models, sortBy, direction = 'desc') {
    const sorted = [...models];
    switch (sortBy) {
        case 'name':
            sorted.sort((a, b) => {
                const comparison = a.name.localeCompare(b.name);
                return direction === 'asc' ? comparison : -comparison;
            });
            break;
        case 'context':
            sorted.sort((a, b) => {
                const aContext = a.context_length || 0;
                const bContext = b.context_length || 0;
                const comparison = aContext - bContext;
                return direction === 'asc' ? comparison : -comparison;
            });
            break;
        case 'free':
            sorted.sort((a, b) => {
                const aFree = a.isFree || false;
                const bFree = b.isFree || false;
                const comparison = (bFree ? 1 : 0) - (aFree ? 1 : 0);
                return direction === 'asc' ? comparison : -comparison;
            });
            break;
        default:
            // Default sort by name
            return sortModels(models, 'name', direction);
    }
    return sorted;
}
function searchModels(models, query) {
    if (!query.trim()) {
        return models;
    }
    const searchTerm = query.toLowerCase();
    return models.filter(model => model.name.toLowerCase().includes(searchTerm) ||
        model.id.toLowerCase().includes(searchTerm) ||
        (model.description && model.description.toLowerCase().includes(searchTerm)));
}
//# sourceMappingURL=PublicModels.js.map