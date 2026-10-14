import simpleGit, { SimpleGit } from 'simple-git';
import { pushWithAuth, pullWithAuth } from './gitAuth';
import { gitEnv } from './gitEnv';

/**
 * Enveloppe toutes les opérations Git locales.
 * Chaque méthode correspond à UNE action utilisateur (un clic)
 * mais peut regrouper plusieurs commandes git en interne.
 *
 * Aucune méthode ici n'est appelée automatiquement (pas de watcher,
 * pas de listener sur la sauvegarde) : tout part d'un clic explicite
 * déclenché depuis extension.ts.
 */
export class GitService {
  private git: SimpleGit;

  constructor(private workspaceRoot: string) {
    // Environnement nettoyé : jamais de helper externe, jamais de fenêtre de
    // mot de passe, et simple-git accepte les opérations distantes.
    this.git = simpleGit(workspaceRoot).env(gitEnv());
  }

  async isRepo(): Promise<boolean> {
    try {
      return await this.git.checkIsRepo();
    } catch {
      // En cas de doute, on considère que ce n'est pas un repo :
      // ensureRepo() ci-dessous se chargera de l'initialiser sans risque.
      return false;
    }
  }

  /**
   * Garantit qu'un repo Git existe à cet emplacement, quel que soit l'état
   * de départ. `git init` est idempotent : l'appeler sur un repo existant
   * ne fait rien de destructeur, donc on ne se fie plus uniquement à
   * isRepo() (qui peut donner un faux résultat) avant d'agir.
   */
  async ensureRepo(defaultBranch: string): Promise<void> {
    try {
      await this.git.init(['-b', defaultBranch]);
    } catch {
      // Anciennes versions de git : pas de flag -b sur "init".
      await this.git.init();
      await this.git.raw(['symbolic-ref', 'HEAD', `refs/heads/${defaultBranch}`]).catch(() => {});
    }

    const ok = await this.isRepo();
    if (!ok) {
      throw new Error(
        `Impossible d'initialiser un dépôt Git dans "${this.workspaceRoot}". Vérifie que git est installé et accessible dans le PATH.`
      );
    }
  }

  async addRemote(name: string, url: string): Promise<void> {
    const remotes = await this.git.getRemotes(true);
    if (remotes.some(r => r.name === name)) {
      await this.git.remote(['set-url', name, url]);
    } else {
      await this.git.addRemote(name, url);
    }
  }

  /** git add . + git commit -m "message" */
  async commitAll(
    message: string
  ): Promise<{ committed: boolean; summary?: string; files?: string[] }> {
    const status = await this.git.status();
    if (status.files.length === 0) {
      return { committed: false };
    }
    const files = status.files.map((f) => f.path);
    await this.git.add('.');
    const result = await this.git.commit(message);
    const count = result.summary.changes ?? files.length;
    const preview =
      files.length <= 3
        ? files.join(', ')
        : `${files.slice(0, 3).join(', ')}… (+${files.length - 3})`;
    return {
      committed: true,
      summary: `${count} fichier(s) : ${preview}`,
      files
    };
  }

  async pushWithToken(token: string, branch: string): Promise<void> {
    await pushWithAuth(this.git, token, branch);
  }

  async pullWithToken(token: string, branch: string): Promise<void> {
    await pullWithAuth(this.git, token, branch);
  }

  raw(): SimpleGit {
    return this.git;
  }
}
