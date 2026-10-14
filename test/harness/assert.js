'use strict';
const path = require('path');
const { ROOT } = require('./load');

let pass = 0;
let fail = 0;

function ok(cond, label) {
  if (cond) pass++;
  else {
    fail++;
    console.error('  ✗ ' + label);
  }
}
function eq(a, b, label) {
  ok(
    JSON.stringify(a) === JSON.stringify(b),
    `${label} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`
  );
}
function inc(hay, needle, label) {
  ok(String(hay).includes(needle), `${label} — « ${needle} » absent de « ${hay} »`);
}
function done(name) {
  console.log(`${name}: ${pass} OK, ${fail} échec(s)`);
  process.exit(fail === 0 ? 0 : 1);
}

/** Contexte d'extension en mémoire (workspaceState réel, secrets vides). */
function fakeContext() {
  const mem = {};
  return {
    subscriptions: [],
    workspaceState: {
      get: (k) => mem['ws:' + k],
      update: async (k, v) => {
        mem['ws:' + k] = v;
      }
    },
    globalState: {
      get: (k) => mem['g:' + k],
      update: async (k, v) => {
        mem['g:' + k] = v;
      }
    },
    secrets: { get: async () => undefined, store: async () => {}, delete: async () => {} },
    extensionUri: { fsPath: path.join(ROOT, 'media') }
  };
}
module.exports = { ok, eq, inc, done, fakeContext };
