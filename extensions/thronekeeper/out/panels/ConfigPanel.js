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
exports.ConfigPanel = void 0;
const vscode = __importStar(require("vscode"));
class ConfigPanel {
    constructor(panel) {
        this.panel = panel;
    }
    static show(context) {
        // If we already have a panel, reveal it
        if (ConfigPanel.currentPanel) {
            ConfigPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
            return;
        }
        const panel = vscode.window.createWebviewPanel('claudeThroneConfig', 'Claude-Throne Configuration', vscode.ViewColumn.One, {
            enableScripts: false,
            retainContextWhenHidden: true
        });
        panel.webview.html = this.getHtml();
        ConfigPanel.currentPanel = new ConfigPanel(panel);
        panel.onDidDispose(() => {
            ConfigPanel.currentPanel = undefined;
        });
    }
    static getHtml() {
        // Lightweight placeholder UI — we will replace with React webview later
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Claude-Throne</title>
<style>
  :root {
    --hive-gold: #FFD700;
    --hive-dark-gold: #B8860B;
    --hive-bg: #1a1a1a;
    --hive-text: #e0e0e0;
    --hive-muted: #b0b0b0;
    --hive-accent: #4CAF50;
  }
  body {
    margin: 0;
    padding: 0;
    background: var(--hive-bg);
    color: var(--hive-text);
    font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  }
  .header {
    padding: 20px;
    background: linear-gradient(135deg, var(--hive-gold), var(--hive-dark-gold));
    color: #000;
  }
  .header h1 { margin: 0; font-size: 18px; }
  .container { padding: 16px 20px 40px; }
  .card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }
  .muted { color: var(--hive-muted); font-size: 12px; }
  .btn {
    display: inline-block;
    background: linear-gradient(135deg, var(--hive-gold), var(--hive-dark-gold));
    color: #000;
    padding: 8px 14px;
    border-radius: 6px;
    text-decoration: none;
    font-weight: 600;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>👑 Claude-Throne — Configuration (Alpha)</h1>
    <div class="muted">The Hive themed UI — webview foundation</div>
  </div>
  <div class="container">
    <div class="card">
      <h3>Status</h3>
      <p>Use the Command Palette to start the Secrets Daemon and Proxy:</p>
      <ul>
        <li><b>Claude Throne: Start Proxy</b> — starts the Secrets Daemon (ct-secretsd)</li>
        <li><b>Claude Throne: Stop Proxy</b> — stops the Secrets Daemon</li>
        <li><b>Claude Throne: Show Status</b> — shows daemon URL</li>
      </ul>
      <p class="muted">A full React UI with providers, keys, models, and status will appear here in the next step.</p>
    </div>
    <div class="card">
      <h3>Next Up</h3>
      <p>Provider connectivity checks, secure key storage, and proxy lifecycle controls from this panel.</p>
      <a class="btn" href="#" onclick="return false;">Coming Soon</a>
    </div>
  </div>
</body>
</html>`;
    }
}
exports.ConfigPanel = ConfigPanel;
//# sourceMappingURL=ConfigPanel.js.map