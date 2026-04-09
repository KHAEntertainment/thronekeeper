"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretsService = void 0;
class SecretsService {
    constructor(storage) {
        this.storage = storage;
    }
    providerKey(provider) {
        return `claudeThrone:provider:${provider}:apiKey`;
    }
    async getRaw(key) {
        return this.storage.get(key);
    }
    async setRaw(key, value) {
        await this.storage.store(key, value);
    }
    async deleteRaw(key) {
        await this.storage.delete(key);
    }
    async getProviderKey(provider) {
        return this.getRaw(this.providerKey(provider));
    }
    async setProviderKey(provider, value) {
        await this.setRaw(this.providerKey(provider), value);
    }
    async deleteProviderKey(provider) {
        await this.deleteRaw(this.providerKey(provider));
    }
    anthropicKeyName() {
        return 'claudeThrone:anthropic:apiKey';
    }
    async getAnthropicKey() {
        return this.getRaw(this.anthropicKeyName());
    }
    async setAnthropicKey(value) {
        await this.setRaw(this.anthropicKeyName(), value);
    }
    async deleteAnthropicKey() {
        await this.deleteRaw(this.anthropicKeyName());
    }
}
exports.SecretsService = SecretsService;
//# sourceMappingURL=Secrets.js.map