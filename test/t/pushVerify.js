const { load, requireFromRoot, vscode } = require('../harness/load');
const a = require('../harness/assert');
const G = require('../harness/git');
const simpleGit = requireFromRoot('simple-git');
const { gitEnv } = load('git/gitEnv.js');

(async () => {
  const { remoteHead, localHead } = load('git/remoteHead.js');
  const { pushWithAuth } = load('git/gitAuth.js');
  const { finishPush } = load('features/push/steps.js');

  const remote = G.bare('verify');
  const dir = G.tmpRepo('verify');
  G.write(dir, 'a.txt', 'a\n');
  const sha = G.commit(dir, 'init');
  G.sh(dir, ['remote', 'add', 'origin', remote]);
  const git = simpleGit(dir).env(gitEnv());

  // Bug réel évité : dès que l'environnement transmis à simple-git contient
  // GIT_ASKPASS (posé par VS Code / VSCodium), TOUTE opération distante est
  // refusée (« Use of GIT_ASKPASS is not permitted »). L'ancienne version
  // restaurait l'environnement complet après un appel authentifié : push et
  // pull échouaient donc avant même de démarrer.
  if (process.env.GIT_ASKPASS) {
    let blocked = false;
    try {
      await requireFromRoot('simple-git')(dir).env({ ...process.env }).getRemotes();
    } catch (e) {
      blocked = /allowUnsafeAskPass|not permitted/.test(String(e && e.message));
    }
    a.eq(blocked, true, 'GIT_ASKPASS bloque simple-git si l’environnement n’est pas nettoyé');
  }
  a.eq(gitEnv().GIT_ASKPASS, undefined, 'gitEnv() retire GIT_ASKPASS');
  a.eq(gitEnv().GIT_TERMINAL_PROMPT, '0', 'gitEnv() interdit toute invite interactive');
  a.eq(gitEnv({ X: '1' }).X, '1', 'gitEnv() ajoute les variables demandées');

  a.eq(await localHead(git), sha, 'SHA local lu');
  a.eq(await remoteHead(git, 'ghp_fake', 'main'), undefined, 'rien de distant avant le push');

  // Après un appel AUTHENTIFIÉ, l'instance doit rester utilisable : l'en-tête
  // ne doit pas survivre, et l'environnement ne doit pas redevenir « sale ».
  let usable = true;
  try {
    await git.getRemotes(true);
  } catch {
    usable = false;
  }
  a.eq(usable, true, 'l’instance reste utilisable après un appel authentifié');

  await pushWithAuth(git, 'ghp_fake', 'main');
  a.eq(await remoteHead(git, 'ghp_fake', 'main'), sha, 'le cloud a bien reçu le commit local');

  // Succès vérifié : message de réussite, aucune fausse alerte
  vscode.__state.messages = [];
  await finishPush(undefined, git, 'ghp_fake', 'main', sha, 1);
  const ok = vscode.__state.messages.at(-1);
  a.eq(ok.level, 'info', 'push vérifié = information');
  a.inc(ok.text, 'vérifié sur le cloud', 'la vérification distante est annoncée');
  a.inc(ok.text, sha.slice(0, 7), 'le commit confirmé est indiqué');

  // Push « accepté » mais référence distante différente → alerte, jamais de faux succès
  const otherBare = G.bare('other');
  const otherRepo = G.tmpRepo('other');
  G.write(otherRepo, 'z.txt', 'z\n');
  G.commit(otherRepo, 'autre');
  G.sh(otherRepo, ['remote', 'add', 'origin', otherBare]);
  G.sh(otherRepo, ['push', '-u', 'origin', 'main']);
  G.sh(dir, ['remote', 'set-url', 'origin', otherBare]);

  vscode.__state.messages = [];
  await finishPush(undefined, git, 'ghp_fake', 'main', sha, 0);
  const ko = vscode.__state.messages.at(-1);
  a.eq(ko.level, 'error', 'un push incomplet est signalé comme une erreur');
  a.inc(ko.text, 'Push incomplet', 'formulation explicite');
  a.inc(ko.text, 'aucun fichier local', 'l’utilisateur est rassuré : rien de cassé localement');
  a.ok(!ko.text.includes('ghp_'), 'aucun token dans le message');
  a.eq(G.head(dir), sha, 'le dépôt local n’a pas été modifié');

  a.done('pushVerify');
})().catch((error) => {
  console.error('✗ exception hors assertions :', error);
  process.exit(1);
});
