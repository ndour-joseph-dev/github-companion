// Fraîcheur de la liste des dépôts du compte. C'est une PHOTO de GitHub,
// conservée dans le coffre : trois dépôts supprimés sur GitHub restaient
// affichés après fermeture puis réouverture de l'éditeur, indéfiniment, et le
// bouton « Vérifier les mises à jour » (git fetch) n'y changeait rien — il ne
// parle pas à GitHub. Ces tests verrouillent la photo datée, sa péremption, le
// rafraîchissement forcé et le fait qu'une panne réseau ne peut JAMAIS effacer
// une liste déjà connue.
const path = require('path');
const fs = require('fs');
const { load, vscode, ROOT, OUT } = require('../harness/load');
const a = require('../harness/assert');

// L'ordre compte : store.js est chargé en premier, puis plus jamais, afin que
// core/profile/refresh partagent bien CETTE instance (dont resolveProfile est
// remplacé par un faux — aucun réseau dans cette suite).
const store = load('features/accounts/store.js');
const core = load('features/accounts/core.js');
const profile = load('features/accounts/profile.js');
const refresh = load('features/accounts/refresh.js');
const repoMatch = require(path.join(OUT, 'features/accounts/repoMatch.js'));

const TOKEN = 'ghp_' + 'D'.repeat(36);
const ACCOUNTS = 'githubCompanion.accounts';
const MIN = 60 * 1000;

/** Coffre-fort simulé, clé par clé, comme VS Code (lecture ET écriture). */
function vault(accounts) {
  const mem = {};
  if (accounts) mem[ACCOUNTS] = JSON.stringify(accounts);
  return {
    subscriptions: [],
    secrets: {
      get: async (k) => mem[k],
      store: async (k, v) => {
        mem[k] = v;
      },
      delete: async (k) => {
        delete mem[k];
      }
    },
    globalState: { get: () => undefined, update: async () => {} },
    workspaceState: { get: () => undefined, update: async () => {} }
  };
}

/** Compte dont la photo compte `n` dépôts, prise il y a `age` millisecondes. */
function account(id, n, age) {
  return {
    id,
    login: id,
    htmlUrl: 'https://github.com/' + id,
    repoCount: n,
    repos: Array.from({ length: n }, (_, i) => id + '/r' + i),
    reposUpdatedAt: age === undefined ? undefined : Date.now() - age,
    token: TOKEN
  };
}

let calls = 0;
const realResolve = store.resolveProfile;
/** Faux GitHub : compte les appels et renvoie le profil demandé. */
function github(profileOf) {
  calls = 0;
  store.resolveProfile = async () => {
    calls++;
    return typeof profileOf === 'function' ? profileOf() : profileOf;
  };
}
/** Profil renvoyé par GitHub pour un compte : n dépôts, liste comprise. */
const profileWith = (id, n) => ({
  login: id,
  htmlUrl: 'https://github.com/' + id,
  repoCount: n,
  repos: Array.from({ length: n }, (_, i) => id + '/r' + i)
});
/** Comptes enregistrés dans un coffre (tels qu'ils y sont stockés). */
const stored = async (ctx) => store.readAccounts(ctx);

