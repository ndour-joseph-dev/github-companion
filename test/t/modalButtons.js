// Boutons des dialogues modaux : VS Code ajoute TOUJOURS lui-même le bouton de
// fermeture d'un dialogue modal (`mainThreadMessageService._showModalMessage` :
// sans item marqué `isCloseAffordance`, il crée un bouton « Cancel », traduit en
// « Annuler » en français). Déclarer EN PLUS un item « Annuler » faisait donc
// apparaître deux boutons « Annuler » côte à côte — le défaut corrigé ici.
//
// Ce test le verrouille sur tout le code publié, et vérifie qu'une fermeture de
// dialogue (VS Code renvoie `undefined`) est traitée comme une annulation, jamais
// comme un accord.
const fs = require('fs');
const path = require('path');
const { load, requireFromRoot, vscode, ROOT } = require('../harness/load');
const a = require('../harness/assert');
const G = require('../harness/git');

/** Commentaires retirés : un commentaire parlant d'« Annuler » ne compte pas. */
const withoutComments = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Un appel modal : `{ modal: true },` puis des items, jusqu'à la fermeture `);`.
// Le lookahead empêche de traverser la fin de l'appel (donc un autre dialogue).
const MODAL_WITH_CANCEL_ITEM = /\{\s*modal:\s*true\s*\}\s*,(?:(?!\);)[\s\S])*?(['"`])Annuler\1/;

const offenders = [];
let modalCalls = 0;
const walk = (dir, depth = 0) => {
  // Récursion bornée : on lit une arborescence, elle ne doit jamais s'emballer.
  if (depth > 12) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, depth + 1);
    else if (name.endsWith('.ts')) {
      const code = withoutComments(fs.readFileSync(full, 'utf8'));
      modalCalls += (code.match(/\{\s*modal:\s*true\s*\}/g) || []).length;
      if (MODAL_WITH_CANCEL_ITEM.test(code)) offenders.push(path.relative(ROOT, full));
    }
  }
};
walk(path.join(ROOT, 'src'));

// 1. Aucun item « Annuler » déclaré dans un dialogue modal (le doublon).
a.eq(offenders, [],
  'aucun dialogue modal ne déclare d’item « Annuler » — trouvés : ' + offenders.join(', '));
a.ok(modalCalls >= 8,
  `le scan a bien vu les dialogues modaux du code (${modalCalls} trouvés)`);


// 2. Comportement : fermer le dialogue = annuler, jamais valider.
// Chaque cas a son propre compte, donc son propre token : le verdict d'accès est
// rendu selon le token interrogé (aucun réseau, aucun cache à manipuler).
const TOKEN = 'ghp_' + 'F'.repeat(36);        // aucun accès
const TOKEN_READ = 'ghp_' + 'R'.repeat(36);   // accès en lecture seule
const TOKEN_OFF = 'ghp_' + 'O'.repeat(36);    // hors ligne : accès inconnaissable
const TOKEN_OWNER = 'ghp_' + 'W'.repeat(36);  // propriétaire du dépôt
const ACCESS = {
  [TOKEN]: { role: 'none' },
  [TOKEN_READ]: { role: 'collaborator', canPush: false },
  [TOKEN_OFF]: { role: 'unknown' },
  [TOKEN_OWNER]: { role: 'owner' }
};

