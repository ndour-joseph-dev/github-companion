import * as vscode from 'vscode';
import { GitService } from '../../git/gitService';
import { getWorkspaceRoot } from '../../core/workspace';
import { getOrPromptToken } from '../accounts';
import { handleError } from '../../core/errorHandler';
import { isHeadDetached, getRemoteUrl } from '../../git/gitGuards';
import { fetchAndCompare } from '../../git/remoteCheck';
import { clearLastRemoteCheck } from '../checkUpdates';
import { withGitLock } from '../../git/gitLock';
import { localHead } from '../../git/remoteHead';
import { preflight } from '../guards';
import { recordOp } from '../journal';

/** Une récupération = une action utilisateur, sous verrou. */
export function runPull(context: vscode.ExtensionContext): Promise<void> {
  return withGitLock(() => pullImpl(context));
}

async function pullImpl(context: vscode.ExtensionContext): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Ouvre d\'abord un dossier de projet.');
    return;
  }

  try {
    const git = new GitService(root);
    if (!(await git.isRepo())) {
      vscode.window.showErrorMessage('Ce dossier n\'est pas un repo Git.');
      return;
    }
    if (await isHeadDetached(git.raw())) {
      vscode.window.showErrorMessage('HEAD détaché : reviens sur une branche avant.');
      return;
    }

    const remoteUrl = await getRemoteUrl(git.raw(), 'origin');
    if (!remoteUrl) {
      vscode.window.showErrorMessage('Aucun remote "origin".');
      return;
    }

    const pf = await preflight(root, git.raw(), 'pull');
    if (!pf.ok) return;

    const token = await getOrPromptToken(context);
    if (!token) {
      vscode.window.showWarningMessage('Aucun token fourni, pull annulé.');
      return;
    }

    const defaultBranch = vscode.workspace
      .getConfiguration('githubCompanion').get<string>('defaultBranch', 'main');

    // Fetch + comparaison frais, puis pull, le tout sous un indicateur visible.
    const before = await localHead(git.raw());
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Synchronisation avec le cloud…',
        cancellable: false
      },
      async (progress) => {
        progress.report({ message: 'Récupération des références distantes…' });
        const res = await fetchAndCompare(git.raw(), token);
        if (res.upstream && res.behind > 0) {
          progress.report({ message: `Récupération de ${res.behind} commit(s)…` });
          await git.pullWithToken(token, defaultBranch);
        }
        return res;
      }
    );
    clearLastRemoteCheck();
    await recordOp(context, {
      at: Date.now(),
      op: 'pull',
      ok: true,
      before,
      after: await localHead(git.raw()),
      detail: `${result.behind} commit(s) reçus`
    });

    if (!result.upstream) {
      vscode.window.showWarningMessage(
        'Aucune branche distante à récupérer. Pousse au moins une fois d\'abord.'
      );
      return;
    }
    if (result.behind === 0) {
      vscode.window.showInformationMessage('Déjà à jour : rien à récupérer.');
      return;
    }

    vscode.window.showInformationMessage(
      `Mise à jour réussie : ${result.behind} commit(s) récupéré(s) depuis le cloud.`
    );
  } catch (err: any) {
    handleError('pull', err);
  }
}
