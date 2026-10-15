// Comptes enregistrés : lecture, compte actif, token utilisé, ajout / remplacement
// / retrait. Aucun service externe : le coffre-fort est simulé clé par clé (comme
// VS Code) et le profil GitHub est remplacé par un faux — la suite reste locale.
const { load } = require('../harness/load');
const a = require('../harness/assert');

const store = load('features/accounts/store.js');
const core = load('features/accounts/core.js');

/** Faux tokens (40 caractères) : jamais écrits ailleurs qu'en mémoire. */
const ALICE_TOKEN = 'ghp_' + 'B'.repeat(36);
const BOB_TOKEN = 'ghp_' + 'C'.repeat(36);

const ACCOUNTS = 'githubCompanion.accounts';
const ACTIVE = 'githubCompanion.activeAccount';

/** Coffre-fort simulé : get/store/delete cohérents, par clé. */
function vault(initial) {
  const mem = { ...initial };
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

/** Compte enregistré, tel qu'il est stocké (avec son token). */
const alice = {
  id: 'alice',
  login: 'alice',
  htmlUrl: 'https://github.com/alice',
  repoCount: 2,
  repos: ['alice/a', 'alice/b'],
  token: ALICE_TOKEN
};
const bob = { id: 'bob', login: 'bob', token: BOB_TOKEN };

(async () => {
  // 1. Coffre vide : aucun compte, aucune exception.
  let ctx = vault();
  a.eq(await core.listAccounts(ctx), [], 'un coffre vide ne donne aucun compte');
  a.eq(await core.getActiveAccount(ctx), undefined, 'sans compte, aucun compte actif');
  a.eq(await core.getActiveToken(ctx), undefined, 'sans compte, aucun token à utiliser');

  // 2. Compte enregistré : relu, et actif à défaut de choix explicite.
  ctx = vault({ [ACCOUNTS]: JSON.stringify([alice]) });
  a.eq((await core.listAccounts(ctx)).length, 1, 'le compte enregistré est relu du coffre');
  a.eq((await core.getActiveAccount(ctx)).id, 'alice',
    'sans choix explicite, le premier compte est actif');
  a.eq(await core.getActiveToken(ctx), ALICE_TOKEN, 'le token du compte actif est celui utilisé');

  // 3. Compte actif explicite, y compris s'il n'est pas le premier de la liste.
  ctx = vault({ [ACCOUNTS]: JSON.stringify([alice, bob]), [ACTIVE]: 'bob' });
  a.eq((await core.getActiveAccount(ctx)).login, 'bob', 'le compte choisi est celui utilisé');
  a.eq(await core.getActiveToken(ctx), BOB_TOKEN, 'le token suit le compte choisi');
  ctx = vault({ [ACCOUNTS]: JSON.stringify([alice, bob]), [ACTIVE]: 'inconnu' });
  a.eq((await core.getActiveAccount(ctx)).id, 'alice',
    'un identifiant périmé retombe sur le premier compte');

  // 4. Token déjà enregistré : retrouvé tel quel (donc sans profil à récupérer,
  // aucun réseau), il devient actif — jamais un second compte identique.
  ctx = vault({ [ACCOUNTS]: JSON.stringify([alice, bob]), [ACTIVE]: 'bob' });
  const again = await core.saveToken(ctx, '  ' + ALICE_TOKEN + '  ');
  a.eq(again.id, 'alice', 'un token connu retrouve son compte (espaces compris)');
  a.eq(await store.getActiveId(ctx), 'alice', 'le compte retrouvé devient actif');
  a.eq((await store.readAccounts(ctx)).length, 2, 'aucun doublon de compte n’est créé');

  // 5. Nouveau token : le profil résolu est enregistré avec la liste des dépôts.
  ctx = vault();
  const real = store.resolveProfile;
  store.resolveProfile = async () => ({
    login: 'carol',
    htmlUrl: 'https://github.com/carol',
    repoCount: 3,
    repos: ['carol/one', 'carol/two', 'carol/fork']
  });
  try {
    const carol = await core.saveToken(ctx, 'ghp_nouveau');
    a.eq(carol.login, 'carol', 'le nom du compte vient du profil résolu');
    a.eq(carol.repoCount, 3, 'le nombre de dépôts est enregistré avec le compte');
    a.eq(carol.repos, ['carol/one', 'carol/two', 'carol/fork'],
      'la liste des dépôts est enregistrée avec le compte');
    a.eq(await store.getActiveId(ctx), 'carol', 'le nouveau compte devient actif');
    const stored = await store.readAccounts(ctx);
    a.eq(stored.length, 1, 'le nouveau compte est bien écrit dans le coffre');
    a.eq(stored[0].repos.length, 3, 'les dépôts survivent à l’aller-retour dans le coffre');

    // 6. Remplacement du token : profil et liste des dépôts sont rafraîchis.
    store.resolveProfile = async () => ({
      login: 'carol2',
      htmlUrl: 'https://github.com/carol2',
      repoCount: 1,
      repos: ['carol2/one']
    });
    const updated = await core.replaceToken(ctx, 'carol', 'ghp_remplace');
    a.eq(updated.id, 'carol2', 'le compte suit le profil du nouveau token');
    a.eq(updated.repos, ['carol2/one'], 'la liste des dépôts est rafraîchie avec le token');
    a.eq(await store.getActiveId(ctx), 'carol2', 'le compte renommé reste le compte actif');
  } finally {
    store.resolveProfile = real; // restauré : les autres suites restent intactes
  }

  // 7. Remplacement sur un coffre vide : rien à remplacer, rien de créé.
  ctx = vault();
  a.eq(await core.replaceToken(ctx, 'personne', 'ghp_x'), undefined,
    'sans compte enregistré, aucun remplacement n’a lieu');

  // 8. Retrait : le compte disparaît, l'actif bascule sur le suivant.
  ctx = vault({ [ACCOUNTS]: JSON.stringify([alice, bob]), [ACTIVE]: 'alice' });
  await core.removeAccount(ctx, 'alice');
  const left = await store.readAccounts(ctx);
  a.eq(left.length, 1, 'le compte retiré disparaît de la liste');
  a.eq(left[0].id, 'bob', 'le compte restant est le seul enregistré');
  a.eq(await store.getActiveId(ctx), 'bob', 'le compte restant prend le relais');
  await core.removeAccount(ctx, 'bob');
  a.eq(await store.readAccounts(ctx), [], 'retirer le dernier compte vide la liste');
  a.eq(await store.getActiveId(ctx), undefined, 'sans compte, aucun actif ne subsiste');
  a.eq(await core.getActiveToken(ctx), undefined, 'sans compte, plus aucun token à utiliser');

  a.done('accountsStore');
})().catch((error) => {
  console.error('✗ exception hors assertions :', error);
  process.exit(1);
});
