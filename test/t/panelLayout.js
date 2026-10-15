const fs = require('fs');
const path = require('path');
const { ROOT } = require('../harness/load');
const a = require('../harness/assert');

const media = path.join(ROOT, 'media');
const read = (f) => fs.readFileSync(path.join(media, f), 'utf8');
// Commentaires retirés : un commentaire ne doit compter ni comme règle ni comme
// sélecteur (les explications citent parfois :last-child, width: 100%, etc.).
const sheet = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const panelCss = sheet(read('panel.css'));
const accountsCss = sheet(read('accounts.css'));

// Bloc de règles d'un sélecteur seul. Ancré en début de ligne : « button » ne
// doit pas renvoyer « .pair-item button » ni « .accounts-actions button ».
const rule = (css, sel) => {
  const i = css.indexOf('\n' + sel + ' {');
  return i === -1 ? '' : css.slice(i, css.indexOf('}', i));
};

// Groupe « gestion des comptes » : rangée flex, boutons à la largeur du libellé.
const row = rule(accountsCss, '.accounts-actions');
a.inc(row, 'display: flex', 'la gestion des comptes reste une rangée');
a.inc(row, 'flex-wrap: wrap', 'la rangée passe à la ligne si le panneau est étroit');
a.inc(row, 'justify-content: space-between', 'la rangée répartit les trois boutons');
a.inc(rule(accountsCss, '.accounts-actions button'), 'width: fit-content',
  'chaque bouton de compte se limite à son libellé (w-fit)');
a.inc(rule(accountsCss, '#btn-token svg'), 'width: 16px',
  'l’icône du jeton est dimensionnée pour la barre compacte');

// Sélecteur de compte maison : le menu est positionné DANS le panneau (z-index
// local) au lieu d'être une fenêtre système que le webview ne peut pas placer.
const dropdownToggle = rule(accountsCss, '.dropdown-toggle');
a.inc(dropdownToggle, 'width: 100%', 'le sélecteur garde la largeur pleine du panneau');
a.inc(dropdownToggle, 'display: flex', 'le libellé et le chevron sont alignés');
a.inc(rule(accountsCss, '.dropdown'), 'position: relative',
  'le menu se place par rapport au bouton');
const dropdownMenu = rule(accountsCss, '.dropdown-menu');
a.inc(dropdownMenu, 'position: absolute', 'le menu s’ancre sous le bouton (pas de popup système)');
a.inc(dropdownMenu, 'z-index: 30', 'le menu passe au-dessus du reste du panneau');
a.inc(rule(accountsCss, '.dropdown-menu[hidden]'), 'display: none',
  'le menu replié est réellement masqué malgré son display: block');
a.ok(accountsCss.indexOf('.accounts select') === -1,
  'l’ancien style du <select> natif est retiré');

// Mises à jour : empilées, « Vérifier les mises à jour » au-dessus de « Mettre à jour ».
const pair = rule(panelCss, '.pair');
a.inc(pair, 'display: flex', 'la paire de mises à jour est un conteneur flex');
a.inc(pair, 'flex-direction: column', 'Vérifier reste au-dessus de Mettre à jour');
a.inc(pair, 'gap: 8px', 'les deux actions restent espacées quand elles s’empilent');
a.ok(pair.indexOf('grid') === -1, 'plus aucune grille ne force deux colonnes');
a.inc(rule(panelCss, '.pair-item'), 'align-items: flex-start',
  'chaque action (bouton + explication) se cale à gauche');

// Zone d'état : chaque information est son propre <div> et porte son espacement
// vertical (4 px en haut, 4 px en bas) — les lignes ne se collent plus, sans
// dépendre du gap du conteneur.
const stateRow = rule(panelCss, '.status-row');
a.inc(stateRow, 'display: flex', 'une ligne d’état aligne son libellé et sa valeur');
a.inc(stateRow, 'padding-block: 4px', 'chaque information respire : 4 px en haut et en bas');
a.inc(rule(panelCss, '.commit-block'), 'padding-block: 4px',
  'la liste des commits distants suit le même rythme vertical');
a.eq(rule(panelCss, '.commit-list').includes('margin: 2px 0 4px 96px'), false,
  'la liste des commits ne porte plus son propre espacement vertical (le <div> le fait)');

// Aucun bouton étiré : largeur = libellé + icône, pour la paire comme pour les étapes 1 à 4.
a.inc(rule(panelCss, 'button'), 'width: fit-content', 'le bouton ne prend que la longueur de son texte');
a.ok(!/width:\s*100%/.test(rule(panelCss, 'button')), 'l’ancienne largeur pleine des boutons est retirée');
a.eq((panelCss.match(/width:\s*100%/g) || []).length, 2,
  'seuls le message de commit et le titre de groupe prennent la largeur du panneau');
a.eq((accountsCss.match(/width:\s*100%/g) || []).length, 1,
  'seul le sélecteur de compte garde la largeur pleine');

// Titre de groupe : il coiffe sa propre ligne en rangée flex, ligne comme colonne.
a.inc(rule(panelCss, '.group-title'), 'width: 100%', 'le titre occupe sa propre ligne');
a.ok(panelCss.indexOf('flex: 1 0 100%') === -1,
  'l’ancien flex-basis 100% (hauteur pleine en colonne) est retiré');

// Filet de fin : les <script> qui ferment le <body> faussent :last-child et
// :last-of-type, donc la dernière section se cible avec :has(+ .action).
a.inc(rule(panelCss, '.action:not(:has(+ .action))'), 'border-bottom: none',
  'la dernière section ferme le filet');
a.ok(panelCss.indexOf(':last-child') === -1 && panelCss.indexOf(':last-of-type') === -1,
  'aucune pseudo-classe de position peu fiable (:last-child / :last-of-type) n’est utilisée');
a.ok(panelCss.indexOf('action-last') === -1, 'l’ancienne classe de fin de panneau est retirée');

a.done('panelLayout');
