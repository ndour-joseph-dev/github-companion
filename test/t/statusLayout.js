// Zone d'état : chaque information affichée est dans SON propre <div> (un
// conteneur par élément : Actif, Profil, Repos, Branche, Remote, Dépôt, Rôle,
// Correspondance, Dernier commit, Message, Modifiés…), jamais du texte nu, ni un
// <span>/<ul> posé à la racine. C'est ce qui permet à chaque ligne de porter son
// propre padding vertical (voir .status-row / .commit-block dans panel.css) : la
// lisibilité ne dépend plus du gap du conteneur.
const a = require('../harness/assert');
const { boot } = require('../harness/webview');

const fail = (r) => (r.ok ? '' : (r.error && r.error.message) || String(r.error));
const p = boot();
p.domReady();

/** Balises sans contenu : elles ne ferment jamais (aucune dans la zone d'état). */
const VOID = new Set(['br', 'hr', 'img', 'input']);

/** Éléments de PREMIER NIVEAU du fragment, et le texte resté en dehors d'eux. */
function splitBlocks(html) {
  const re = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|<\/([a-zA-Z][a-zA-Z0-9]*)>/g;
  const blocks = [];
  const loose = [];
  let depth = 0;
  let start = -1;
  let openTag = '';
  let cursor = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      if (depth === 0) {
        start = m.index;
        openTag = m[1].toLowerCase();
        loose.push(html.slice(cursor, start));
      }
      if (!VOID.has(m[1].toLowerCase())) depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0) {
        blocks.push({ tag: openTag, html: html.slice(start, re.lastIndex) });
        cursor = re.lastIndex;
      }
    }
  }
  loose.push(html.slice(cursor));
  return { blocks, loose: loose.join('') };
}

/** Vérifie qu'un fragment rendu est une suite de <div>, sans texte orphelin. */
function checkZone(name, html, labels) {
  const { blocks, loose } = splitBlocks(html);
  const bad = blocks.filter((b) => b.tag !== 'div').map((b) => '<' + b.tag + '>');
  a.ok(blocks.length > 0, name + ' rend au moins une information');
  a.eq(bad.join(','), '', name + ' : chaque information est dans un conteneur <div>');
  a.eq(loose.trim(), '', name + ' : aucun texte rendu hors d’un conteneur');
  labels.forEach((label) => {
    const block = blocks.filter((b) => b.html.indexOf('>' + label + '<') > -1)[0];
    a.ok(!!block && block.tag === 'div', name + ' : « ' + label + ' » a son propre <div>');
  });
  return blocks;
}


// 1. Comptes : Actif, Profil, Repos — un <div> chacun.
let r = p.message({
  type: 'settings',
  autoSync: false,
  accounts: [{ id: 'a1', login: 'mon-compte', active: true, repoCount: 3,
    htmlUrl: 'https://github.com/mon-compte' }]
});
a.ok(r.ok, 'le panneau affiche le compte actif — ' + fail(r));
checkZone('la zone des comptes', p.element('account-status').innerHTML,
  ['Actif', 'Profil', 'Repos']);

/** État complet : toutes les lignes que la zone d'état peut afficher. */
const full = () => ({
  type: 'status',
  state: 'ok',
  data: {
    branch: 'main',
    hasRemote: true,
    upstream: 'origin/main',
    remoteUrl: 'https://github.com/proprio/dalton',
    repo: {
      fullName: 'proprio/dalton', owner: 'proprio', role: 'collaborator',
      canPush: true, webUrl: 'https://github.com/proprio/dalton'
    },
    lastCommit: 'passage du thème noir',
    lastCommitAt: Date.now(),
    lastAuthor: 'mon-compte',
    checkedAt: Date.now(),
    modified: 1,
    staged: 0,
    ahead: 0,
    behind: 2,
    remoteCommits: [{ author: 'proprio', when: 'il y a 2 h', subject: 'corrige le badge' }],
    conflicts: 0
  }
});

// 2. État complet : chaque information de la zone a son propre <div>.
r = p.message(full());
a.ok(r.ok, 'un état complet s’affiche — ' + fail(r));
const blocks = checkZone('la zone d’état', p.element('status').innerHTML,
  ['Branche', 'Remote', 'Dépôt', 'Rôle', 'Correspondance', 'Dernier commit (local)',
    'Message', 'Modifiés', 'À récupérer']);
a.eq(blocks.filter((b) => b.html.indexOf('class="status-row') > -1).length,
  blocks.length - 1, 'seule la liste des commits n’est pas une ligne label + valeur');
a.ok(blocks.every((b) => b.html.indexOf('class="label"') > -1 ||
  b.html.indexOf('class="commit-list"') > -1),
'aucun <div> d’état n’est vide (chacun a son libellé ou sa liste)');

// 3. Dépôt local sans commit : la zone reste une suite de <div>.
r = p.message({
  type: 'status',
  state: 'ok',
  data: { branch: '', hasRemote: false, lastCommit: '', modified: 0, ahead: 0,
    staged: 0, conflicts: 0, behind: 0 }
});
a.ok(r.ok, 'un dépôt sans commit s’affiche — ' + fail(r));
checkZone('l’état d’un dépôt vide', p.element('status').innerHTML,
  ['Branche', 'Remote', 'Dernier commit']);

// 4. États courts (chargement, silence, hors dépôt) : mêmes règles.
['loading', 'no-answer', 'no-folder', 'no-repo'].forEach((state) => {
  r = p.message({ type: 'status', state });
  a.ok(r.ok, 'l’état « ' + state + ' » s’affiche — ' + fail(r));
  checkZone('l’état « ' + state + ' »', p.element('status').innerHTML, []);
});

a.done('statusLayout');
