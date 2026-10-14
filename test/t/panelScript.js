// Panneau web exécuté pour de vrai (harnais webview) : messages du host, rendu
// de l'état, câblage des boutons. Les autres tests ne lisent que le texte de
// media/*.js — un bug d'exécution (variable non définie) y échappait.
const a = require('../harness/assert');
const { boot, wiredIds, htmlIds, SCRIPTS } = require('../harness/webview');

const fail = (r) => (r.ok ? '' : (r.error && r.error.message) || String(r.error));
const p = boot();

// 1. Chargement : les quatre scripts s'installent sans erreur.
a.ok(p.errors.length === 0,
  'les scripts du panneau se chargent sans erreur — ' +
  p.errors.map((e) => e.file + ' → ' + e.error.message).join(' | '));
a.eq(SCRIPTS.length, 4, 'les quatre scripts du panneau sont chargés');
a.ok(typeof p.element('btn-pull').onclick === 'function',
  'le bouton « Mettre à jour » est câblé dès le chargement');

// 2. Cohérence HTML ↔ scripts : aucun id câblé ne doit manquer au panneau.
const declared = new Set(htmlIds());
const missing = wiredIds().filter((id) => !declared.has(id));
a.ok(missing.length === 0, 'chaque id câblé par les scripts existe dans panel.html — manquants : ' + missing.join(', '));

// 3. Panneau (re)chargé : repeint puis réclame l'état à l'extension.
let r = p.domReady();
a.ok(r.ok, 'un panneau chargé se repeint et demande l’état sans erreur — ' + fail(r));
a.ok(p.posted.some((m) => m.type === 'ready'), 'le panneau réclame l’état à l’extension');

// 4. Message « settings » du host : comptes + bascule auto-sync.
const accounts = [
  { id: 'a1', login: 'joseph-dev', active: true, repoCount: 3, htmlUrl: 'https://github.com/joseph-dev' },
  { id: 'a2', login: 'autre-compte', active: false }
];
r = p.message({ type: 'settings', autoSync: true, accounts });
a.ok(r.ok, 'un message « settings » du host est traité — ' + fail(r));
a.eq(p.element('auto-sync').checked, true, 'la bascule auto-sync suit les réglages reçus');
a.eq(p.element('account-current').textContent, 'joseph-dev · 3 dépôt(s)',
  'le compte actif s’affiche dans le bouton du sélecteur');
a.eq(p.element('account-select').disabled, false, 'le sélecteur s’active dès qu’un compte existe');
a.eq(p.element('account-menu').hidden, true, 'le menu reste replié tant qu’on ne l’ouvre pas');
const options = p.element('account-menu').children;
a.eq(options.length, 2, 'une option <li> par compte est rendue dans le menu');
a.eq(options[0].dataset.id, 'a1', 'chaque option porte l’identifiant du compte');
a.eq(options[0].getAttribute('aria-selected'), 'true', 'le compte actif est coché dans la liste');
a.eq(options[1].getAttribute('aria-selected'), null, 'un compte inactif n’est pas coché');
a.inc(p.element('account-status').innerHTML, 'Repos', 'le nombre de dépôts du compte actif est affiché');
a.eq(p.state.accounts, accounts, 'l’état du panneau mémorise les comptes reçus');

// 4a. Lien profil du compte actif : un clic demande l'ouverture dans le navigateur.
const profile = p.element('account-status').querySelectorAll('.account-link')[0];
a.ok(!!profile, 'le lien vers le profil du compte actif est rendu');
let profileError;
try {
  if (profile) profile.click({ preventDefault() {} });
} catch (error) {
  profileError = error;
}
a.ok(!profileError, 'le clic sur le profil ne plante pas — ' + (profileError && profileError.message));
a.ok(p.posted.some((m) => m.type === 'openExternal' && m.url === 'https://github.com/joseph-dev'),
  'le clic sur le profil demande son ouverture dans le navigateur');

