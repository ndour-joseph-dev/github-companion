import { Octokit } from '@octokit/rest';

export interface CreateRepoOptions {
  name: string;
  description?: string;
  isPrivate: boolean;
}

/** Profil du compte authentifié (une seule requête GET /user). */
export interface GitHubProfile {
  login: string;
  htmlUrl: string;   // page du profil, ex. https://github.com/octocat
  repoCount: number; // dépôts publics + privés détenus par le compte
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

  /** Profil complet du compte : login, page GitHub et nombre de dépôts. */
  async getProfile(): Promise<GitHubProfile> {
    const { data } = await this.octokit.users.getAuthenticated();
    return {
      login: data.login,
      htmlUrl: data.html_url,
      // total_private_repos n'existe que pour le compte authentifié ;
      // on additionne pour couvrir les dépôts privés ET publics.
      repoCount: data.public_repos + (data.total_private_repos ?? 0)
    };
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
