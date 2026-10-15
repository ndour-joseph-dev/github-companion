// Verdict d'état distant (« Vérifier les mises à jour ») : il ne doit JAMAIS
// ressortir pour un autre dépôt que celui interrogé, ni après un commit local,
// ni quand il est trop vieux.
//
// Cas réel (dépôt GitHub supprimé, puis dépôt neuf et VIDE relié au même
// dossier) : l'ancien verdict « à jour » faisait afficher derrière le dossier
// des commits distants d'un dépôt qui n'existait plus, et le push répondait
// « Rien à pousser : ton dépôt est déjà synchronisé avec le cloud » alors que
// le nouveau dépôt était vide.
const fs = require('fs');
const path = require('path');
const { load, ROOT } = require('../harness/load');
const a = require('../harness/assert');

const store = load('features/checkUpdates/store.js');

const DOC = 'https://github.com/alice/dalton.git';
const AUTRE = 'https://github.com/alice/autre-depot.git';

/** Verdict tel que fetchAndCompare le produit. */
function verdict(head, at) {
  return {
    behind: 3,
    ahead: 0,
    commits: [],
    hasTracking: true,
    upstream: 'origin/main',
    checkedAt: at || Date.now(),
    head
  };
}

// 1. Même dépôt, même commit : le verdict ressort (aucun fetch inutile).
store.rememberRemoteCheck(verdict('aaa'), DOC);
a.eq((store.getRemoteCheck({ remoteUrl: DOC, head: 'aaa' }) || {}).head, 'aaa',
  'le verdict ressort pour le dépôt ET le commit interrogés');

// 2. Un autre dépôt : le verdict ne décrit plus rien de valable.
a.eq(store.getRemoteCheck({ remoteUrl: AUTRE, head: 'aaa' }), null,
  'un verdict d’un autre dépôt n’est jamais réutilisé');

// 3. HEAD déplacé depuis la vérification (commit local) : à revérifier.
a.eq(store.getRemoteCheck({ remoteUrl: DOC, head: 'bbb' }), null,
  'un verdict antérieur à un commit local est ignoré');

// 4. Trop vieux : plus présenté comme un fait (le TTL annoncé est de 10 min).
store.rememberRemoteCheck(verdict('aaa', Date.now() - 60 * 60 * 1000), DOC);
a.eq(store.getRemoteCheck({ remoteUrl: DOC, head: 'aaa' }), null,
  'un verdict vieux d’une heure est ignoré');
store.rememberRemoteCheck(verdict('aaa'), DOC);
a.ok(store.getRemoteCheck({ remoteUrl: DOC, head: 'aaa' }) !== null,
  'un verdict de la seconde reste utilisable');
const storeSrc = fs.readFileSync(path.join(ROOT, 'src/features/checkUpdates/store.ts'), 'utf8');
a.inc(storeSrc, 'REMOTE_TTL_MS = 10 * 60 * 1000',
  'le TTL annoncé (10 minutes) est bien celui appliqué par le cache');

// 5. Verdict frais sans SHA (enregistré par une version antérieure) : son
// absence ne doit pas tout jeter — mieux vaut un verdict daté que rien.
store.rememberRemoteCheck(verdict(undefined), DOC);
a.ok(store.getRemoteCheck({ remoteUrl: DOC, head: 'aaa' }) !== null,
  'un verdict sans SHA reste utilisable (aucun faux négatif)');

// 6. Oubli explicite : changement de remote, push, pull.
store.clearRemoteCheck();
a.eq(store.getRemoteCheck({ remoteUrl: DOC, head: 'aaa' }), null,
  'clearRemoteCheck() vide le verdict mémorisé');

// 7. « Rien à pousser » exige une PREUVE : le cloud doit porter exactement le
// commit local. Branche absente du cloud (dépôt neuf) ou réseau injoignable :
// pas de preuve, donc le push est tenté et git tranche.
const pushSrc = fs.readFileSync(path.join(ROOT, 'src/features/push/index.ts'), 'utf8');
a.inc(pushSrc, 'const distant = await remoteHead(git.raw(), token, branch)',
  'le push demande au cloud le SHA réel de la branche');
a.inc(pushSrc, 'if (before && distant && before === distant)',
  '« rien à pousser » exige les DEUX SHA, identiques (preuve positive)');

// 8. Câblage : le périmètre (dépôt + HEAD) est transmis, et la décision de
// pousser ne repose plus sur une référence locale.
const statusSrc = fs.readFileSync(path.join(ROOT, 'src/git/gitStatus.ts'), 'utf8');
a.inc(statusSrc, 'getLastRemoteCheck({ remoteUrl: originUrl, head: lastCommitHash })',
  'l’état du panneau ne reprend le verdict que pour le dépôt et le commit affichés');
a.inc(pushSrc, 'getLastRemoteCheck({ remoteUrl, head: before })',
  'le push ne reprend le verdict que pour ce dépôt et ce commit');
a.ok(!/remote\.ahead === 0/.test(pushSrc),
  'la décision de pousser ne se fonde plus sur le verdict mémorisé');
const createSrc = fs.readFileSync(path.join(ROOT, 'src/features/createRepo/index.ts'), 'utf8');
a.inc(createSrc, 'clearLastRemoteCheck()', 'lier un nouveau dépôt oublie l’ancien verdict');

// 9. Le HEAD local est mémorisé avec le verdict : sans lui, aucun commit local
// ne pourrait invalider la comparaison ahead/behind affichée.
const fetchSrc = fs.readFileSync(path.join(ROOT, 'src/git/remoteCheck.ts'), 'utf8');
a.inc(fetchSrc, 'const head = await localHead(git)',
  'la vérification distante mémorise le HEAD local');
a.inc(fetchSrc, 'checkedAt: Date.now(),\n    head',
  'le HEAD fait partie du résultat transmis au panneau');

a.done('remoteCache');
