const fs = require('fs');
const path = require('path');
const { load, vscode } = require('../harness/load');
const a = require('../harness/assert');
const G = require('../harness/git');

(async () => {
  const store = load('features/journal/store.js');
  const { undoCommit } = load('features/journal/undo.js');

  const dir = G.tmpRepo('journal');
  G.write(dir, 'a.txt', 'a\n');
  const c1 = G.commit(dir, 'init');
  G.write(dir, 'b.txt', 'b\n');
  const c2 = G.commit(dir, 'deux');
  vscode.__state.folders = [{ uri: { fsPath: dir } }];

  const ctx = a.fakeContext();
  await store.recordOp(ctx, { at: Date.now(), op: 'commit', ok: true, before: c1, after: c2, detail: '2 fichier(s)' });
  a.eq(store.readJournal(ctx).length, 1, 'entrée d’historique enregistrée');
  a.eq(store.lastEntry(ctx, 'commit').after, c2, 'dernière entrée retrouvée');
  await store.recordOp(undefined, { at: Date.now(), op: 'push', ok: true });
  a.eq(store.readJournal(ctx).length, 1, 'sans contexte, rien n’est écrit');

  // Annulation acceptée : reset --soft, aucun fichier perdu
  vscode.__reply('warning', 'Annuler le commit');
  a.eq(await undoCommit(store.lastEntry(ctx, 'commit')), true, 'annulation effectuée');
  a.eq(G.head(dir), c1, 'HEAD est revenu au commit précédent');
  a.ok(fs.existsSync(path.join(dir, 'b.txt')), 'b.txt toujours sur le disque');
  a.inc(G.status(dir), 'b.txt', 'la modification est de nouveau en attente de commit');
  a.inc(vscode.__state.messages.at(-1).text, 'Aucun fichier', 'le message rassure l’utilisateur');

  // Refusée si l'historique a bougé (on ne réécrit rien)
  vscode.__reply('warning', 'Annuler le commit');
  const stale = { at: Date.now(), op: 'commit', ok: true, before: c1, after: 'deadbeef' };
  a.eq(await undoCommit(stale), false, 'annulation refusée si HEAD a changé');
  a.inc(vscode.__state.messages.at(-1).text, 'changé', 'raison expliquée');
  a.eq(G.head(dir), c1, 'le dépôt n’a pas bougé');

  // L'utilisateur peut refuser
  vscode.__reply('warning', 'Garder');
  a.eq(await undoCommit({ at: 0, op: 'commit', ok: true, before: c1, after: c1 }), false, 'refus utilisateur respecté');

  // Historique plafonné (pas de croissance infinie)
  for (let i = 0; i < 60; i++) {
    await store.recordOp(ctx, { at: i, op: 'push', ok: true });
  }
  a.eq(store.readJournal(ctx).length, 50, 'historique plafonné à 50 entrées');

  a.done('journal');
})().catch((error) => {
  console.error('✗ exception hors assertions :', error);
  process.exit(1);
});
