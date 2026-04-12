"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const endpoints_1 = require("./endpoints");
(0, vitest_1.describe)('getModelsEndpointForBase', () => {
    (0, vitest_1.it)('resolves moonshot anthropic endpoint to models list', () => {
        const base = 'https://api.moonshot.ai/anthropic/v1/messages';
        const modelsEndpoint = (0, endpoints_1.getModelsEndpointForBase)(base);
        (0, vitest_1.expect)(modelsEndpoint).toBe('https://api.moonshot.ai/v1/models');
    });
    (0, vitest_1.it)('resolves minimax anthropic endpoint to models list', () => {
        const base = 'https://api.minimax.io/anthropic';
        const modelsEndpoint = (0, endpoints_1.getModelsEndpointForBase)(base);
        (0, vitest_1.expect)(modelsEndpoint).toBe('https://api.minimax.io/v1/models');
    });
    (0, vitest_1.it)('resolves z.ai anthropic endpoint to paas models list', () => {
        const base = 'https://api.z.ai/anthropic/v1/messages';
        const modelsEndpoint = (0, endpoints_1.getModelsEndpointForBase)(base);
        (0, vitest_1.expect)(modelsEndpoint).toBe('https://api.z.ai/api/paas/v4/models');
    });
    (0, vitest_1.it)('returns unchanged URL when already pointing to models', () => {
        const base = 'https://api.example.com/v1/models';
        const modelsEndpoint = (0, endpoints_1.getModelsEndpointForBase)(base);
        (0, vitest_1.expect)(modelsEndpoint).toBe('https://api.example.com/v1/models');
    });
    (0, vitest_1.it)('falls back to appending /models for invalid URLs', () => {
        const base = 'not-a-valid-url';
        const modelsEndpoint = (0, endpoints_1.getModelsEndpointForBase)(base);
        (0, vitest_1.expect)(modelsEndpoint).toBe('not-a-valid-url/models');
    });
});
//# sourceMappingURL=endpoints.test.js.map