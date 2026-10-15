// Barre de comptes : liste déroulante maison + ajouter / retirer, et état du
// compte actif. Un <select> natif s'ouvre dans une fenêtre système que le
// webview ne sait pas positionner : ici le menu est un vrai nœud du DOM.
// Dépend de post() (panel.js) et de esc()/row() (status.js), chargés avant.

let accountList = [];
let menuOpen = false;
let menuIndex = -1;
/** Liste des dépôts du compte actif : consultable, jamais sélectionnable. */
let repoMenuOpen = false;

function accountSelect() {
  return document.getElementById('account-select');
}
function accountMenu() {
  return document.getElementById('account-menu');
}

/** Compte sélectionné (celui que l'extension annonce comme actif). */
function activeAccount() {
  return accountList.find(function (a) { return a.active; }) || accountList[0];
}

/** Options rendues dans le menu (une <li> par compte). */
function accountOptions() {
  return Array.prototype.slice.call(accountMenu().children || []);
}

/** Libellé d'un compte : nom + nombre de dépôts quand il est connu. */
function accountLabel(a) {
  if (!a) return 'Aucun compte';
  const name = a.login || 'Compte sans nom';
  return typeof a.repoCount === 'number' ? name + ' · ' + a.repoCount + ' dépôt(s)' : name;
}

/** Échappement sûr en contexte attribut (guillemets compris). */
function attr(s) {
  return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Diagnostic des comptes envoyé par l'extension (réseau, token refusé…) :
 * une liste vide serait trompeuse, l'échec s'affiche donc ici.
 */
function renderNotice(text) {
  document.getElementById('account-status').innerHTML =
    row('Comptes', esc(text || 'indisponibles'), 'danger');
  // Les dépôts viennent du profil du compte : la panne les rend douteux aussi.
  renderRepoList(true);
}

/** État du compte sélectionné : nom, page GitHub, nombre de dépôts. */
function renderAccountStatus() {
  const el = document.getElementById('account-status');
  const active = activeAccount();
  if (!active) { el.innerHTML = ''; return; }

  const lines = [row('Actif', esc(active.login || 'Compte sans nom'))];
  if (active.htmlUrl) {
    lines.push(row('Profil',
      '<a class="status-link account-link" data-url="' + attr(active.htmlUrl) +
      '">Voir le profil ↗</a>'));
  }
  if (typeof active.repoCount === 'number') {
    lines.push(row('Repos', String(active.repoCount)));
  }
  el.innerHTML = lines.join('');
  el.querySelectorAll('.account-link').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      post('openExternal', { url: a.dataset.url });
    });
  });
}

// --- Liste des dépôts du compte actif -------------------------------------
// Le nombre de dépôts reste affiché ci-dessus ; la liste exacte est consultable
// ici, en LECTURE SEULE : aucune entrée n'est cliquable, rien n'est transmis à
// l'extension (il n'y a pas de « dépôt actif » à choisir — c'est le dossier
// ouvert qui décide, via son remote).

function repoSelect() {
  return document.getElementById('repo-select');
}
function repoMenu() {
  return document.getElementById('repo-menu');
}
/** Entrées <li> de la liste des dépôts. */
function repoOptions() {
  return Array.prototype.slice.call(repoMenu().children || []);
}

/** Dépôt du dossier ouvert, tel que mémorisé par l'état (status.js). */
function currentRepoName() {
  const s = vscode.getState ? vscode.getState() : null;
  const repo = s && s.status && s.status.data ? s.status.data.repo : null;
  return repo && repo.fullName ? String(repo.fullName) : '';
}

/** Libellé du bouton : ce que l'on peut réellement consulter. */
function repoLabel(active) {
  if (!active) return 'Aucun dépôt';
  const repos = active.repos;
  if (repos && repos.length > 0) return repos.length + ' dépôt(s)';
  if (repos) return 'Aucun dépôt'; // liste reçue, mais réellement vide
  return typeof active.repoCount === 'number'
    ? active.repoCount + ' dépôt(s) — liste indisponible'
    : 'Liste des dépôts indisponible';
}

/**
 * Repeint la liste des dépôts du compte actif. `unavailable` signale une panne
 * du profil côté extension : on ne montre alors ni liste ni compteur périmés.
 */
function renderRepoList(unavailable) {
  const toggle = repoSelect();
  const active = activeAccount();
  const repos = !unavailable && active && active.repos ? active.repos : [];
  document.getElementById('repo-current').textContent = unavailable
    ? 'Liste indisponible'
    : repoLabel(active);
  toggle.disabled = repos.length === 0;
  toggle.title = repos.length
    ? 'Dépôts du compte actif — clique pour voir la liste'
    : 'Liste des dépôts indisponible (compte non résolu ou hors ligne)';
  // Le dépôt du dossier ouvert est signalé : la liste sert à vérifier la
  // correspondance avec le compte actif.
  const current = currentRepoName().toLowerCase();
  repoMenu().innerHTML = repos.map(function (name, i) {
    const here = current && String(name).toLowerCase() === current;
    const label = name + (here ? ' · dossier ouvert' : '');
    return '<li id="repo-option-' + i + '" class="dropdown-item" role="option" title="' +
      attr(label) + '">' + esc(label) + '</li>';
  }).join('');
  if (toggle.disabled && repoMenuOpen) closeRepoMenu();
}

