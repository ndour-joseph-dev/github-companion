// Bloc « dépôt cloud ↔ compte actif » de la zone d'état : à quel dépôt ce
// dossier correspond, qui le possède, et quel rôle a le compte sélectionné.
// Dépend de row()/esc() (status.js) et accountList (accounts.js), au rendu.

/** Compte actuellement sélectionné (liste fournie par accounts.js). */
function activeAccount() {
  if (typeof accountList === 'undefined') return undefined;
  return accountList.filter(function (a) { return a.active; })[0];
}

/** Échappement sûr dans un attribut (guillemets compris). */
function repoAttr(s) {
  return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function repoLink(url, text) {
  return '<a class="status-link" data-url="' + repoAttr(url) + '">' + esc(text) + '</a>';
}

/**
 * Compte actif, encadré d'un badge rouge : quand le dépôt appartient à
 * quelqu'un d'autre, les deux noms ne doivent pas se confondre à la lecture
 * (« dépôt de « X », compte actif : Y » se lisait comme une seule identité).
 */
function activeBadge(login) {
  return '<span class="account-badge">' + esc(login || 'sans nom') + '</span>';
}

/**
 * Rôle du compte actif sur le dépôt.
 * « role » est calculé par l'extension (propriétaire / administrateur /
 * collaborateur / aucun accès) ; sans lui, on compare simplement le nom du
 * propriétaire dans l'URL avec le compte actif.
 */
function roleRow(repo) {
  const me = activeAccount();
  const login = me && me.login ? String(me.login) : '';
  const owner = String(repo.owner || '');
  const mine = login && login.toLowerCase() === owner.toLowerCase();

  if (repo.role === 'none') {
    // GitHub répond 404 pour un dépôt supprimé comme pour un dépôt auquel le
    // compte n'a pas accès : les deux causes sont donc annoncées, aucune des
    // deux ne doit être affirmée seule.
    return row('Accès', 'Refusé ou dépôt supprimé — propriétaire : ' + esc(owner), 'danger');
  }
  if (repo.role === 'collaborator') {
    const droit = repo.canPush === false ? 'lecture seule' : 'peut pousser';
    return row('Rôle', 'Collaborateur (' + droit + ') — dépôt de « ' + esc(owner) + ' »', 'warn');
  }
  if (repo.role === 'admin') return row('Rôle', 'Administrateur du dépôt (organisation)', 'ok');
  if (repo.role === 'owner' || mine) return row('Rôle', 'Propriétaire', 'ok');
  return row('Propriétaire',
    esc(owner) + ' — compte actif différent : ' + activeBadge(login), 'warn');
}

/**
 * Correspondance entre le dépôt du dossier ouvert et le compte actif : sans
 * elle, l'utilisateur pourrait croire que le dépôt affiché est le sien alors
 * qu'un push partirait vers le dépôt d'un autre compte.
 */
function matchRow(repo) {
  const me = activeAccount();
  const owner = String(repo.owner || '');
  if (!me) return row('Correspondance', 'inconnue — aucun compte actif', 'warn');
  const login = String(me.login || '');
  if (login && login.toLowerCase() === owner.toLowerCase()) {
    return row('Correspondance', 'oui — dépôt du compte actif', 'ok');
  }
  if (repo.role === 'none') {
    return row('Correspondance', 'non — accès refusé ou dépôt supprimé', 'danger');
  }
  return row('Correspondance',
    'non — dépôt de « ' + esc(owner) + ' », compte actif : ' + activeBadge(login), 'warn');
}

/** Lignes d'état du dépôt cloud ; vide si le remote n'est pas exploitable. */
function repoRows(s) {
  if (!s || !s.repo || !s.repo.fullName) return [];
  const repo = s.repo;
  const name = repo.webUrl ? repoLink(repo.webUrl, repo.fullName) : esc(repo.fullName);
  return [row('Dépôt', name), roleRow(repo), matchRow(repo)];
}