/** Coffre-fort simulé, clé par clé, comme VS Code (lecture ET écriture). */
function vault(entries) {
  const mem = { ...entries };
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

// Le service GitHub est remplacé sur le module partagé : repoMatch lit la classe
// à l'appel, jamais à l'import.
const github = load('github/githubService.js');
github.GitHubService = class {
  constructor(token) {
    this.token = token;
  }
  async getRepoAccess() {
    return ACCESS[this.token] ?? { role: 'none' };
  }
};

(async () => {
  const dir = G.tmpRepo('modal-buttons');
  G.write(dir, 'a.txt', 'a\n');
  G.commit(dir, 'init');
  G.sh(dir, ['remote', 'add', 'origin', 'https://github.com/proprio/depot-dalton.git']);
  vscode.__state.folders = [{ uri: { fsPath: dir } }];

  const context = vault({
    'githubCompanion.accounts': JSON.stringify([
      { id: 'mon-compte', login: 'mon-compte', token: TOKEN },
      { id: 'proprio', login: 'proprio', token: TOKEN },
      { id: 'lecture', login: 'lecture', token: TOKEN_READ },
      { id: 'hors-ligne', login: 'hors-ligne', token: TOKEN_OFF },
      { id: 'proprietaire', login: 'proprietaire', token: TOKEN_OWNER }
    ]),
    'githubCompanion.activeAccount': 'mon-compte'
  });

  const guard = load('features/accounts/guard.js');
  const pushGuard = load('features/accounts/pushGuard.js');
  const recovery = load('features/guards/recovery.js');
  const staged = load('git/stagedSecrets.js');
  const simpleGit = requireFromRoot('simple-git');

  // (a) Aucun accès : deux items, et fermer le dialogue ne bascule pas.
  vscode.__state.messages = [];
  a.eq(await guard.guardAccountSwitch(context, 'mon-compte'), undefined,
    'fermer le dialogue annule la bascule (VS Code renvoie undefined)');
  let modal = vscode.__state.messages.at(-1);
  a.eq(modal.actions, ['Utiliser « proprio »', 'Changer quand même'],
    'le modal n’a que ses deux items : VS Code ajoute « Annuler » lui-même');
  a.inc(modal.text, 'aucun accès', 'la cause du refus est dite');

  // (b) Accès en LECTURE SEULE : même règle, et « Utiliser … » rend bien le
  // compte propriétaire (la décision revient à l'appelant, seul à écrire).
  vscode.__reply('warning', 'Utiliser « proprio »');
  a.eq(await guard.guardAccountSwitch(context, 'lecture'), 'proprio',
    '« Utiliser … » bascule vers le compte propriétaire');
  modal = vscode.__state.messages.at(-1);
  a.eq(modal.actions, ['Utiliser « proprio »', 'Changer quand même'],
    'pas d’item « Annuler » non plus en lecture seule');
  a.inc(modal.text, 'LECTURE SEULE', 'l’accès en lecture seule est nommé');

  // (c) Propriétaire : rien à demander, aucun dialogue.
  vscode.__state.messages = [];
  a.eq(await guard.guardAccountSwitch(context, 'proprietaire'), 'proprietaire',
    'un compte propriétaire bascule sans dialogue');
  a.eq(vscode.__state.messages.length, 0, 'aucun dialogue pour un propriétaire');

  // (d) Hors ligne (rôle inconnu) : un seul item, et fermer n'engage rien.
  vscode.__state.messages = [];
  a.eq(await guard.guardAccountSwitch(context, 'hors-ligne'), undefined,
    'hors ligne : fermer le dialogue ne bascule pas le compte');
  a.eq(vscode.__state.messages.at(-1).actions, ['Continuer'],
    'le dialogue hors ligne ne déclare que « Continuer »');
  vscode.__reply('warning', 'Continuer');
  a.eq(await guard.guardAccountSwitch(context, 'hors-ligne'), 'hors-ligne',
    '« Continuer » bascule malgré le doute');

  // (e) Push : un seul item, et fermer refuse le push. Le compte actif est ici
  // « mon-compte » (aucun accès) ; le propriétaire, lui, ne voit rien.
  vscode.__reply('warning', 'Pousser quand même');
  a.eq(await pushGuard.confirmPushAllowed(context), true,
    '« Pousser quand même » poursuit le push');
  a.eq(vscode.__state.messages.at(-1).actions, ['Pousser quand même'],
    'le modal de push ne déclare que son item d’action (pas de second « Annuler »)');
  a.eq(await pushGuard.confirmPushAllowed(context), false,
    'fermer le dialogue refuse le push (aucune action cachée)');
  await context.secrets.store('githubCompanion.activeAccount', 'proprietaire');
  vscode.__state.messages = [];
  a.eq(await pushGuard.confirmPushAllowed(context), true,
    'le propriétaire du dépôt pousse sans dialogue');
  a.eq(vscode.__state.messages.length, 0, 'aucun dialogue de push pour un propriétaire');

  // (f) Commit qui publierait des identifiants : fermer = ne pas commiter.
  const secrets = G.tmpRepo('modal-secrets');
  G.write(secrets, '.env', 'GITHUB_TOKEN=ghp_' + 'Z'.repeat(30) + '\n');
  const git = simpleGit(secrets);
  await git.raw(['add', '-A']);
  vscode.__state.messages = [];
  a.eq(await recovery.guardStagedSecrets(git), false,
    'fermer le dialogue empêche le commit (aucune publication cachée)');
  a.eq(vscode.__state.messages.at(-1).actions,
    ['Désindexer ces fichiers', 'Commiter quand même'],
    'le modal de secrets ne déclare que ses deux choix');
  vscode.__reply('warning', 'Commiter quand même');
  a.eq(await recovery.guardStagedSecrets(git), true, '« Commiter quand même » poursuit');
  vscode.__reply('warning', 'Désindexer ces fichiers');
  a.eq(await recovery.guardStagedSecrets(git), false, '« Désindexer » arrête le commit');
  a.ok(!(await staged.scanStaged(git)).paths.includes('.env'), '.env retiré de l’index');
  a.ok(fs.existsSync(path.join(secrets, '.env')), 'le fichier reste intact sur le disque');

  a.done('modalButtons');
})().catch((error) => {
  console.error('✗ exception hors assertions :', error);
  process.exit(1);
});
