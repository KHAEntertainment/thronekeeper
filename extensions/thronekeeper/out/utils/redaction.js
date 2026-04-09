"use strict";
// Shared redaction utility for sanitizing secrets in extension logs.
// Mirrors the root-level implementation bundled with the proxy.
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactSecrets = redactSecrets;
function redactSecrets(text) {
    if (!text || typeof text !== 'string') {
        return text;
    }
    return text
        .replace(/sk-ant-api03-[A-Za-z0-9+/=\-_]{95,}/g, '[REDACTED]')
        .replace(/sk-[A-Za-z0-9]{20,}/g, '[REDACTED]')
        .replace(/Authorization:\s*Bearer\s+[^\s]+/gi, 'Authorization: [REDACTED]')
        .replace(/Authorization:\s*[^\s]+/gi, 'Authorization: [REDACTED]')
        .replace(/"apiKey"\s*:\s*"[^"]+"/g, '"apiKey": "[REDACTED]"')
        .replace(/"x-api-key"\s*:\s*"[^"]+"/g, '"x-api-key": "[REDACTED]"')
        .replace(/(?<!["'])(api[-_]?key)(\s*[:=]\s*)([^\s,}"']+)/gi, (_match, key, separator) => {
        if (separator.includes('=')) {
            return `${key}=[REDACTED]`;
        }
        return `${key}: [REDACTED]`;
    });
}
//# sourceMappingURL=redaction.js.map