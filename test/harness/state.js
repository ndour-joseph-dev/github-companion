'use strict';
// État partagé du faux module 'vscode' : tout ce que l'extension affiche, et
// les réponses programmées aux boîtes de dialogue (pour tester les décisions).

const state = {
  messages: [], // { level, text, actions }
  responses: {}, // réponses par niveau ('warning', 'error', 'info')
  input: undefined, // réponse de showInputBox
  picked: undefined, // réponse de showQuickPick (valeur ou fonction(items))
  opened: [], // URLs passées à env.openExternal
  output: [], // lignes écrites dans les canaux de sortie
  statusItems: [],
  config: {}, // réglages githubCompanion.*
  folders: [], // workspaceFolders
  commands: new Map()
};

function reset() {
  state.messages = [];
  state.responses = {};
  state.input = undefined;
  state.picked = undefined;
  state.opened = [];
  state.output = [];
  state.statusItems = [];
  state.commands = new Map();
  state.config = {};
  state.folders = [];
}

/** Programme la réponse de la PROCHAINE boîte de dialogue d'un niveau. */
function reply(level, value) {
  (state.responses[level] = state.responses[level] || []).push(value);
}

/** Enregistre un message et rend la réponse programmée (jamais bloquant). */
function record(level, text, actions) {
  const list = (actions || []).filter((x) => typeof x === 'string');
  state.messages.push({ level, text: String(text), actions: list });
  const queue = state.responses[level];
  return Promise.resolve(queue && queue.length ? queue.shift() : undefined);
}

/** Item de barre d'état observable (text/tooltip/visible). */
function makeStatusItem() {
  const item = {
    text: '',
    tooltip: '',
    command: undefined,
    name: '',
    color: undefined,
    visible: false,
    show() {
      this.visible = true;
    },
    hide() {
      this.visible = false;
    },
    dispose() {}
  };
  state.statusItems.push(item);
  return item;
}

module.exports = { state, reset, reply, record, makeStatusItem };
