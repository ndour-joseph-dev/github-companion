import { Octokit } from '@octokit/rest';

export interface CreateRepoOptions {
  name: string;
  description?: string;
  isPrivate: boolean;
}

/** Profil du compte authentifié (GET /user + liste des dépôts détenus). */
export interface GitHubProfile {
  login: string;
  htmlUrl: string;   // page du profil, ex. https://github.com/octocat
  repoCount: number; // dépôts détenus par le compte (publics, privés ET forks)
  /**
   * Noms complets des dépôts détenus (owner/name), pour la liste consultable du
   * panneau. undefined quand le listage a échoué : la valeur sera réessayée plus
   * tard, car elle reste inconnue.
   */
  repos?: string[];
}

/** Rôle du compte authentifié vis-à-vis d'un dépôt donné. */
export type RepoAccessRole = 'owner' | 'admin' | 'collaborator' | 'none' | 'unknown';

export interface RepoAccess {
  role: RepoAccessRole;
  canPush?: boolean; // undefined si l'information n'est pas fournie par l'API
  htmlUrl?: string;
  fullName?: string;
}

/**
 * Délai maximal d'une requête GitHub. Sans borne, un réseau qui ne répond pas
 * laisse le panneau vide indéfiniment (le profil d'un compte est résolu avant
 * l'envoi de l'état) : ici l'appel échoue, l'extension continue.
 */
const REQUEST_TIMEOUT_MS = 10000;

/** Dépôts listés d'un seul appel ; au-delà, le total vient d'un appel dédié. */
const REPO_PAGE_SIZE = 100;

/**
 * Dernière page annoncée par l'en-tête « Link » de l'API GitHub
 * (`<…?page=3>; rel="last"`) ; 0 quand l'en-tête est absent (une seule page).
 * Avec `per_page=1`, ce numéro vaut exactement le nombre d'éléments.
 *
 * Après `(\d+)`, le premier caractère doit être un non-chiffre (`[^0-9>]`).
 * Sans cette borne, `(\d+)` et `[^>]*` pouvaient tous deux consommer des
 * chiffres : sur un en-tête dont la longue suite de chiffres ne mène pas à
 * « >; rel="last" », le moteur ré-essayait chaque découpage possible de cette
 * suite (temps d'exécution super-linéaire, règle SonarQube S8786). La borne ne
 * retire aucun cas : `\d+` étant glouton, le caractère suivant n'est jamais un
 * chiffre. Les paramètres qui suivent `page=` restent lus (`&per_page=100`…).
 */
function lastPageFromLink(link: string | undefined): number {
  const m = /[?&]page=(\d+)(?:[^0-9>][^>]*)?>;\s*rel="last"/.exec(String(link ?? ''));
  return m ? Number(m[1]) : 0;
}

/** Noms complets des dépôts d'une page d'API, sans entrée vide ni doublon. */
function repoNames(
  page: ReadonlyArray<{ full_name?: string | null }>
): string[] {
  const out: string[] = [];
  for (const repo of page ?? []) {
    const name = String(repo?.full_name ?? '').trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export class GitHubService {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token, request: { timeout: REQUEST_TIMEOUT_MS } });
  }

  /** Vérifie que le token est valide et retourne le login associé. */
  async verifyToken(): Promise<string> {
    const { data } = await this.octokit.users.getAuthenticated();
    return data.login;
  }

  /**
   * Profil complet du compte : login, page GitHub, nombre de dépôts et liste
   * des dépôts détenus.
   *
   * Le nombre ne peut PAS venir de « public_repos + total_private_repos » :
   * `public_repos` exclut les dépôts forqués alors que `total_private_repos`
   * les inclut, si bien qu'un fork public disparaissait du total (2 dépôts
   * annoncés pour un profil GitHub qui en affiche 3). On compte donc les
   * dépôts réellement détenus, ce qui donne aussi la liste à afficher.
   *
   * Si le listage échoue (token sans portée « repo », panne réseau), le compte
   * reste utilisable : on retombe sur l'ancien calcul et la liste reste
   * inconnue (repos === undefined), donc réessayée plus tard.
   */
  async getProfile(): Promise<GitHubProfile> {
    const { data } = await this.octokit.users.getAuthenticated();
    const profile: GitHubProfile = {
      login: data.login,
      htmlUrl: data.html_url,
      // total_private_repos n'existe que pour le compte authentifié.
      repoCount: data.public_repos + (data.total_private_repos ?? 0)
    };
    try {
      const page = await this.octokit.repos.listForAuthenticatedUser({
        per_page: REPO_PAGE_SIZE,
        affiliation: 'owner', // les dépôts détenus, forks compris
        sort: 'updated'
      });
      const repos = repoNames(page.data);
      return {
        ...profile,
        repos,
        // Plus d'une page : le total exact demande un appel de 1 dépôt par page,
        // dont la dernière page vaut le nombre total.
        repoCount: lastPageFromLink(page.headers.link) > 1
          ? await this.countOwnedRepos()
          : repos.length
      };
    } catch {
      return profile; // liste des dépôts inconnue : le compte n'est pas cassé
    }
  }

  /**
   * Total exact des dépôts détenus : un seul dépôt par page, si bien que le
   * numéro de la dernière page annoncée par l'API est le nombre total.
   */
  private async countOwnedRepos(): Promise<number> {
    const { data, headers } = await this.octokit.repos.listForAuthenticatedUser({
      per_page: 1,
      affiliation: 'owner'
    });
    return lastPageFromLink(headers.link) || data.length;
  }

  /** Crée un repo sur GitHub et retourne son URL clone (https). */
  async createRepo(options: CreateRepoOptions): Promise<{ cloneUrl: string; htmlUrl: string }> {
    const { data } = await this.octokit.repos.createForAuthenticatedUser({
      name: options.name,
      description: options.description,
      private: options.isPrivate,
      auto_init: false
    });
    return { cloneUrl: data.clone_url, htmlUrl: data.html_url };
  }

  /**
   * Accès du compte authentifié à un dépôt existant : propriétaire du compte
   * (owner), administrateur d'un dépôt d'organisation (admin), collaborateur
   * (avec ou sans droit de pousser), ou aucun accès.
   * Aucune exception ne remonte : « unknown » sert au cas hors ligne.
   */
  async getRepoAccess(owner: string, name: string): Promise<RepoAccess> {
    try {
      const { data } = await this.octokit.repos.get({ owner, repo: name });
      const isLogin = (data.owner?.login ?? '').toLowerCase() === owner.toLowerCase();
      const isOrgAdmin = data.owner?.type === 'Organization' && !!data.permissions?.admin;
      return {
        role: isLogin ? 'owner' : isOrgAdmin ? 'admin' : 'collaborator',
        canPush: data.permissions?.push,
        htmlUrl: data.html_url,
        fullName: data.full_name
      };
    } catch (err: any) {
      return { role: err?.status === 404 ? 'none' : 'unknown' };
    }
  }
}
