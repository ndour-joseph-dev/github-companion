'use strict';
// Charge les modules COMPILÉS de l'extension (out/) en injectant le faux
// module 'vscode'. Deux modules qui s'importent partagent bien la même
// instance (l'état partagé — guetteur de fuite, verrou — reste cohérent).
const Module = require('module');
const path = require('path');
const vscode = require('./vscode');

const ROOT = process.env.GC_ROOT || path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'out');

const mislead = Module._load;
Module._load = function (request) {
  if (request === 'vscode') return vscode;
  return mislead.apply(this, arguments);
};

function purgeOut() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(OUT)) delete require.cache[key];
  }
}

/** Charge out/<rel> ; `fresh` vide d'abord tout le cache de l'extension. */
function load(rel, fresh = false) {
  const file = path.join(OUT, rel);
  if (fresh) purgeOut();
  const key = require.resolve(file);
  delete require.cache[key];
  return require(file);
}

/** Résout une dépendance depuis node_modules de l'extension (simple-git…). */
function requireFromRoot(name) {
  return require(require.resolve(name, { paths: [ROOT] }));
}

module.exports = { load, purgeOut, requireFromRoot, vscode, ROOT, OUT };
