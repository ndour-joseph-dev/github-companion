import * as vscode from 'vscode';
import { GitService } from '../../git/gitService';
import { getWorkspaceRoot } from '../../core/workspace';
import { handleError } from '../../core/errorHandler';
import { hasNoCommitsYet } from '../../git/gitGuards';
import { hasGitignore } from '../../git/gitignoreCheck';
import { withGitLock } from '../../git/gitLock';
import { localHead } from '../../git/remoteHead';
import { preflight, guardStagedSecrets } from '../guards';
import { recordOp } from '../journal';
import { warnMissingGitignore, maybeAutoPush } from './hooks';

/** Un commit = une action utilisateur, sous verrou (jamais deux en parallèle). */
export function runCommit(
  message: string,
  onDone: () => void,
  context?: vscode.ExtensionContext
): Promise<void> {
  return withGitLock(() => commitImpl(message, onDone, context));
}

async function commitImpl(
  message: string,
  onDone: () => void,
  context?: vscode.ExtensionContext
): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Ouvre d\'abord un dossier de projet.');
    return;
  }
  if (!message || message.trim().length === 0) {
    vscode.window.showWarningMessage('Le message de commit ne peut pas être vide.');
    return;
  }

  try {
    const git = new GitService(root);
    if (!(await git.isRepo())) {
      vscode.window.showErrorMessage(
        'Ce dossier n\'est pas encore un repo Git. Clique sur "Initialiser un repo local" d\'abord.'
      );
      return;
    }

    const pf = await preflight(root, git.raw(), 'commit');
    if (!pf.ok) return;

    if (await hasNoCommitsYet(git.raw()) && !hasGitignore(root)) {
      const proceed = await warnMissingGitignore(root, git);
      if (!proceed) return;
    }

    // Garde-fou secrets : ne jamais publier .env, clé privée ou token par accident.
    if (!(await guardStagedSecrets(git.raw()))) return;

    const before = await localHead(git.raw());
    const result = await git.commitAll(message.trim());
    if (!result.committed) {
      vscode.window.showInformationMessage('Rien à commiter : aucun fichier modifié.');
      return;
    }
    await recordOp(context, {
      at: Date.now(),
      op: 'commit',
      ok: true,
      before,
      after: await localHead(git.raw()),
      detail: result.summary
    });
    vscode.window.showInformationMessage(`Commit effectué (${result.summary}).`);
    onDone();
    await maybeAutoPush(context);
  } catch (err: any) {
    handleError('commit', err);
  }
}

/** Commande palette « Commit local » : demande le message puis commite. */
export async function runCommitPrompt(context: vscode.ExtensionContext): Promise<void> {
  const message = await vscode.window.showInputBox({
    title: 'Message de commit',
    prompt: 'Décris la modification en une ligne.',
    ignoreFocusOut: true
  });
  if (!message) return;
  await runCommit(message, () => {}, context);
}