(async () => {
  try {
    // 1. Quand une photo doit-elle être reprise ? Jamais devinée : datée.
    const now = Date.now();
    a.eq(refresh.needsRefresh(account('a', 3, 1 * MIN), now), false,
      'une photo prise il y a une minute est encore crue');
    a.eq(refresh.needsRefresh(account('a', 3, 6 * MIN), now), true,
      'une photo de plus de cinq minutes est périmée');
    a.eq(refresh.needsRefresh(account('a', 3, undefined), now), true,
      'une photo sans date (version antérieure) est vérifiée une fois');
    a.eq(refresh.needsRefresh({ id: 'a', login: '', token: TOKEN }, now), true,
      'un compte jamais résolu est toujours à interroger');

    // 2. Photo fraîche : aucun appel réseau (le panneau peut se reconstruire
    // sans que GitHub le sache).
    let ctx = vault([account('alice', 3, 1 * MIN)]);
    github(profileWith('alice', 3));
    await profile.ensureProfiles(ctx);
    a.eq(calls, 0, 'une photo fraîche n’entraîne aucune requête');

    // 3. LE BUG : photo périmée + dépôts supprimés sur GitHub. L'extension
    // repose la question et la liste tombe à zéro (au lieu de rester à trois).
    ctx = vault([account('alice', 3, 6 * MIN)]);
    github(profileWith('alice', 0));
    await profile.ensureProfiles(ctx);
    let saved = await stored(ctx);
    a.eq(calls, 1, 'une photo périmée déclenche une requête');
    a.eq(saved[0].repos, [], 'les dépôts supprimés sur GitHub disparaissent de la photo');
    a.eq(saved[0].repoCount, 0, 'le compteur de dépôts suit la nouvelle photo');
    a.ok((saved[0].reposUpdatedAt || 0) > now - 1000,
      'la nouvelle photo porte sa date (elle ne sera pas réinterrogée aussitôt)');

    // 4. Juste après, la photo est fraîche : plus aucun appel (anti-martèlement),
    // même sur un panneau reconstruit ou réaffiché plusieurs fois d'affilée.
    await profile.ensureProfiles(ctx);
    a.eq(calls, 1, 'aucune requête tant que la photo n’est pas périmée');

    // 5. Panne réseau : la liste connue est CONSERVÉE (jamais effacée, jamais
    // datée d'aujourd'hui) et le compte n'est pas réinterrogé dans la foulée.
    ctx = vault([account('bob', 3, 6 * MIN)]);
    github(undefined);
    await profile.ensureProfiles(ctx);
    a.eq(calls, 1, 'un compte périmé est interrogé une fois');
    await profile.ensureProfiles(ctx);
    a.eq(calls, 1, 'un échec n’est pas réessayé immédiatement (réseau, quota)');
    saved = await stored(ctx);
    a.eq(saved[0].repos.length, 3, 'une panne réseau ne fait pas disparaître la liste connue');
    a.eq(saved[0].repoCount, 3, 'et ne remplace pas le total exact par un total approximatif');

    // 6. Le bouton « Rafraîchir » FORCE la question, même si la photo est
    // fraîche : c'est un clic explicite, aucun anti-martèlement ne le bloque.
    ctx = vault([account('carol', 2, 1 * MIN)]);
    github(profileWith('carol', 5));
    let outcome = await refresh.refreshProfiles(ctx);
    a.eq(calls, 1, 'un rafraîchissement demandé interroge GitHub malgré une photo fraîche');
    a.eq(outcome.refreshed, 1, 'le compte est annoncé à jour');
    outcome = await refresh.refreshProfiles(ctx);
    a.eq(calls, 2, 'deux clics de suite interrogent bien deux fois (aucun blocage)');
    saved = await stored(ctx);
    a.eq(saved[0].repos.length, 5, 'la liste repart de GitHub');
    a.eq(saved[0].repoCount, 5, 'le total repart de la liste obtenue');

    // 7. Rafraîchissement ciblé : seul le compte visé est interrogé.
    ctx = vault([account('dave', 1, 5 * MIN), account('erin', 1, 5 * MIN)]);
    github(profileWith('dave', 2));
    outcome = await refresh.refreshProfiles(ctx, ['dave']);
    a.eq(calls, 1, 'un identifiant ciblé n’interroge que ce compte');
    a.eq(outcome.refreshed, 1, 'le compte ciblé est compté');
    saved = await stored(ctx);
    a.eq(saved.find((x) => x.id === 'dave').repos.length, 2, 'le compte visé est mis à jour');
    a.eq(saved.find((x) => x.id === 'erin').repos.length, 1, 'l’autre compte reste intact');

    // 8. Action « Rafraîchir » : sans compte, elle le dit et n'appelle rien.
    vscode.__reset();
    github(profileWith('franck', 1));
    await refresh.runRefresh(vault());
    a.eq(calls, 0, 'sans compte enregistré, aucune requête n’est lancée');
    a.inc(vscode.__state.messages.at(-1).text, 'Aucun compte GitHub enregistré',
      'l’absence de compte est expliquée à l’utilisateur');

    // 9. Action « Rafraîchir » : succès annoncé, et le verdict d'accès au dépôt
    // du dossier ouvert est oublié (le dépôt a pu être supprimé sur GitHub).
    vscode.__reset();
    const realForget = repoMatch.forgetRepoAccess;
    let forgotten = 0;
    repoMatch.forgetRepoAccess = () => {
      forgotten++;
    };
    ctx = vault([account('gina', 3, 5 * MIN)]);
    github(profileWith('gina', 0));
    await refresh.runRefresh(ctx);
    repoMatch.forgetRepoAccess = realForget;
    a.eq(calls, 1, 'l’action interroge GitHub');
    a.eq(forgotten, 1, 'le verdict d’accès au dépôt cloud est oublié à la demande');
    a.ok(vscode.__state.messages.some((m) => m.level === 'info' && m.text.indexOf('Dépôts à jour') > -1),
      'le rafraîchissement est annoncé comme réussi');
    a.inc(vscode.__state.messages.at(-1).text, '0 dépôt(s)',
      'le message donne le nombre de dépôts réellement obtenu');
    a.eq((await stored(ctx))[0].repos, [], 'les dépôts supprimés sont bien effacés de l’état');

    // 10. Panne totale annoncée comme telle : jamais « à jour » sans réponse.
    vscode.__reset();
    github(undefined);
    await refresh.runRefresh(vault([account('hugo', 2, 5 * MIN)]));
    const derniere = vscode.__state.messages.at(-1);
    a.eq(derniere.level, 'warning', 'une panne de GitHub est un avertissement, pas un succès');
    a.inc(derniere.text, "GitHub n'a pas répondu",
      'l’utilisateur sait que la liste affichée est la dernière connue');
    a.ok(vscode.__state.messages.every((m) => m.level !== 'info'),
      'aucun message de succès ne ment quand GitHub n’a pas répondu');

    // 11. Cohérence avec le code de production (pas seulement les helpers testés).
    const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
    a.inc(read('src/features/accounts/refresh.ts'), 'reposUpdatedAt',
      'la photo enregistrée porte sa date');
    a.inc(read('src/features/accounts/refresh.ts'), 'REPOS_TTL_MS',
      'la péremption d’une photo est une constante explicite');
    a.inc(read('src/features/accounts/store.ts'), 'reposUpdatedAt',
      'la date de la photo est conservée avec le compte (elle survit à la fermeture)');
    a.inc(read('src/features/panel/messages.ts'), "case 'refresh'",
      'le bouton du panneau a son message côté extension');
    a.inc(read('media/panel.html'), 'id="btn-refresh"', 'le bouton existe dans le panneau');
    a.inc(read('media/accounts.js'), "getElementById('btn-refresh')", 'le bouton est câblé');
    a.inc(read('package.json'), 'githubCompanion.refresh',
      'l’action est aussi disponible dans la palette');
    a.inc(read('src/extension.ts'), "'githubCompanion.refresh'",
      'la commande de palette est enregistrée par l’extension');
    // La règle d’avant (une seule résolution PAR SESSION) est bien remplacée :
    // c'est elle qui figeait la liste jusqu'à la fermeture de l'éditeur.
    a.ok(read('src/features/accounts/profile.ts').indexOf('new Set<string>()') === -1,
      'plus de « une seule résolution par session » : la photo est datée, pas figée');

    a.done('accountsRefresh');
  } finally {
    store.resolveProfile = realResolve;
  }
})().catch((error) => {
  console.error('✗ exception hors assertions :', error);
  process.exit(1);
});
