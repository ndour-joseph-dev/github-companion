// Compte actif ≠ propriétaire du dépôt : le nom du compte actif doit être RENDU
// en badge (style dans panel.css), et non glissé dans la phrase comme un second
// nom — « dépôt de « X », compte actif : Y » se lisait comme une seule identité.
// Le badge ne doit jamais laisser passer de HTML par le login (IL est échappé).
const a = require('../harness/assert');
const { boot } = require('../harness/webview');

const fail = (r) => (r.ok ? '' : (r.error && r.error.message) || String(r.error));
const p = boot();
p.domReady();

/** État d'un dossier relié à un dépôt cloud (remote « origin »). */
const state = (repo) => ({
  type: 'status',
  state: 'ok',
  data: {
    branch: 'main',
    hasRemote: true,
    upstream: 'origin/main',
    checkedAt: Date.now(),
    modified: 0,
    ahead: 0,
    staged: 0,
    conflicts: 0,
    behind: 0,
    remoteUrl: 'https://github.com/proprio/dalton',
    repo
  }
});

const settings = (accounts) => p.message({ type: 'settings', autoSync: false, accounts });

settings([
  { id: 'a1', login: 'mon-compte', active: true, repoCount: 1 },
  { id: 'a2', login: 'autre-compte', active: false }
]);

// 1. Rôle calculé par l'extension : le compte actif est badgé dans la phrase.
let r = p.message(state({
  fullName: 'proprio/dalton',
  owner: 'proprio',
  role: 'collaborator',
  canPush: true,
  webUrl: 'https://github.com/proprio/dalton'
}));
a.ok(r.ok, 'un dépôt d’un autre compte s’affiche sans erreur — ' + fail(r));
a.inc(p.element('status').innerHTML, '<span class="account-badge">mon-compte</span>',
  'le compte actif est entouré de son badge (il n’est pas le propriétaire)');
a.inc(p.element('status').innerHTML, 'proprio',
  'le propriétaire du dépôt reste affiché, distinct du compte actif');

// 2. Sans rôle calculé, le panneau compare lui-même : le badge suit le
// propriétaire, entre parenthèses explicites.
r = p.message(state({
  fullName: 'proprio/dalton',
  owner: 'proprio',
  webUrl: 'https://github.com/proprio/dalton'
}));
a.ok(r.ok, 'un dépôt sans rôle calculé s’affiche — ' + fail(r));
a.inc(p.element('status').innerHTML,
  'proprio — compte actif différent : <span class="account-badge">mon-compte</span>',
  'le compte actif est badgé à côté du propriétaire du dépôt');

// 3. Le dépôt du compte actif : aucun badge, la correspondance est confirmée.
r = p.message(state({
  fullName: 'mon-compte/dalton',
  owner: 'mon-compte',
  role: 'owner',
  webUrl: 'https://github.com/mon-compte/dalton'
}));
a.ok(r.ok, 'le dépôt du compte actif s’affiche sans erreur — ' + fail(r));
a.ok(p.element('status').innerHTML.indexOf('account-badge') === -1,
  'aucun badge quand le compte actif est bien le propriétaire');
a.inc(p.element('status').innerHTML, 'Propriétaire', 'le rôle du compte actif reste affiché');

// 4. Un login est une donnée distante : il ne doit jamais injecter de HTML.
settings([{ id: 'a1', login: '<img src=x onerror=alert(1)>', active: true }]);
r = p.message(state({
  fullName: 'proprio/dalton',
  owner: 'proprio',
  webUrl: 'https://github.com/proprio/dalton'
}));
a.ok(r.ok, 'un login inattendu ne fait pas planter le rendu — ' + fail(r));
a.ok(p.element('status').innerHTML.indexOf('<img') === -1,
  'le login du compte est échappé dans le badge (aucun HTML injecté)');
a.inc(p.element('status').innerHTML, '&lt;img', 'le login est affiché en texte, échappé');

a.done('panelBadge');
