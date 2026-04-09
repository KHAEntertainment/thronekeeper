"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateOpenRouter = validateOpenRouter;
exports.validateOpenAI = validateOpenAI;
exports.validateTogether = validateTogether;
exports.validateGrok = validateGrok;
exports.validateCustom = validateCustom;
const undici_1 = require("undici");
async function validateOpenRouter(key) {
    const res = await (0, undici_1.request)('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
    });
    return res.statusCode === 200;
}
async function validateOpenAI(key, baseUrl = 'https://api.openai.com/v1') {
    const res = await (0, undici_1.request)(`${baseUrl.replace(/\/$/, '')}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
    });
    return res.statusCode === 200;
}
async function validateTogether(key) {
    const res = await (0, undici_1.request)('https://api.together.xyz/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
    });
    return res.statusCode === 200;
}
async function validateGrok(key) {
    const res = await (0, undici_1.request)('https://api.x.ai/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
    });
    return res.statusCode === 200;
}
async function validateCustom(key, baseUrl) {
    const url = `${baseUrl.replace(/\/$/, '')}/models`;
    const res = await (0, undici_1.request)(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
    });
    return res.statusCode === 200;
}
//# sourceMappingURL=ProviderValidation.js.map