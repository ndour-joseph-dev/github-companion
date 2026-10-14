const fs = require('fs');
const path = require('path');
const { load, requireFromRoot, ROOT, vscode } = require('../harness/load');
const a = require('../harness/assert');
const G = require('../harness/git');
const simpleGit = requireFromRoot('simple-git');
const { gitEnv } = load('git/gitEnv.js');

(async () => {
  const { buildStatus } = load('git/gitStatus.js');
  const dir = G.tmpRepo('status');
  G.write(dir, 'a.txt', 'a\n');
  G.commit(dir, 'init');
  vscode.__state.folders = [{ uri: { fsPath: dir } }];
  const git = simpleGit(dir).env(gitEnv());

  let s = await buildStatus(git);
  a.eq(s.opLabel, undefined, 'aucune opération signalée sur un dépôt sain');
  a.eq(s.branch, 'main', 'branche remontée au panneau');

  // Fusion conflictuelle : l'état doit remonter jusqu'à l'affichage
  G.sh(dir, ['checkout', '-b', 'autre', 'main']);
  G.write(dir, 'a.txt', 'autre\n');
  G.commit(dir, 'autre');
  G.sh(dir, ['checkout', 'main']);
  G.write(dir, 'a.txt', 'main\n');
  G.commit(dir, 'main');
  try {
    G.sh(dir, ['merge', 'autre']);
  } catch {
    /* conflit attendu */
  }
  s = await buildStatus(git);
  a.inc(s.opLabel, 'Fusion', 'l’opération en cours remonte au panneau et à la barre d’état');
  a.ok(s.conflicts > 0, 'les conflits sont également affichés');

  const media = fs.readFileSync(path.join(ROOT, 'media', 'status.js'), 'utf8');
  a.inc(media, 's.opLabel', 'le panneau web affiche l’opération en cours');
  const bar = fs.readFileSync(path.join(ROOT, 'src/features/statusBar/index.ts'), 'utf8');
  a.inc(bar, 's.opLabel', 'la barre d’état affiche l’opération en cours');

  // Cohérence host ↔ webview : chaque état que l'extension peut envoyer doit être
  // peint par le panneau. Un état inconnu laisserait la carte d'état vide — c'est
  // exactement ce qui se produisait avant (panneau muet, aucune explication).
  const rendered = new Set([...media.matchAll(/state === '([a-z-]+)'/g)].map((m) => m[1]));
  const hostSrc = fs.readFileSync(path.join(ROOT, 'src/features/panel/state.ts'), 'utf8') +
    fs.readFileSync(path.join(ROOT, 'src/features/panel/index.ts'), 'utf8');
  const sent = new Set([...hostSrc.matchAll(/\bstate: '([a-z-]+)'/g)].map((m) => m[1]));
  for (const state of sent) {
    if (state === 'ok') continue; // « ok » est rendu par les données, pas par un état
    a.ok(rendered.has(state), `l’état « ${state} » envoyé par l’extension est rendu par le panneau`);
  }
  a.ok(sent.has('ok') && sent.has('no-folder') && sent.has('no-repo'),
    'les états normaux (ok, no-folder, no-repo) sont toujours envoyés par l’extension');
  a.ok(sent.has('error'), 'une panne d’état devient un état « error » explicite');
  a.ok(rendered.has('loading'), 'le panneau sait annoncer « Chargement… »');
  a.ok(rendered.has('no-answer'), 'le panneau sait annoncer le silence de l’extension');
  a.inc(media, 'msg.message', 'le diagnostic d’erreur du host est affiché tel quel');

  a.done('status');
})().catch((error) => {
  console.error('✗ exception hors assertions :', error);
  process.exit(1);
});
