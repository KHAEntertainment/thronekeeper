"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationTarget = exports.window = exports.workspace = void 0;
exports.workspace = {
    getConfiguration: (section) => ({
        get: (key, defaultValue) => defaultValue,
        update: (key, value, target) => Promise.resolve()
    })
};
exports.window = {
    createOutputChannel: (name) => ({
        name,
        append: (value) => { },
        appendLine: (message) => { },
        clear: () => { },
        show: (columnOrPreserveFocus, preserveFocus) => { },
        hide: () => { },
        dispose: () => { },
        replace: (value) => { }
    })
};
exports.ConfigurationTarget = {
    Global: 1,
    Workspace: 2
};
//# sourceMappingURL=vscode.js.map