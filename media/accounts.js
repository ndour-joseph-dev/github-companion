// Barre de comptes : liste déroulante maison + ajouter / retirer, et état du
// compte actif. Un <select> natif s'ouvre dans une fenêtre système que le
// webview ne sait pas positionner : ici le menu est un vrai nœud du DOM.
// Dépend de post() (panel.js) et de esc()/row() (status.js), chargés avant.

let accountList = [];
let menuOpen = false;
let menuIndex = -1;

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
// Clic ailleurs dans le panneau : le menu se referme (comme un vrai sélecteur).
// Un clic dans le menu ou sur le bouton est laissé à leurs gestionnaires : le
// fermer ici annulerait le choix du compte avant qu'il ne soit transmis.
document.addEventListener('click', (e) => {
  if (!menuOpen || !e.target) return;
  const menu = accountMenu();
  const t = e.target;
  if (menu.contains(t) || accountSelect().contains(t)) return;
  closeMenu();
});

document.getElementById('btn-add-account').onclick = () => post('account', { action: 'add' });
document.getElementById('btn-del-account').onclick = () => {
  const active = activeAccount();
  if (active) post('account', { action: 'remove', id: active.id });
};


