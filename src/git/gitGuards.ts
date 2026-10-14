import { SimpleGit } from 'simple-git';

export async function isHeadDetached(git: SimpleGit): Promise<boolean> {
  const status = await git.status();
  return status.detached;
}

/** Racine réelle du repo Git (peut différer du workspace si celui-ci est un sous-dossier) */
export async function getTopLevelPath(git: SimpleGit): Promise<string | null> {
  try {
    const result = await git.raw(['rev-parse', '--show-toplevel']);
    return result.trim();
  } catch {
    return null;
  }
}

/** URL du remote donné, si déjà configuré */
export async function getRemoteUrl(git: SimpleGit, name: string): Promise<string | undefined> {
  const remotes = await git.getRemotes(true);
  return remotes.find(r => r.name === name)?.refs?.fetch;
}

/** true si le repo n'a encore aucun commit (HEAD "unborn") */
export async function hasNoCommitsYet(git: SimpleGit): Promise<boolean> {
  try {
    await git.raw(['rev-parse', '--verify', 'HEAD']);
    return false;
  } catch {
    return true;
  }
}
