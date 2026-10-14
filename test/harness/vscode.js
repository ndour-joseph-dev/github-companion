'use strict';
// Faux module 'vscode' : surface d'API utilisée par l'extension. L'état (et les
// réponses programmables aux dialogues) vit dans ./state.js.
const path = require('path');
const { state, reset, reply, record, makeStatusItem } = require('./state');

class ThemeColor {
  constructor(id) {
    this.id = id;
  }
}
class Disposable {
  dispose() {}
}

const StatusBarAlignment = { Left: 1, Right: 2 };
const ProgressLocation = { SourceControl: 1, Window: 10, Notification: 15 };
const ConfigurationTarget = { Global: 1, Workspace: 2 };

const Uri = {
  file: (p) => ({ fsPath: p, scheme: 'file', toString: () => 'file://' + p }),
  parse: (s) => ({
    fsPath: String(s),
    scheme: String(s).split(':')[0],
    toString: () => String(s)
  }),
  joinPath: (base, ...parts) => Uri.file(path.join(base.fsPath, ...parts))
};

const workspace = {
  get workspaceFolders() {
    return state.folders;
  },
  getConfiguration: (ns) => ({
    get(key, def) {
      const full = ns + '.' + key;
      if (state.config[full] !== undefined) return state.config[full];
      if (state.config[key] !== undefined) return state.config[key];
      return def;
    },
    async update() {}
  }),
  onDidChangeWorkspaceFolders: () => new Disposable()
};

const window = {
  showErrorMessage: (t, ...a) => record('error', t, a),
  showWarningMessage: (t, ...a) => record('warning', t, a),
  showInformationMessage: (t, ...a) => record('info', t, a),
  showInputBox: async () => state.input,
  showQuickPick: async (items) =>
    typeof state.picked === 'function' ? state.picked(items) : state.picked,
  createOutputChannel: (name) => ({
    name,
    appendLine: (l) => state.output.push(String(l)),
    show() {},
    dispose() {}
  }),
  createStatusBarItem: () => makeStatusItem(),
  registerWebviewViewProvider: () => new Disposable(),
  withProgress: async (_opts, task) => task({ report() {} }),
  onDidChangeActiveTextEditor: () => new Disposable(),
  onDidChangeWindowState: () => new Disposable()
};

const commands = {
  registerCommand: (id, fn) => {
    state.commands.set(id, fn);
    return new Disposable();
  },
  executeCommand: async (id, ...args) => {
    const fn = state.commands.get(id);
    if (fn) return fn(...args);
  }
};

module.exports = {
  window,
  workspace,
  commands,
  Uri,
  ThemeColor,
  Disposable,
  StatusBarAlignment,
  ProgressLocation,
  ConfigurationTarget,
  env: { openExternal: (u) => state.opened.push(String(u)) },
  __state: state,
  __reset: reset,
  __reply: reply
};
