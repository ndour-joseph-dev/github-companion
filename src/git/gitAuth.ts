import { SimpleGit } from 'simple-git';
import { gitEnv } from './gitEnv';

/** En-tête d'authentification GitHub (le token n'y apparaît jamais en clair). */
function authHeader(token: string): string {
  return `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
}

// L'environnement des commandes vient de gitEnv() : il est nettoyé des
// variables capables de faire exécuter un programme externe ou d'ouvrir une
// fenêtre de mot de passe, et pose GIT_TERMINAL_PROMPT=0.

// git >= 2.31 sait lire une valeur de configuration dans une variable
// d'environnement (« --config-env=clé=VARIABLE »).
let configEnv: boolean | undefined;
async function usesConfigEnv(git: SimpleGit): Promise<boolean> {
  if (configEnv === undefined) {
    try {
      // Quantificateurs bornés : `git --version` ne produit que des nombres.
      const v = (await git.raw(['--version'])).match(/(\d{1,3})\.(\d{1,3})/);
      configEnv = !!v && (Number(v[1]) > 2 || (Number(v[1]) === 2 && Number(v[2]) >= 31));
    } catch {
      configEnv = false;
    }
  }
  return configEnv;
}

/** Variable d'environnement portant l'en-tête, le temps d'une commande. */
const AUTH_ENV = 'GITHUB_COMPANION_AUTH_HEADER';

/**
 * Exécute une commande git authentifiée sans jamais exposer le token :
 * — git >= 2.31 : `--config-env=http.extraHeader=VARIABLE` (argv ne contient
 *   que le NOM de la variable) et l'en-tête passe par l'ENVIRONNEMENT du
 *   processus git : invisible pour `ps`, absent de `error.task.commands` ;
 * — git plus ancien : repli sur `-c http.extraHeader=…`, seul cas où le token
 *   reste visible dans la liste des processus le temps de la commande.
 *
 * Dans tous les cas : rien n'est écrit dans .git/config et l'invite de
 * credentials est désactivée (aucune fenêtre ne peut s'ouvrir en plein push).
 */
export async function authRaw(git: SimpleGit, token: string, args: string[]): Promise<string> {
  const header = authHeader(token);
  const viaEnv = await usesConfigEnv(git);
  git.env(gitEnv(viaEnv ? { [AUTH_ENV]: header } : {}));
  try {
    return await git.raw(viaEnv
      ? [`--config-env=http.extraHeader=${AUTH_ENV}`, ...args]
      : ['-c', `http.extraHeader=${header}`, ...args]);
  } finally {
    git.env(gitEnv()); // l'en-tête ne survit pas à l'appel
  }
}

export async function pushWithAuth(
  git: SimpleGit,
  token: string,
  branch: string
): Promise<void> {
  const remotes = await git.getRemotes();
  if (remotes.length === 0) {
    throw new Error('Aucun remote configuré. Crée d\'abord un repo GitHub.');
  }
  const status = await git.status();
  if (status.tracking) {
    await authRaw(git, token, ['push']);
  } else {
    await authRaw(git, token, ['push', '-u', 'origin', branch]);
  }
}

export async function pullWithAuth(
  git: SimpleGit,
  token: string,
  branch: string
): Promise<void> {
  const remotes = await git.getRemotes();
  if (remotes.length === 0) throw new Error('Aucun remote configuré.');
  const status = await git.status();
  // Sans tracking configuré, "git pull" échoue : on précise origin + branche.
  if (status.tracking) {
    await authRaw(git, token, ['pull']);
  } else {
    await authRaw(git, token, ['pull', 'origin', branch]);
  }
}

/** Met à jour refs/remotes/* sans toucher au working tree ni à HEAD. */
export async function fetchWithAuth(git: SimpleGit, token: string): Promise<void> {
  const remotes = await git.getRemotes();
  if (remotes.length === 0) throw new Error('Aucun remote configuré.');
  await authRaw(git, token, ['fetch', 'origin']);
}
