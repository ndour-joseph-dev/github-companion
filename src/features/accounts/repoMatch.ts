import * as vscode from 'vscode';
import { GitService } from '../../git/gitService';
import { getWorkspaceRoot } from '../../core/workspace';
import { getRepoRef, RepoRef } from '../../git/repoRef';
import { GitHubService, RepoAccess } from '../../github/githubService';
import { Account } from './store';
import { listAccounts, getActiveAccount } from './core';

/** Résultat : compte examiné, dépôt cloud du dossier ouvert, accès constaté. */
export interface RepoMatch {
  account: Account;
  repo: RepoRef;
  access: RepoAccess;
}

// Un appel API par (dépôt, compte) et par 10 min : le panneau reste réactif
// même si l'utilisateur bascule de compte plusieurs fois d'affilée.
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; access: RepoAccess }>();

async function cachedAccess(account: Account, repo: RepoRef): Promise<RepoAccess> {
  const key = `${repo.fullName}#${account.id}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.access;
  const access = await new GitHubService(account.token).getRepoAccess(repo.owner, repo.name);
  cache.set(key, { at: Date.now(), access });
  return access;
}

/** Dépôt cloud du dossier ouvert (lecture locale du remote « origin »). */
async function workspaceRepo(): Promise<RepoRef | undefined> {
  const root = getWorkspaceRoot();
  if (!root) return undefined;
  try {
    const git = new GitService(root);
    if (!(await git.isRepo())) return undefined;
    return getRepoRef(git.raw());
  } catch {
    return undefined;
  }
}

/**
 * Compare un compte au dépôt cloud du dossier ouvert.
 * undefined si rien à vérifier : pas de dossier, pas de repo, pas de remote
 * exploitable, ou compte inconnu (le cas courant « hors ligne » n'échoue pas,
 * il renvoie simplement role « unknown »).
 */
export async function analyzeRepoMatch(
  context: vscode.ExtensionContext,
  accountId?: string
): Promise<RepoMatch | undefined> {
  const repo = await workspaceRepo();
  if (!repo) return undefined;
  const account = accountId
    ? (await listAccounts(context)).find((a) => a.id === accountId)
    : await getActiveAccount(context);
  if (!account) return undefined;
  return { account, repo, access: await cachedAccess(account, repo) };
}

/** Vide le cache d'accès (après une création de repo ou un changement de remote). */
export function forgetRepoAccess(): void {
  cache.clear();
}