function openRepoMenu() {
  const toggle = repoSelect();
  if (toggle.disabled || repoOptions().length === 0) return;
  repoMenuOpen = true;
  repoMenu().hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
}

function closeRepoMenu() {
  if (!repoMenuOpen) return;
  repoMenuOpen = false;
  repoMenu().hidden = true;
  repoSelect().setAttribute('aria-expanded', 'false');
}

function toggleRepoMenu() {
  if (repoMenuOpen) closeRepoMenu();
  else openRepoMenu();
}

/** Surligne la n-ième option (navigation clavier), sans la sélectionner. */
function highlight(i) {
  const options = accountOptions();
  if (options.length === 0) { menuIndex = -1; return; }
  menuIndex = (i + options.length) % options.length;
  options.forEach(function (el, n) { el.classList.toggle('active', n === menuIndex); });
  accountSelect().setAttribute('aria-activedescendant', options[menuIndex].id);
}

function openMenu() {
  const toggle = accountSelect();
  if (toggle.disabled || accountList.length === 0) return;
  menuOpen = true;
  accountMenu().hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  const at = accountList.findIndex(function (a) { return a.active; });
  highlight(at < 0 ? 0 : at);
}

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  accountMenu().hidden = true;
  const toggle = accountSelect();
  toggle.setAttribute('aria-expanded', 'false');
  toggle.removeAttribute('aria-activedescendant');
  accountOptions().forEach(function (el) { el.classList.remove('active'); });
  menuIndex = -1;
}

/** Un second clic sur le bouton referme le menu sans changer de compte. */
function toggleMenu() {
  if (menuOpen) closeMenu();
  else openMenu();
}

/** Envoie le choix à l'extension : elle seule décide si le compte change. */
function switchTo(id) {
  closeMenu();
  if (id) post('account', { action: 'switch', id });
}

/** Affiche les comptes — le token n'est jamais transmis au webview. */
function renderAccounts(list) {
  accountList = list || [];
  closeMenu();
  const toggle = accountSelect();
  const active = activeAccount();
  document.getElementById('account-current').textContent = accountLabel(active);
  toggle.disabled = accountList.length === 0;
  toggle.title = active
    ? 'Compte GitHub actif : ' + accountLabel(active)
    : 'Aucun compte — clique sur « Ajouter un compte »';
  accountMenu().innerHTML = accountList.map(function (a, i) {
    const label = accountLabel(a);
    return '<li id="account-option-' + i + '" class="dropdown-item" role="option" data-id="' +
      attr(a.id) + '"' + (a.active ? ' aria-selected="true"' : '') +
      ' title="' + attr(label) + '">' + esc(label) + '</li>';
  }).join('');
  accountOptions().forEach(function (el) {
    el.onclick = () => switchTo(el.dataset.id);
  });
  renderAccountStatus();
  renderRepoList();
}

accountSelect().onclick = () => toggleMenu();
accountSelect().onkeydown = (e) => {
  const key = e.key;
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    e.preventDefault();
    if (menuOpen) highlight(menuIndex + (key === 'ArrowDown' ? 1 : -1));
    else openMenu();
  } else if (key === 'Home' || key === 'End') {
    if (!menuOpen) return;
    e.preventDefault();
    highlight(key === 'Home' ? 0 : accountOptions().length - 1);
  } else if (key === 'Enter' || key === ' ') {
    e.preventDefault();
    if (!menuOpen) { openMenu(); return; }
    const options = accountOptions();
    if (options[menuIndex]) switchTo(options[menuIndex].dataset.id);
  } else if (key === 'Escape' || key === 'Tab') {
    closeMenu();
  }
};
// Clic ailleurs dans le panneau : les menus ouverts se referment (comme un vrai
// sélecteur). Un clic dans un menu ou sur son bouton est laissé à leurs
// gestionnaires : le fermer ici annulerait le choix du compte avant qu'il ne
// soit transmis.
document.addEventListener('click', (e) => {
  const t = e.target;
  if (!t) return;
  if (menuOpen && !accountMenu().contains(t) && !accountSelect().contains(t)) closeMenu();
  if (repoMenuOpen && !repoMenu().contains(t) && !repoSelect().contains(t)) closeRepoMenu();
});

// Liste des dépôts : le bouton ouvre/ferme la liste (aucune sélection possible).
repoSelect().onclick = () => toggleRepoMenu();
repoSelect().onkeydown = (e) => {
  if (e.key === 'Escape' || e.key === 'Tab') closeRepoMenu();
  else if ((e.key === 'Enter' || e.key === ' ') && !repoMenuOpen) {
    e.preventDefault();
    openRepoMenu();
  }
};

document.getElementById('btn-add-account').onclick = () => post('account', { action: 'add' });
document.getElementById('btn-del-account').onclick = () => {
  const active = activeAccount();
  if (active) post('account', { action: 'remove', id: active.id });
};
// Rafraîchir : la liste des dépôts est une photo de GitHub, conservée par
// l'extension. Elle ne peut pas savoir seule qu'un dépôt a été créé, renommé ou
// supprimé depuis : ce bouton repose la question et l'extension repousse l'état.
document.getElementById('btn-refresh').onclick = () => post('refresh');


