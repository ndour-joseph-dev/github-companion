import * as vscode from 'vscode';
import { GitService } from '../../git/gitService';
import { getWorkspaceRoot } from '../../core/workspace';
import { buildStatus } from '../../git/gitStatus';
import { accountsForPanel, analyzeRepoMatch, getActiveAccount } from '../accounts';

/**
 * Message « settings » : réglages + comptes du panneau (jamais de token).
 * Recalculé à chaque envoi : la liste peut changer depuis la palette.
 */
export async function settingsMessage(context: vscode.ExtensionContext) {
  const autoSync = vscode.workspace
    .getConfiguration('githubCompanion').get<boolean>('autoSync', false);
  return { type: 'settings', autoSync, accounts: await accountsForPanel(context) };
}

/** Message « status » : état git du dossier ouvert (lecture locale, 0 réseau). */
export async function statusMessage() {
  try {
    const root = getWorkspaceRoot();
    if (!root) return { type: 'status', state: 'no-folder' };
    const git = new GitService(root);
    if (!(await git.isRepo())) return { type: 'status', state: 'no-repo' };
    return { type: 'status', state: 'ok', data: await buildStatus(git.raw()) };
  } catch {
    return { type: 'status', state: 'no-folder' };
  }
}

/**
 * Précise le RÔLE du compte actif sur le dépôt cloud du dossier ouvert
 * (propriétaire, administrateur, collaborateur, aucun accès).
 *
 * Aucun appel réseau si le compte actif est le propriétaire annoncé par l'URL
 * (le panneau le déduit seul), ni si la vérification échoue (hors ligne).
 * Renvoie undefined quand il n'y a rien de neuf à afficher.
 */
export async function enrichStatus(
  msg: any,
  context: vscode.ExtensionContext
): Promise<any | undefined> {
  const repo = msg?.data?.repo;
  if (msg?.state !== 'ok' || !repo) return undefined;
  const active = await getActiveAccount(context);
  const login = (active?.login ?? '').toLowerCase();
  if (login && login === String(repo.owner ?? '').toLowerCase()) return undefined;
  const match = await analyzeRepoMatch(context, active?.id);
  if (!match || match.access.role === 'unknown') return undefined;
  return {
    type: 'status',
    state: 'ok',
    data: {
      ...msg.data,
      repo: { ...repo, role: match.access.role, canPush: match.access.canPush }
    }
  };
}

/** URL externe sûre : seuls http(s) sont ouverts (jamais file:, command:, vscode:). */
export function externalUri(url: unknown): vscode.Uri | undefined {
  const raw = String(url ?? '').trim();
  return /^https?:\/\//i.test(raw) ? vscode.Uri.parse(raw) : undefined;
}
