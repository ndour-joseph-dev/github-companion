// Messages de compte : ils ne contiennent QUE des valeurs lues à l'exécution
// (login du compte choisi, dépôt et propriétaire joints par l'URL du remote du
// dossier ouvert). Un nom d'auteur figé dans le code s'afficherait chez TOUT LE
// MONDE dès la publication : on le verrouille ici.
const fs = require('fs');
const path = require('path');
const { load, vscode, ROOT } = require('../harness/load');
const a = require('../harness/assert');
const G = require('../harness/git');

/** Coffre-fort simulé, clé par clé, comme VS Code (lecture ET écriture). */
function vault(accounts) {
  const mem = { 'githubCompanion.accounts': JSON.stringify(accounts) };
  return {
    subscriptions: [],
    secrets: {
      get: async (k) => mem[k],
      store: async (k, v) => {
        mem[k] = v;
      },
      delete: async (k) => {
        delete mem[k];
      }
    }
  };
}

const TOKEN = 'ghp_' + 'F'.repeat(36);

// Aucun réseau dans cette suite : le verdict d'accès est remplacé sur le module
// partagé (repoMatch le lit à l'appel, jamais à l'import).
const github = load('github/githubService.js');
github.GitHubService = class {
  async getRepoAccess() {
    return { role: 'none' };
  }
};

const store = load('features/accounts/store.js');
const guard = load('features/accounts/guard.js');

(async () => {
  const dir = G.tmpRepo('acct-msg');
  G.write(dir, 'a.txt', 'a\n');
  G.commit(dir, 'init');
  // Dépôt du dossier ouvert, appartenant à un compte (« proprio »). Aucun accès
  // pour le compte choisi : c'est le cas qui déclenche l'avertissement.
  G.sh(dir, ['remote', 'add', 'origin', 'https://github.com/proprio/depot-dalton.git']);
  vscode.__state.folders = [{ uri: { fsPath: dir } }];

  const context = vault([
    { id: 'mon-compte', login: 'mon-compte', token: TOKEN },
    { id: 'proprio', login: 'proprio', token: TOKEN }
  ]);

  vscode.__state.messages = [];
  vscode.__reply('warning', 'Changer quand même');
  const kept = await guard.guardAccountSwitch(context, 'mon-compte');
  const modal = vscode.__state.messages.at(-1);
  a.eq(kept, 'mon-compte', '« Changer quand même » applique bien le compte choisi');
  a.eq(modal.level, 'warning', 'l’avertissement est un dialogue modal de niveau warning');
  a.inc(modal.text, 'mon-compte', 'le message nomme le compte CHOISI (login lu, jamais figé)');
  a.inc(modal.text, 'proprio/depot-dalton', 'le message nomme le dépôt du dossier ouvert');
  a.inc(modal.text, "d'après l'URL du remote",
    'la provenance du nom de propriétaire est explicitée (ce n’est pas le compte actif)');
  a.inc(modal.text, 'dépôt supprimé',
    'un 404 n’est pas présenté comme un refus certain (les deux cas sont nommés)');
  a.inc(modal.actions.join(' | '), 'Utiliser « proprio »',
    'le compte propriétaire déjà enregistré est proposé par son login réel');
  a.ok(!modal.text.includes(TOKEN), 'aucun token ne peut apparaître dans un message');

  // Le bouton « Utiliser … » bascule vers le compte propriétaire (décision
  // rendue à l'appelant, qui seul écrit le compte actif).
  vscode.__reply('warning', 'Utiliser « proprio »');
  a.eq(await guard.guardAccountSwitch(context, 'mon-compte'), 'proprio',
    'le bouton « Utiliser » renvoie le compte propriétaire');

  vscode.__reply('warning', 'Annuler');
  a.eq(await guard.guardAccountSwitch(context, 'mon-compte'), undefined,
    'annuler laisse le compte actif inchangé');

  // Aucun nom de compte en dur dans ce qui est publié (commentaires mis à part :
  // les exemples de documentation ne s'affichent jamais).
  const forbidden = /joseph|nour-?dev|dalton|octocat/i;
  const strip = (code) => code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
  const hits = [];
  const walk = (dirPath, depth = 0) => {
    // Arborescence bornée : la récursion lit des fichiers, elle ne doit jamais
    // pouvoir s'emballer (lien symbolique, arborescence circulaire).
    if (depth > 12) return;
    for (const name of fs.readdirSync(dirPath)) {
      const full = path.join(dirPath, name);
      if (fs.statSync(full).isDirectory()) walk(full, depth + 1);
      else if (/\.(ts|js|html|css)$/.test(name)) {
        const code = strip(fs.readFileSync(full, 'utf8'));
        if (forbidden.test(code)) hits.push(path.relative(ROOT, full));
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  walk(path.join(ROOT, 'media'));
  a.eq(hits.length, 0,
    'aucun nom de compte en dur dans le code publié — trouvés : ' + hits.join(', '));

  a.done('accountMessages');
})().catch((error) => {
  console.error('✗ exception hors assertions :', error);
  process.exit(1);
});
