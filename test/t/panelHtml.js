const fs = require('fs');
const path = require('path');
const { ROOT } = require('../harness/load');
const a = require('../harness/assert');

const media = path.join(ROOT, 'media');
const read = (f) => fs.readFileSync(path.join(media, f), 'utf8');
const html = read('panel.html');
const js = read('panel.js');
const accountsJs = read('accounts.js');
const statusJs = read('status.js');

// Groupe « comptes » du haut : bornes explicites (jusqu'à la zone d'état).
const accStart = html.indexOf('<div class="accounts">');
const accEnd = html.indexOf('<div class="status">');
const top = accStart > -1 && accEnd > accStart ? html.slice(accStart, accEnd) : '';

a.ok(accStart > -1, 'la barre de comptes existe en haut du panneau');
a.inc(top, 'id="btn-token"', 'le bouton token est dans la barre de comptes');
a.inc(top, 'Ajouter un token', 'le bouton token est libellé « Ajouter un token »');
a.inc(top, 'id="btn-del-account"', 'il est voisin du bouton « Retirer ce compte »');
a.inc(top, 'id="btn-add-account"', 'l’ajout d’un compte supplémentaire reste disponible');
a.eq((top.match(/class="secondary"/g) || []).length, 3, 'trois actions groupées : compte, token, retrait');
a.ok(top.indexOf('id="btn-token"') < top.indexOf('id="btn-del-account"'),
  'le bouton token précède le bouton de suppression');
a.ok(html.slice(accEnd).indexOf('btn-token') === -1, 'le bouton token n’est plus en bas du panneau');

// Sélecteur de compte maison : un <select> natif ouvre une fenêtre système que le
// webview ne sait pas positionner (popup de quelques pixels, donc invisible).
a.ok(html.indexOf('<select') === -1, 'plus aucun <select> natif dans le panneau');
a.inc(top, 'id="account-select"', 'le compte actif se choisit dans un bouton du DOM');
a.inc(top, 'id="account-current"', 'le libellé du compte actif a son propre nœud');
a.inc(top, 'id="account-menu"', 'le menu déroulant est une liste du DOM (positionnée par le panneau)');
a.inc(top, 'role="listbox"', 'le menu porte le rôle ARIA « listbox »');
a.inc(top, 'aria-haspopup="listbox"', 'le bouton annonce qu’il ouvre une liste');
a.inc(top, 'aria-expanded="false"', 'le bouton démarre replié (état ARIA explicite)');
a.inc(top, 'aria-controls="account-menu"', 'le bouton déclare le menu qu’il contrôle');
a.inc(top, 'hidden', 'le menu est masqué au chargement (pas de menu ouvert au démarrage)');
a.inc(accountsJs, 'onkeydown', 'la navigation clavier du sélecteur est câblée');
a.inc(accountsJs, 'ArrowDown', 'les flèches parcourent les comptes');
a.inc(accountsJs, 'Escape', 'Échap referme le menu');
a.inc(accountsJs, "setAttribute('aria-expanded'", 'l’état ouvert/fermé est annoncé aux lecteurs d’écran');

// Conteneur parent + titre (la mise en page est vérifiée par panelLayout).
a.inc(top, 'class="accounts-actions"', 'un conteneur parent regroupe les trois actions');
a.inc(top, '<div class="group-title">Gestion des comptes</div>', 'un titre coiffe la rangée');

a.ok(html.indexOf('action-last') === -1, 'aucun bloc résiduel en fin de panneau');

// Illustration fournie : jeton doré + badge « + » (SVG inline, CSP-safe).
a.inc(top, 'viewBox="0 0 64 64"', 'l’illustration jeton fournie sert d’icône');
a.inc(top, 'gcTokGlow', 'dégradé doré du jeton');
a.inc(top, 'gcTokEdge', 'tranche 3D du jeton');
a.inc(top, 'fill="#10B981"', 'badge vert « + » qui signale l’ajout');
a.inc(top, 'fill="none"', 'aucun remplissage parasite hérité du CSS sur le « + »');
a.ok(!/<img\s/i.test(html), 'aucune image externe : la CSP du panneau reste stricte');
const ids = (html.match(/\sid="[^"]+"/g) || []).map((s) => s.slice(4));
a.ok(ids.length > 0 && new Set(ids).size === ids.length, 'aucun identifiant dupliqué dans le panneau');

// Câblage inchangé : même identifiant, même action côté extension.
a.inc(js, "getElementById('btn-token')", 'le bouton reste câblé dans panel.js');
a.inc(js, "action: 'token'", 'il déclenche toujours l’action « token » du compte actif');
const panelTs = fs.readFileSync(
  path.join(ROOT, 'src/features/accounts/panel.ts'), 'utf8'
);
a.inc(panelTs, "if (action === 'token') return changeToken(context);",
  'l’extension traite toujours l’action « token » du panneau');

// Paire « Vérifier les mises à jour » + « Mettre à jour » : un seul conteneur (style : panelLayout).
const pairStart = html.indexOf('<div class="pair">');
const pairEnd = html.indexOf('id="btn-init-local"');
const pair = pairStart > -1 && pairEnd > pairStart ? html.slice(pairStart, pairEnd) : '';

a.ok(pairStart > -1, 'un conteneur parent regroupe les deux actions de mise à jour');
a.inc(pair, 'id="btn-check"', 'le bouton « Vérifier les mises à jour » y est');
a.inc(pair, 'id="btn-pull"', 'le bouton « Mettre à jour » y est aussi');
a.ok(pair.indexOf('id="btn-check"') < pair.indexOf('id="btn-pull"'),
  'Vérifier précède Mettre à jour dans la même rangée');
a.eq((pair.match(/class="pair-item"/g) || []).length, 2,
  'chaque bouton garde son explication juste sous lui');
a.inc(pair, 'git fetch', 'la commande de vérification reste expliquée');
a.inc(pair, 'git pull', 'la commande de mise à jour reste expliquée');
a.inc(pair, 'Récupère les commits distants', 'l’explication du pull est conservée');
a.inc(pair, 'id="pull-badge"', 'le badge « à récupérer » suit le bouton déplacé');
a.inc(pair, 'id="pull-ok"', 'la coche de synchronisation suit aussi le bouton déplacé');
a.ok(html.slice(pairEnd).indexOf('btn-pull') === -1, 'plus de section « Mettre à jour » en bas');
a.ok(html.indexOf('5. Mettre à jour') === -1, 'le bouton n’est plus numéroté comme l’étape 5');
a.inc(statusJs, "getElementById('pull-badge')", 'le badge reste piloté par status.js');

// Icônes : celle fournie pour « Mettre à jour », flèche circulaire pour « Vérifier ».
a.inc(pair, 'M7.646 1.146', 'l’icône fournie équipe le bouton « Mettre à jour »');
a.inc(pair, '<g fill="currentColor">', 'l’icône fournie est reprise telle quelle');
a.inc(pair, 'M8 3a5 5 0 1 0 4.546 2.914', 'le bouton « Vérifier » a son icône de rafraîchissement');

// Câblage inchangé pour les deux actions.
a.inc(js, "getElementById('btn-pull').onclick = () => post('pull')",
  'Mettre à jour déclenche toujours « pull »');
a.inc(js, "getElementById('btn-check').onclick = () => post('checkUpdates')",
  'Vérifier déclenche toujours « checkUpdates »');

a.done('panelHtml');