// 4b. Sélecteur déroulant : tout se joue dans le DOM du panneau (aucun popup
// système), donc l'ouverture, le clavier et la fermeture sont testables ici.
const invoke = (fn, ...args) => {
  try {
    fn(...args);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
};
/** Nombre de messages « switch » déjà envoyés (le choix d'un compte). */
const switches = () => p.posted.filter((m) => m.type === 'account' && m.action === 'switch').length;

r = p.fire('account-select', 'onclick', {});
a.ok(r.ok, 'un clic sur le sélecteur ouvre le menu sans erreur — ' + fail(r));
a.eq(p.element('account-menu').hidden, false, 'le menu s’ouvre à l’intérieur du panneau');
a.eq(p.element('account-select').getAttribute('aria-expanded'), 'true', 'le bouton se déclare déplié');
a.ok(options[0].classList.contains('active'), 'l’option du compte actif est surlignée à l’ouverture');
a.eq(p.element('account-select').getAttribute('aria-activedescendant'), options[0].id,
  'le bouton référence l’option surlignée (lecteur d’écran)');

r = p.fire('account-select', 'onkeydown', p.key('ArrowDown'));
a.ok(r.ok, 'la flèche bas déplace le surlignage sans planter — ' + fail(r));
a.ok(options[1].classList.contains('active'), 'la flèche bas passe à l’option suivante');
r = p.fire('account-select', 'onkeydown', p.key('ArrowDown'));
a.ok(options[0].classList.contains('active'), 'la flèche bas boucle par le haut');
r = p.fire('account-select', 'onkeydown', p.key('ArrowUp'));
a.ok(r.ok, 'la flèche haut déplace le surlignage sans planter — ' + fail(r));
a.ok(options[1].classList.contains('active'), 'la flèche haut revient à l’option précédente');
r = p.fire('account-select', 'onkeydown', p.key('End'));
a.ok(options[1].classList.contains('active'), '« Fin » va à la dernière option');
r = p.fire('account-select', 'onkeydown', p.key('Home'));
a.ok(options[0].classList.contains('active'), '« Début » revient à la première option');

const before9 = switches();
r = p.fire('account-select', 'onkeydown', p.key('Enter'));
a.ok(r.ok, '« Entrée » choisit l’option surlignée sans planter — ' + fail(r));
a.eq(switches(), before9 + 1, '« Entrée » demande le changement de compte à l’extension');
a.ok(p.posted.some((m) => m.type === 'account' && m.action === 'switch' && m.id === 'a1'),
  'le changement porte l’identifiant du compte surligné');
a.eq(p.element('account-menu').hidden, true, 'le menu se referme après le choix');

// Clic direct sur une option : même effet, sans passer par le clavier.
r = p.fire('account-select', 'onclick', {});
a.eq(p.element('account-menu').hidden, false, 'un second clic sur le bouton rouvre le menu');
const chosen = invoke(options[1].onclick);
a.ok(chosen.ok, 'le clic sur une option du menu ne plante pas — ' + fail(chosen));
a.ok(p.posted.some((m) => m.type === 'account' && m.action === 'switch' && m.id === 'a2'),
  'le clic sur une option transmet le compte choisi');

// Fermetures : clic ailleurs, Échap, et second clic sur le bouton (bascule).
p.fire('account-select', 'onclick', {});
r = p.click({ tagName: 'SPAN' });
a.ok(r.ok, 'un clic ailleurs ne plante pas — ' + fail(r));
a.eq(p.element('account-menu').hidden, true, 'un clic ailleurs referme le menu');
a.eq(p.element('account-select').getAttribute('aria-expanded'), 'false', 'le bouton se déclare replié');
a.eq(p.element('account-select').getAttribute('aria-activedescendant'), null,
  'le surlignage est oublié à la fermeture');
// Clic « dans » le menu : c'est le gestionnaire de l'option qui décide, le clic
// extérieur ne doit pas refermer le menu avant que le choix ne parte.
p.fire('account-select', 'onclick', {});
const inMenu = p.click(p.element('account-menu').children[0]);
a.ok(inMenu.ok, 'un clic dans le menu ne plante pas — ' + fail(inMenu));
a.eq(p.element('account-menu').hidden, false, 'un clic sur une option laisse le menu ouvert');
const onToggle = p.click(p.element('account-select'));
a.ok(onToggle.ok, 'un clic sur le bouton ne plante pas — ' + fail(onToggle));
a.eq(p.element('account-menu').hidden, false, 'un clic sur le bouton ne referme pas le menu (c’est son rôle)');
p.fire('account-select', 'onclick', {}); // referme le menu pour la suite
p.fire('account-select', 'onclick', {});
p.fire('account-select', 'onkeydown', p.key('Escape'));
a.eq(p.element('account-menu').hidden, true, '« Échap » referme le menu');
p.fire('account-select', 'onclick', {});
p.fire('account-select', 'onclick', {});
a.eq(p.element('account-menu').hidden, true, 'un second clic sur le bouton referme le menu');
a.eq(switches(), before9 + 2, 'refermer le menu ne change pas de compte');

// Sélecteur indisponible : aucun compte, bouton désactivé, menu jamais ouvert.
r = p.message({ type: 'settings', autoSync: false, accounts: [] });
a.ok(r.ok, 'un message « settings » sans compte est traité — ' + fail(r));
a.eq(p.element('account-current').textContent, 'Aucun compte', 'l’absence de compte est annoncée');
a.eq(p.element('account-select').disabled, true, 'le sélecteur est désactivé sans compte');
r = p.fire('account-select', 'onclick', {});
a.ok(r.ok, 'cliquer sur un sélecteur désactivé ne plante pas — ' + fail(r));
a.eq(p.element('account-menu').hidden, true, 'aucun menu ne s’ouvre sans compte');
r = p.fire('account-select', 'onkeydown', p.key('Enter'));
a.ok(r.ok, '« Entrée » sur un sélecteur vide ne plante pas — ' + fail(r));
a.eq(p.element('account-menu').hidden, true, 'le clavier n’ouvre pas de menu sans compte');
r = p.message({ type: 'settings', autoSync: true, accounts });
a.ok(r.ok, 'les comptes peuvent revenir après un état vide — ' + fail(r));

// 5. Message « status » du host : zone d'état, badge « à récupérer », coche.
r = p.message({
  type: 'status',
  data: {
    branch: 'main',
    hasRemote: true,
    upstream: 'origin/main',
    checkedAt: Date.now(),
    modified: 0,
    ahead: 0,
    staged: 0,
    conflicts: 0,
    behind: 2,
    remoteUrl: 'https://github.com/joseph-dev/demo',
    repo: {
      fullName: 'joseph-dev/demo',
      owner: 'joseph-dev',
      role: 'owner',
      webUrl: 'https://github.com/joseph-dev/demo'
    },
    remoteCommits: [{ author: 'joseph-dev', when: 'hier', subject: 'fix: panneau' }]
  }
});
a.ok(r.ok, 'un message « status » du host est traité — ' + fail(r));
a.inc(p.element('status').innerHTML, 'main', 'la branche courante est affichée');
a.inc(p.element('status').innerHTML, 'joseph-dev/demo', 'le dépôt cloud associé est affiché');
a.inc(p.element('status').innerHTML, 'Propriétaire', 'le rôle du compte actif est affiché');
a.inc(p.element('status').innerHTML, 'fix: panneau', 'les commits distants sont listés');
a.eq(p.element('pull-badge').textContent, '2', 'le badge affiche le nombre de commits à récupérer');
a.ok(!p.element('pull-badge').classList.contains('hidden'), 'le badge est visible quand il reste des commits');
a.ok(p.element('pull-ok').classList.contains('hidden'), 'la coche reste masquée tant qu’il reste des commits');
a.ok(p.state.status && p.state.status.data.branch === 'main', 'l’état du panneau mémorise le dernier statut');

// 5b. Lien reconstruit dans la zone d'état : un clic demande l'ouverture.
const link = p.element('status').querySelectorAll('.status-link')[0];
a.ok(!!link, 'le lien « Voir sur GitHub » est reconstruit dans la zone d’état');
let linkError;
try {
  if (link) link.click({ preventDefault() {} });
} catch (error) {
  linkError = error;
}
a.ok(!linkError, 'le clic sur le lien ne plante pas — ' + (linkError && linkError.message));
a.ok(p.posted.some((m) => m.type === 'openExternal' && m.url === 'https://github.com/joseph-dev/demo'),
  'le clic sur le lien demande l’ouverture dans le navigateur');

// 6. Message « clearCommitMessage » : le champ est vidé.
p.element('commit-message').value = 'wip';
r = p.message({ type: 'clearCommitMessage' });
a.ok(r.ok, 'un message « clearCommitMessage » est traité — ' + fail(r));
a.eq(p.element('commit-message').value, '', 'le champ de message est vidé après un commit réussi');

// 7. Garde de l'émetteur : une origine étrangère ne peut pas piloter le panneau.
const before = p.element('status').innerHTML;
const warnsBefore = p.warns.length;
r = p.message({ type: 'status', data: { branch: 'pirate' } }, { origin: 'https://exemple-malveillant.test' });
a.ok(r.ok, 'une origine étrangère est refusée sans planter — ' + fail(r));
a.eq(p.element('status').innerHTML, before, 'une origine étrangère ne change pas l’affichage');
a.ok(p.warns.length > warnsBefore, 'l’émetteur refusé est journalisé');
// Le host reste écouté, même s'il se présente sans origine.
r = p.message({ type: 'clearCommitMessage' }, { origin: '' });
a.ok(r.ok, 'le host reste écouté sans origine déclarée — ' + fail(r));

// 7b. Shim VS Code : dans le cadre interne, VS Code réassigne « window.parent =
// window » (« _vscodeApiScript », injecté en tête du panneau). Le shell n'est donc
// JAMAIS « window.parent » : juger l'émetteur sur son identité bloquait tous ses
// messages — état « Aucune réponse de l'extension », comptes jamais chargés, case
// auto-sync fausse. Le harnais reproduit ce shim, et le shell parle depuis
// l'origine de la vue, comme en production.
a.ok(p.ctx.window.parent === p.ctx.window,
  'le harnais reproduit le shim VS Code (window.parent = window)');
a.ok(p.ctx.window.frameElement === null, 'le harnais reproduit le shim VS Code (frameElement = null)');
const warnsBeforeHost = p.warns.length;
r = p.message({ type: 'settings', autoSync: true, accounts });
a.ok(r.ok, 'le message du shell est traité malgré le shim VS Code — ' + fail(r));
a.eq(p.warns.length, warnsBeforeHost, 'le shell n’est jamais pris pour un cadre étranger');
a.eq(p.element('account-current').textContent, 'joseph-dev · 3 dépôt(s)',
  'les comptes envoyés par le shell arrivent malgré le shim VS Code');
p.element('commit-message').value = 'wip';
r = p.message({ type: 'clearCommitMessage' }, { origin: 'vscode-file://vscode-app/panel.html' });
a.ok(r.ok, 'un shell servi en « vscode-file:// » est traité — ' + fail(r));
a.eq(p.element('commit-message').value, '',
  'le message du shell est appliqué (VS Code bureau, origine « vscode-file:// »)');
p.element('commit-message').value = 'wip';
r = p.message({ type: 'clearCommitMessage' },
  { origin: 'https://abc123.vscode-cdn.net' });
a.ok(r.ok, 'un shell servi par le CDN web est traité — ' + fail(r));
a.eq(p.element('commit-message').value, '',
  'le message du shell est appliqué (VS Code web, origine « …vscode-cdn.net »)');

// 7c. L'origine du panneau lui-même suffit : c'est le cas d'une vue servie
// autrement (session de développement en http, vue reconstruite…), où le shell
// parle forcément depuis cette origine — aucune forme VS Code à reconnaître.
const dev = boot({ origin: 'http://localhost:5173' });
r = dev.domReady();
a.ok(r.ok, 'un panneau servi hors des formes VS Code se charge — ' + fail(r));
dev.element('commit-message').value = 'wip';
r = dev.message({ type: 'clearCommitMessage' });
a.ok(r.ok, 'un tel shell est écouté — ' + fail(r));
a.eq(dev.element('commit-message').value, '',
  'le message est appliqué quand l’origine du shell est celle du panneau');
dev.element('commit-message').value = 'wip';
r = dev.message({ type: 'clearCommitMessage' }, { origin: 'https://exemple-malveillant.test' });
a.ok(r.ok, 'une origine étrangère est ignorée sans planter — ' + fail(r));
a.eq(dev.element('commit-message').value, 'wip',
  'une origine étrangère reste refusée, quelle que soit l’origine de la vue');

// 8. Messages mal formés : ignorés, jamais propagés au rendu.
a.ok(p.message(undefined).ok, 'un message sans données est ignoré sans exception');
a.ok(p.message('texte brut').ok, 'un message non-objet est ignoré sans exception');
a.ok(p.message({ sansType: true }).ok, 'un message sans « type » est ignoré sans exception');
a.ok(p.message({ type: 42 }).ok, 'un « type » non textuel est ignoré sans exception');
a.eq(p.element('status').innerHTML, before, 'aucun message mal formé ne touche l’affichage');

// 9. Câblage des actions : même bouton, même message envoyé à l'extension.
r = p.fire('btn-pull', 'onclick', {});
a.ok(r.ok && p.posted.some((m) => m.type === 'pull'), '« Mettre à jour » déclenche « pull »');
r = p.fire('btn-check', 'onclick', {});
a.ok(r.ok && p.posted.some((m) => m.type === 'checkUpdates'), '« Vérifier » déclenche « checkUpdates »');
p.element('commit-message').value = 'feat: panneau';
r = p.fire('btn-commit', 'onclick', {});
a.ok(r.ok && p.posted.some((m) => m.type === 'commit' && m.message === 'feat: panneau'),
  '« Commit » transmet le message saisi');
r = p.fire('btn-del-account', 'onclick', {});
a.ok(r.ok && p.posted.some((m) => m.type === 'account' && m.action === 'remove' && m.id === 'a1'),
  '« Retirer ce compte » cible le compte actif annoncé');
r = p.fire('btn-add-account', 'onclick', {});
a.ok(r.ok && p.posted.some((m) => m.type === 'account' && m.action === 'add'),
  '« Ajouter un compte » déclenche l’action « add »');
r = p.fire('btn-token', 'onclick', {});
a.ok(r.ok && p.posted.some((m) => m.type === 'account' && m.action === 'token'),
  '« Ajouter un token » déclenche l’action « token »');
r = p.fire('auto-sync', 'onchange', { target: { checked: false } });
a.ok(r.ok && p.posted.some((m) => m.type === 'setAutoSync' && m.value === false),
  'la bascule auto-sync est transmise à l’extension');

// 10. Vue simplement réaffichée : nouvelle demande d'état (masquée : aucune).
const readyCount = p.posted.filter((m) => m.type === 'ready').length;
p.visibility(false);
a.eq(p.posted.filter((m) => m.type === 'ready').length, readyCount + 1,
  'une vue réaffichée redemande l’état');
p.visibility(true);
a.eq(p.posted.filter((m) => m.type === 'ready').length, readyCount + 1,
  'une vue masquée ne réclame rien');

// 11. États sans données git : chargement, silence de l'extension, panne du host.
// Aucun de ces cas ne doit laisser la zone d'état vide — c'était le bug d'origine
// (le panneau envoyait « rien » et la carte restait blanche, sans explication).
r = p.message({ type: 'status', state: 'loading' });
a.ok(r.ok, 'un état « loading » du host est rendu — ' + fail(r));
a.inc(p.element('status').innerHTML, 'Chargement', 'le chargement est annoncé au lieu d’une zone vide');
r = p.message({ type: 'status', state: 'no-answer' });
a.inc(p.element('status').innerHTML, 'Aucune réponse de l’extension',
  'le silence de l’extension devient un diagnostic lisible');
r = p.message({ type: 'status', state: 'error', message: 'l’état du dépôt indisponible (git absent)' });
a.inc(p.element('status').innerHTML, 'Erreur :', 'une panne annoncée par le host est affichée');
a.inc(p.element('status').innerHTML, 'git absent', 'le détail de la panne est conservé');
a.inc(p.element('status').innerHTML, 'danger', 'la panne est mise en évidence (ligne « danger »)');
a.ok(p.element('pull-badge').classList.contains('hidden') &&
  p.element('pull-ok').classList.contains('hidden'),
  'aucun indicateur de synchronisation sur un état sans données');

// Un état « ok » sans données ne doit pas non plus laisser la zone muette.
r = p.message({ type: 'status', state: 'ok' });
a.ok(r.ok, 'un état « ok » sans données ne plante pas — ' + fail(r));
a.inc(p.element('status').innerHTML, 'indisponible', 'un état « ok » vide est signalé');

// 11b. Diagnostic « notice » du host : la zone des comptes porte l'échec (une
// liste vide laisserait croire qu'aucun compte n'est enregistré).
r = p.message({ type: 'notice', message: 'Comptes indisponibles (réseau injoignable)' });
a.ok(r.ok, 'un diagnostic « notice » est traité — ' + fail(r));
a.inc(p.element('account-status').innerHTML, 'Comptes indisponibles',
  'la panne des comptes est affichée au lieu d’une liste vide muette');
a.inc(p.element('account-status').innerHTML, 'danger', 'l’échec des comptes est mis en évidence');
r = p.message({ type: 'settings', autoSync: true, accounts });
a.ok(r.ok, 'un nouvel état des comptes est traité — ' + fail(r));
a.inc(p.element('account-status').innerHTML, 'Actif',
  'un nouvel état remplace le diagnostic (l’affichage se répare seul)');

// 12. Panneau neuf, extension muette : le silence devient visible après délai.
const q = boot();
r = q.domReady();
a.ok(r.ok, 'un panneau neuf se charge sans erreur — ' + fail(r));
a.inc(q.element('status').innerHTML, 'Chargement', 'la zone d’état annonce le chargement dès l’ouverture');
a.eq(q.pendingTimers(), 1, 'un délai est armé en attendant l’extension');
a.eq(q.runTimers().ok, true, 'le délai de secours s’exécute sans erreur');
a.inc(q.element('status').innerHTML, 'Aucune réponse de l’extension',
  'sans réponse, le panneau explique le vide au lieu de rester muet');

// 13. Réponse reçue : le diagnostic de silence est annulé (aucun faux positif).
const w = boot();
w.domReady();
w.message({
  type: 'status',
  state: 'ok',
  data: { branch: 'main', hasRemote: false, modified: 0, ahead: 0, staged: 0, conflicts: 0, behind: 0 }
});
a.eq(w.runTimers().ok, true, 'le délai de secours s’exécute sans erreur après une réponse');
a.ok(w.element('status').innerHTML.indexOf('Aucune réponse') === -1,
  'une réponse reçue annule le diagnostic de silence');
a.inc(w.element('status').innerHTML, 'main', 'l’état reçu reste affiché après le délai');

// 14. Vue reconstruite : le dernier état mémorisé est repeint, pas d'écran vide.
const v = boot({ state: { status: { state: 'no-folder' } } });
r = v.domReady();
a.ok(r.ok, 'une vue reconstruite se repeint sans erreur — ' + fail(r));
a.inc(v.element('status').innerHTML, 'Aucun dossier ouvert', 'le dernier état connu est repeint');
a.ok(v.element('status').innerHTML.indexOf('Chargement') === -1,
  'un état mémorisé évite l’affichage « Chargement »');

// 15. Rendu cassé : l'échec devient visible, le panneau ne reste jamais muet.
const brokenPanel = boot();
brokenPanel.domReady();
const warnedBefore = brokenPanel.warns.length;
r = brokenPanel.message({ type: 'settings', autoSync: false, accounts: 42 });
a.ok(r.ok, 'un message incohérent du host ne fait pas planter le panneau — ' + fail(r));
a.inc(brokenPanel.element('status').innerHTML, 'affichage impossible',
  'un rendu impossible est signalé dans la zone d’état');
a.ok(brokenPanel.warns.length > warnedBefore,
  'l’échec de rendu est journalisé dans la console du panneau');
a.inc(brokenPanel.warns.join(' | '), 'non rendu', 'la trace nomme le message fautif');

a.done('panelScript');
