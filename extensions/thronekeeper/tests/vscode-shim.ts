export const workspace = {
  getConfiguration: () => ({
    get: (_key: string, defaultValue?: unknown) => defaultValue,
    update: async () => undefined,
    inspect: () => ({ defaultValue: {} })
  }),
  onDidChangeConfiguration: () => ({ dispose: () => undefined }),
  workspaceFolders: [],
  fs: {
    readFile: async () => new Uint8Array()
  }
}

export const window = {
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  createOutputChannel: () => ({
    name: 'Test',
    append: () => undefined,
    appendLine: () => undefined,
    clear: () => undefined,
    show: () => undefined,
    hide: () => undefined,
    dispose: () => undefined,
    replace: () => undefined
  }),
  createStatusBarItem: () => ({
    text: '',
    tooltip: '',
    show: () => undefined,
    hide: () => undefined,
    dispose: () => undefined
  }),
  registerTreeDataProvider: () => ({ dispose: () => undefined }),
  registerWebviewViewProvider: () => ({ dispose: () => undefined })
}

export const commands = {
  registerCommand: () => ({ dispose: () => undefined }),
  executeCommand: async () => undefined,
  getCommands: async () => []
}

export const env = {
  openExternal: async () => undefined,
  clipboard: {
    writeText: async () => undefined
  }
}

export const Uri = {
  parse: (uri: string) => ({ toString: () => uri, fsPath: uri }),
  joinPath: (...parts: any[]) => ({
    fsPath: parts.map(part => part?.fsPath || String(part)).join('/'),
    toString: () => parts.map(part => part?.toString?.() || String(part)).join('/')
  })
}

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3
}

export const StatusBarAlignment = {
  Left: 1,
  Right: 2
}

export class TreeItem {
  label?: unknown
  collapsibleState?: unknown

  constructor(label?: unknown, collapsibleState?: unknown) {
    this.label = label
    this.collapsibleState = collapsibleState
  }
}

export class EventEmitter<T = unknown> {
  private listeners: Array<(value: T) => unknown> = []

  event = (listener?: (value: T) => unknown, thisArgs?: unknown) => {
    if (typeof listener !== 'function') {
      return { dispose: () => undefined }
    }
    const wrapped = thisArgs ? listener.bind(thisArgs) : listener
    this.listeners.push(wrapped)
    return {
      dispose: () => {
        this.listeners = this.listeners.filter(existing => existing !== wrapped)
      }
    }
  }

  fire(value?: T) {
    for (const listener of [...this.listeners]) {
      listener(value as T)
    }
  }

  dispose() {
    this.listeners = []
  }
}

export class SecretStorage {
  get = async () => undefined
  set = async () => undefined
  delete = async () => undefined
  onDidChange = (_listener?: (e: { key: string }) => unknown) => ({ dispose: () => undefined })
}

export const extensions = {
  getExtension: () => undefined,
  all: []
}
