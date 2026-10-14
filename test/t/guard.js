const fs = require('fs');
const path = require('path');
const { load, requireFromRoot, vscode } = require('../harness/load');
const a = require('../harness/assert');
const G = require('../harness/git');
const simpleGit = requireFromRoot('simple-git');
const { gitEnv } = load('git/gitEnv.js');

function conflict(dir) {
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
}

(async () => {
  const { preflight } = load('features/guards/preflight.js');
  const { readRepoState } = load('git/repoState.js');

  // 1. dépôt propre : tout est autorisé
  const dir = G.tmpRepo('guard');
  G.write(dir, 'a.txt', 'a\n');
  G.commit(dir, 'init');
  const git = simpleGit(dir).env(gitEnv());
  a.eq((await preflight(dir, git, 'push')).ok, true, 'push autorisé sur un dépôt propre');
  a.eq((await preflight(dir, git, 'pull')).ok, true, 'pull autorisé sur un dépôt propre');

  // 2. fusion en conflit : refus + explication (rien n'est exécuté)
  conflict(dir);
  vscode.__reply('warning', 'Compris');
  let pf = await preflight(dir, git, 'push');
  a.eq(pf.ok, false, 'push refusé pendant une fusion');
  a.eq(pf.state.op, 'merge', 'état de fusion remonté');
  a.inc(vscode.__state.messages.at(-1).text, 'Fusion en cours', 'explication affichée');
  a.eq((await readRepoState(git)).op, 'merge', 'la fusion est restée intacte (aucune action cachée)');

  // 3. « Aider à annuler » exécute vraiment l’annulation (deux dialogues)
  vscode.__reply('warning', 'Aider à annuler');
  vscode.__reply('warning', "Annuler l'opération");
  pf = await preflight(dir, git, 'pull');
  a.eq(pf.ok, false, 'pull refusé pendant une fusion');
  a.eq((await readRepoState(git)).op, undefined, 'l’annulation a nettoyé la fusion');
  a.eq(G.status(dir), '', 'aucun fichier perdu après annulation');

  // 4. verrou résiduel : refus, et le verrou reste en place
  const lock = path.join(dir, '.git', 'index.lock');
  fs.writeFileSync(lock, '');
  const old = Date.now() / 1000 - 30;
  fs.utimesSync(lock, old, old);
  pf = await preflight(dir, git, 'push');
  a.eq(pf.ok, false, 'push refusé quand un verrou git traîne');
  a.inc(vscode.__state.messages.at(-1).text, 'verrou', 'le verrou est expliqué');
  a.ok(fs.existsSync(lock), 'le verrou n’a pas été supprimé');
  fs.unlinkSync(lock);

  // 5. modifications locales + pull : avertissement, l’utilisateur décide
  G.write(dir, 'a.txt', 'modifié\n');
  vscode.__reply('warning', 'Annuler');
  a.eq((await preflight(dir, git, 'pull')).ok, false, 'pull annulé par l’utilisateur');
  a.inc(vscode.__state.messages.at(-1).text, 'non commité', 'raison expliquée');
  vscode.__reply('warning', 'Continuer');
  a.eq((await preflight(dir, git, 'pull')).ok, true, 'pull poursuivi si l’utilisateur confirme');
  a.eq(G.status(dir).includes('a.txt'), true, 'les modifications locales sont toujours là');

  // 6. commit pendant une fusion AVEC conflits : impossible (dépôt neuf)
  const dir2 = G.tmpRepo('guard2');
  G.write(dir2, 'a.txt', 'a\n');
  G.commit(dir2, 'init');
  conflict(dir2);
  const git2 = simpleGit(dir2).env(gitEnv());
  vscode.__reply('warning', 'Compris');
  a.eq((await preflight(dir2, git2, 'commit')).ok, false, 'commit refusé tant qu’il reste des conflits');
  a.eq((await readRepoState(git2)).op, 'merge', 'la fusion est intacte : aucun commit forcé');

  a.done('guard');
})().catch((error) => {
  console.error('✗ exception hors assertions :', error);
  process.exit(1);
});
