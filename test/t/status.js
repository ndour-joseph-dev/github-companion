const fs = require('fs');
const path = require('path');
const { load, requireFromRoot, ROOT, OUT, vscode } = require('../harness/load');
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

  // Dernier commit : le panneau affiche la date + l'heure, puis le message à
  // part (un libellé « Dernier » seul ne dit ni quand ni quoi).
  const dir2 = G.tmpRepo('status-date');
  G.write(dir2, 'a.txt', 'a\n');
  G.commit(dir2, 'premier commit');
  const git2 = simpleGit(dir2).env(gitEnv());
  const s2 = await buildStatus(git2);
  a.eq(s2.lastCommit, 'premier commit', 'le message du dernier commit remonte au panneau');
  a.eq(s2.lastAuthor, 'Test', 'l’auteur du dernier commit remonte au panneau');
  a.ok(typeof s2.lastCommitAt === 'number' && s2.lastCommitAt > 0,
    'la date du dernier commit remonte au panneau (affichée en date + heure)');
  a.inc(media, "'Dernier commit'", 'le panneau date le dernier commit (« Dernier commit »)');
  a.inc(media, "'Message'", 'le panneau affiche le message du dernier commit sur sa propre ligne');
  a.ok(media.indexOf("row('Dernier',") === -1, 'l’ancien libellé « Dernier » est retiré');
  // Correspondance dépôt ↔ compte actif (panneau web et extension).
  const repoJs = fs.readFileSync(path.join(ROOT, 'media', 'repo.js'), 'utf8');
  a.inc(repoJs, "'Correspondance'", 'le panneau annonce la correspondance dépôt ↔ compte actif');
  a.inc(repoJs, 'non — ', 'un dépôt qui n’est pas celui du compte est dit non correspondant');

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

  // Verdict distant (« Vérifier les mises à jour ») : il ne vaut que pour le
  // dépôt ET le commit affichés. Un dossier rebranché sur un dépôt neuf ne doit
  // plus porter l'état de l'ancien dépôt (commits distants, « à récupérer »).
  // require direct (sans purge du cache) : c'est LA même instance de store que
  // celle utilisée par gitStatus, sinon le verdict posé ici serait invisible.
  const remoteStore = require(path.join(OUT, 'features/checkUpdates/store.js'));
  const dir3 = G.tmpRepo('status-remote');
  G.write(dir3, 'a.txt', 'a\n');
  G.commit(dir3, 'init');
  G.sh(dir3, ['remote', 'add', 'origin', 'https://github.com/ancien/depot.git']);
  const git3 = simpleGit(dir3).env(gitEnv());
  const verdict = (head) => ({
    behind: 2,
    ahead: 0,
    commits: [{ author: 'x', when: '', subject: 'vieux commit' }],
    hasTracking: true,
    upstream: 'origin/main',
    checkedAt: Date.now(),
    head
  });

  remoteStore.rememberRemoteCheck(verdict(G.head(dir3)), 'https://github.com/ancien/depot.git');
  let s3 = await buildStatus(git3);
  a.eq(s3.behind, 2, 'un verdict frais du dépôt affiché est bien repris');
  a.ok(typeof s3.checkedAt === 'number', 'l’heure de vérification est transmise au panneau');

  // Dépôt cloud supprimé puis remplacé par un dépôt NEUF et vide : l'ancien
  // verdict décrivait un dépôt qui n'existe plus.
  G.sh(dir3, ['remote', 'set-url', 'origin', 'https://github.com/ancien/depot-neuf.git']);
  s3 = await buildStatus(git3);
  a.eq(s3.checkedAt, undefined, 'après changement de dépôt, l’ancien verdict n’est plus affiché');
  a.eq(s3.behind, 0, 'plus aucun commit distant de l’ancien dépôt n’est annoncé');

  // Même dépôt, mais un commit local est arrivé depuis la vérification.
  G.write(dir3, 'b.txt', 'b\n');
  G.commit(dir3, 'nouveau');
  remoteStore.rememberRemoteCheck(verdict(G.head(dir3)), 'https://github.com/ancien/depot-neuf.git');
  a.eq((await buildStatus(git3)).behind, 2, 'un verdict posé pour le commit courant est repris');
  G.write(dir3, 'c.txt', 'c\n');
  G.commit(dir3, 'encore');
  s3 = await buildStatus(git3);
  a.eq(s3.checkedAt, undefined, 'un commit local postérieur invalide le verdict affiché');
  a.eq(s3.lastCommit, 'encore', 'le dernier commit affiché est celui du dossier, relu à chaque fois');
  a.inc(media, 'Dernier commit (local)',
    'le panneau précise « (local) » quand un remote existe (état distant à part)');
  a.inc(media, "'Aucun commit en local'",
    'un dépôt sans aucun commit le dit au lieu de laisser la zone muette');

  a.done('status');
})().catch((error) => {
  console.error('✗ exception hors assertions :', error);
  process.exit(1);
});
