const vscode = acquireVsCodeApi();
function post(type, extra) {
  vscode.postMessage(Object.assign({ type: type }, extra || {}));
}
/** Mémorise l'état : VS Code peut reconstruire la vue (masquée puis réaffichée). */
function remember(patch) {
  vscode.setState(Object.assign({}, vscode.getState() || {}, patch));
}
/**
 * Repeint le panneau avec le dernier état connu, sans attendre l'extension.
 * Renvoie true si un état avait été mémorisé (sinon la zone resterait vide).
 */
function restore() {
  const s = vscode.getState() || {};
  if (typeof s.autoSync === 'boolean') document.getElementById('auto-sync').checked = s.autoSync;
  if (s.accounts) renderAccounts(s.accounts);
  if (s.status) { renderStatus(s.status); return true; }
  return false;
}

// Délai au-delà duquel le silence de l'extension est affiché dans la zone
// d'état : un panneau vide ne doit jamais rester inexplicable.
const STATE_TIMEOUT_MS = 3000;
let stateTimer = null;
let answered = false;

/** Peint un état reçu du host et le mémorise (jamais un diagnostic local). */
function showStatus(msg) {
  renderStatus(msg);
  if (msg.state !== 'loading' && msg.state !== 'no-answer') remember({ status: msg });
  // La liste des dépôts signale celui du dossier ouvert : elle suit l'état reçu
  // (définie dans accounts.js, chargé après ce script).
  if (typeof renderRepoList === 'function') renderRepoList();
}

/** Sans réponse de l'extension, la zone d'état le dit au lieu de rester vide. */
function watchState() {
  if (stateTimer) clearTimeout(stateTimer);
  stateTimer = setTimeout(() => {
    stateTimer = null;
    if (!answered) renderStatus({ state: 'no-answer' });
  }, STATE_TIMEOUT_MS);
}

/** Demande l'état courant à l'extension (elle répond settings puis status). */
function askState() {
  answered = false;
  post('ready');
  watchState();
}

document.getElementById('btn-init-local').onclick = () => post('initLocalRepo');
document.getElementById('btn-create-repo').onclick = () => post('createRepo');
document.getElementById('btn-commit').onclick = () => {
  post('commit', { message: document.getElementById('commit-message').value });
};
document.getElementById('btn-push').onclick = () => post('push');
document.getElementById('btn-pull').onclick = () => post('pull');
document.getElementById('btn-check').onclick = () => post('checkUpdates');
document.getElementById('btn-token').onclick = () => post('account', { action: 'token' });
document.getElementById('auto-sync').onchange = (e) => {
  post('setAutoSync', { value: e.target.checked });
};
// Un seul émetteur légitime : la page hôte qui héberge le panneau. VS Code sert le
// contenu depuis « vscode-webview://<uuid> » (bureau) ou depuis
// « https://<uuid>.vscode-cdn.net » (VS Code pour le web) : l'origine change à
// chaque vue et n'est pas connue d'avance. On ne peut PAS juger l'émetteur sur son
// IDENTITÉ : dans le cadre interne, le script « _vscodeApiScript » injecté par VS
// Code réassigne « window.parent = window » (ainsi que window.top et frameElement),
// si bien que le host n'est jamais observable comme « window.parent ». Le seul
// discriminant fiable est donc l'ORIGINE — celle du panneau lui-même (son contenu
// est servi par la page hôte) ou l'une des formes connues ci-dessous — ; une
// origine absente reste acceptée (le parent est alors le seul émetteur possible).
const HOST_ORIGIN_PREFIXES = ['vscode-webview://', 'vscode-file://'];
const HOST_ORIGIN_HOST = /^https:\/\/[0-9a-z-]+\.(vscode-cdn\.net|vscode-webview\.net)$/;

/** Origines possibles de la page hôte d'un webview VS Code (dont la nôtre). */
function isHostOrigin(origin) {
  return origin === String(location.origin) ||
    HOST_ORIGIN_PREFIXES.some((p) => origin.startsWith(p)) ||
    HOST_ORIGIN_HOST.test(origin);
}

/** Traite un message du host : chaque type a un rendu dédié. */
function handleMessage(msg) {
  if (msg.type === 'status') {
    answered = true;
    showStatus(msg);
    return;
  }
  if (msg.type === 'settings') {
    document.getElementById('auto-sync').checked = !!msg.autoSync;
    renderAccounts(msg.accounts);
    remember({ autoSync: !!msg.autoSync, accounts: msg.accounts });
    return;
  }
  if (msg.type === 'clearCommitMessage') {
    document.getElementById('commit-message').value = '';
    return;
  }
  if (msg.type === 'notice') {
    // Diagnostic de l'extension sur les comptes : affiché, jamais avalé.
    renderNotice(msg.message);
  }
}

window.addEventListener('message', (event) => {
  const origin = String(event.origin || '');
  // « event.source » n'est pas comparable à « window.parent » (voir plus haut) :
  // sous VS Code les deux valent la fenêtre elle-même, un test d'identité
  // bloquerait donc TOUS les messages du host (état « Aucune réponse de
  // l'extension », comptes vides, case de sync fausse). Seule l'origine tranche.
  const fromOtherSite = origin !== '' && origin !== 'null' && !isHostOrigin(origin);
  if (fromOtherSite) {
    console.warn('Message bloqué : origine non autorisée :', event.origin);
    return; // On arrête tout ici !
  }
  const msg = event.data;
  // Forme inattendue : ignoré, et jamais propagé au rendu.
  if (!msg || typeof msg.type !== 'string') return;
  try {
    handleMessage(msg);
  } catch (error) {
    // Jamais de panneau muet : un rendu cassé devient visible dans la zone d'état.
    console.error('Message « ' + msg.type + ' » non rendu :', error);
    renderStatus({ state: 'error', message: 'affichage impossible (' + msg.type + ')' });
  }
});

// Panneau (re)chargé : on repeint (ou on annonce le chargement) puis on demande
// l'état courant ; « no-answer » s'affiche si rien ne revient.
window.addEventListener('DOMContentLoaded', () => {
  if (!restore()) renderStatus({ state: 'loading' });
  askState();
});
// Vue simplement réaffichée (DOM conservé) : on rafraîchit aussi.
document.addEventListener('visibilitychange', () => { if (!document.hidden) askState(); });
