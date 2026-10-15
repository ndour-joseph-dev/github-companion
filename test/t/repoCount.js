// Nombre de dépôts d'un compte + liste associée, sans le moindre appel réseau.
// Le total ne peut pas venir de « public_repos + total_private_repos » : l'API
// GitHub exclut les dépôts forqués de public_repos alors que total_private_repos
// les inclut, si bien qu'un fork public disparaissait du compte (2 dépôts
// annoncés pour un profil qui en affiche 3). On compte donc les dépôts
// réellement détenus, ce qui donne aussi la liste consultable du panneau.
const fs = require('fs');
const path = require('path');
const { load, ROOT } = require('../harness/load');
const a = require('../harness/assert');

const { GitHubService } = load('github/githubService.js');

/** Profil du compte authentifié, tel que le renvoie GET /user. */
const OCTO = {
  login: 'octo',
  html_url: 'https://github.com/octo',
  public_repos: 2,       // les forks publics n'y sont pas comptés
  total_private_repos: 0
};

/** Service GitHub branché sur un client simulé (aucun réseau, aucun token réel). */
function service(profile, list) {
  const svc = new GitHubService('ghp_token_de_test');
  svc.octokit = {
    users: { getAuthenticated: async () => ({ data: profile }) },
    repos: { listForAuthenticatedUser: list }
  };
  return svc;
}

/** En-tête « Link » d'une page d'API, tel que GitHub le renvoie. */
const link = (query) =>
  '<https://api.github.com/user/repos?' + query + '>; rel="last"';

(async () => {
  // 1. Trois dépôts détenus, dont UN FORK PUBLIC : l'ancien calcul en annonçait
  // deux, et c'est ce que le panneau affichait au lieu des trois du profil.
  let svc = service(OCTO, async () => ({
    data: [{ full_name: 'octo/a' }, { full_name: 'octo/b' }, { full_name: 'octo/fork' }],
    headers: {}
  }));
  let p = await svc.getProfile();
  a.eq(p.login, 'octo', 'le profil porte le nom du compte');
  a.eq(p.repoCount, 3, 'les trois dépôts détenus sont comptés (fork compris, et non 2)');
  a.eq(p.repos, ['octo/a', 'octo/b', 'octo/fork'], 'la liste des dépôts accompagne le profil');

  // 2. Liste nettoyée : ni doublon, ni entrée sans nom.
  svc = service(OCTO, async () => ({
    data: [{ full_name: 'octo/a' }, { full_name: 'octo/a' }, { full_name: '' }, {}],
    headers: {}
  }));
  p = await svc.getProfile();
  a.eq(p.repos, ['octo/a'], 'les dépôts en double ou sans nom sont écartés');
  a.eq(p.repoCount, 1, 'seuls les dépôts réellement listés sont comptés');

  // 3. En-tête « Link » sans « rel=last » (une seule page) : le total est le
  // nombre de dépôts reçus, et aucun second appel n'est nécessaire.
  let calls = 0;
  svc = service(OCTO, async () => {
    calls++;
    return {
      data: [{ full_name: 'octo/a' }, { full_name: 'octo/b' }],
      headers: { link: '<https://api.github.com/user/repos?per_page=100&page=1>; rel="first"' }
    };
  });
  p = await svc.getProfile();
  a.eq(p.repoCount, 2, 'sans page suivante, le total est le nombre de dépôts reçus');
  a.eq(calls, 1, 'un seul appel suffit quand tous les dépôts tiennent sur une page');

  // 4. Plus d'une page : le total exact est repris de l'API, un dépôt par page,
  // dont la dernière page vaut le nombre total.
  calls = 0;
  svc = service(OCTO, async (opts) => {
    calls++;
    if (opts.per_page === 1) {
      return { data: [{ full_name: 'octo/r0' }], headers: { link: link('per_page=1&page=250') } };
    }
    return {
      data: Array.from({ length: 100 }, (_, i) => ({ full_name: 'octo/r' + i })),
      headers: { link: link('per_page=100&page=2') }
    };
  });
  p = await svc.getProfile();
  a.eq(p.repoCount, 250, 'au-delà d’une page, le total exact remonte de l’API');
  a.eq(calls, 2, 'deux appels suffisent : la liste, puis le total');
  a.eq(p.repos.length, 100, 'la liste reste bornée à une page (le panneau reste léger)');

  // 5. Repli : si le listage échoue (token sans portée « repo », panne réseau),
  // le compte reste utilisable et la liste reste INCONNUE (donc réessayée plus
  // tard) au lieu de passer pour un compte sans dépôt.
  svc = service(OCTO, async () => {
    throw new Error('403');
  });
  p = await svc.getProfile();
  a.eq(p.repoCount, 2, 'si la liste échoue, le compte reste utilisable (ancien total)');
  a.eq(p.repos, undefined, 'une liste inconnue n’est jamais remplacée par une liste vide');

  // 6. En-tête « Link » dont la longue suite de chiffres ne mène PAS à
  // « >; rel="last" » : les chiffres déjà lus ne doivent jamais être ré-essayés
  // un par un (règle SonarQube S8786), sinon la lecture devient quadratique et
  // un en-tête long fige le panneau. Ici : repli immédiat sur la page reçue.
  svc = service(OCTO, async () => ({
    data: [{ full_name: 'octo/a' }],
    headers: {
      link: '<https://api.github.com/user/repos?page=' + '9'.repeat(40000) + '; rel="last"'
    }
  }));
  const debut = Date.now();
  p = await svc.getProfile();
  const duree = Date.now() - debut;
  a.eq(p.repoCount, 1, 'un en-tête mal formé retombe sur le nombre de dépôts reçus');
  a.ok(duree < 500, 'la lecture reste immédiate sur 40 000 chiffres (aucun retour arrière)');

  // 7. Cohérence avec le code de production (pas seulement les helpers testés).
  const src = fs.readFileSync(path.join(ROOT, 'src/github/githubService.ts'), 'utf8');
  a.inc(src, "affiliation: 'owner'", 'le comptage porte sur les dépôts réellement détenus');
  a.inc(src, 'rel="last"', 'le total s’appuie sur l’en-tête « Link » de l’API');
  a.inc(src, 'REPO_PAGE_SIZE', 'la liste des dépôts est bornée à une page');

  a.done('repoCount');
})().catch((error) => {
  console.error('✗ exception hors assertions :', error);
  process.exit(1);
});

