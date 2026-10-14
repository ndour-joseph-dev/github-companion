const { load, requireFromRoot } = require('../harness/load');
const a = require('../harness/assert');
const G = require('../harness/git');
const simpleGit = requireFromRoot('simple-git');

(async () => {
  const { readRepoState, advice, opLabel } = load('git/repoState.js');
  const dir = G.tmpRepo('state');
  G.write(dir, 'a.txt', 'a\n');
  G.commit(dir, 'init');
  const git = simpleGit(dir);

  let st = await readRepoState(git);
  a.eq(st.op, undefined, 'aucune opération en cours');
  a.eq(st.unborn, false, 'dépôt avec commit');
  a.eq(st.dirty, 0, 'arbre de travail propre');
  a.eq(st.conflicts, 0, 'aucun conflit');
  a.eq(await opLabel(git), undefined, 'aucun libellé affiché');
  a.eq(advice(undefined).label, 'Aucune opération en cours', 'libellé par défaut');

  // Fusion réellement conflictuelle
  G.sh(dir, ['checkout', '-b', 'autre', 'main']);
  G.write(dir, 'a.txt', 'version-autre\n');
  G.commit(dir, 'autre');
  G.sh(dir, ['checkout', 'main']);
  G.write(dir, 'a.txt', 'version-main\n');
  G.commit(dir, 'main');
  try {
    G.sh(dir, ['merge', 'autre']);
  } catch {
    /* conflit attendu */
  }
  st = await readRepoState(git);
  a.eq(st.op, 'merge', 'fusion interrompue détectée');
  a.ok(st.conflicts > 0, 'conflits comptés');
  a.eq(advice(st.op).abort, ['merge', '--abort'], 'annulation proposée');
  a.inc(await opLabel(git), 'Fusion', 'libellé « Fusion en cours » pour la barre d’état');

  // La fusion ne doit pas laisser le dépôt cassé : on peut l'annuler proprement
  await git.raw(['merge', '--abort']);
  a.eq((await readRepoState(git)).op, undefined, 'merge --abort remet le dépôt d’aplomb');
  a.eq(G.status(dir), '', 'arbre de travail à nouveau propre');

  G.write(dir, 'a.txt', 'modifié\n');
  a.eq((await readRepoState(git)).dirty, 1, 'modification locale comptée');
  a.done('repoState');
})().catch((error) => {
  console.error('✗ exception hors assertions :', error);
  process.exit(1);
});
