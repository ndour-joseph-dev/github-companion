import { SimpleGit } from 'simple-git';
import { authRaw } from './gitAuth';

/**
 * SHA de la branche sur le cloud (preuve d'APRÈS-push : le dépôt distant a
 * bien reçu exactement le commit local, sinon on alerte au lieu de mentir).
 * undefined si l'information n'est pas obtenable (hors ligne).
 */
export async function remoteHead(
  git: SimpleGit,
  token: string,
  branch: string
): Promise<string | undefined> {
  try {
    const out = await authRaw(git, token, ['ls-remote', 'origin', `refs/heads/${branch}`]);
    return out.trim().split(/\s+/)[0] || undefined;
  } catch {
    return undefined;
  }
}

/** SHA local de HEAD (undefined si aucun commit). */
export async function localHead(git: SimpleGit): Promise<string | undefined> {
  try {
    return (await git.raw(['rev-parse', 'HEAD'])).trim() || undefined;
  } catch {
    return undefined;
  }
}
