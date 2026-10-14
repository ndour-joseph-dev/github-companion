import * as vscode from 'vscode';
import { GitService } from '../../git/gitService';
import { getWorkspaceRoot } from '../../core/workspace';
import { getOrPromptToken, confirmPushAllowed } from '../accounts';
import { handleError } from '../../core/errorHandler';
import { isHeadDetached, hasNoCommitsYet, getRemoteUrl } from '../../git/gitGuards';
import { getLastRemoteCheck, clearLastRemoteCheck } from '../checkUpdates';
import { withGitLock } from '../../git/gitLock';
import { localHead } from '../../git/remoteHead';
import { preflight } from '../guards';
import { confirmBehindPush, finishPush } from './steps';

/** Un push = une action utilisateur, sous verrou (jamais deux en parallèle). */
export function runPush(context: vscode.ExtensionContext): Promise<void> {
  return withGitLock(() => pushImpl(context));
}

async function pushImpl(context: vscode.ExtensionContext): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Ouvre d\'abord un dossier de projet.');
    return;
  }
  const config = vscode.workspace.getConfiguration('githubCompanion');
  const defaultBranch = config.get<string>('defaultBranch', 'main');

  try {
    const git = new GitService(root);
    if (!(await git.isRepo())) {
      vscode.window.showErrorMessage('Ce dossier n\'est pas encore un repo Git.');
      return;
    }
    if (await isHeadDetached(git.raw())) {
      vscode.window.showErrorMessage('HEAD détaché : reviens sur une branche avant de pousser.');
      return;
    }
    if (await hasNoCommitsYet(git.raw())) {
      vscode.window.showErrorMessage('Aucun commit local. Fais d\'abord un "Commit local".');
      return;
    }

    const remoteUrl = await getRemoteUrl(git.raw(), 'origin');
    if (!remoteUrl) {
      vscode.window.showErrorMessage('Aucun remote "origin". Utilise "Créer un repo GitHub" d\'abord.');
      return;
    }

    const pf = await preflight(root, git.raw(), 'push');
    if (!pf.ok) return;

    const status = await git.raw().status();
    const remote = getLastRemoteCheck();
    const behind = remote ? remote.behind : status.behind;
    if (!(await confirmBehindPush(behind))) return;

    const token = await getOrPromptToken(context);
    if (!token) {
      vscode.window.showWarningMessage('Aucun token fourni, push annulé.');
      return;
    }
    // Filet de sécurité : le compte actif doit pouvoir pousser vers ce dépôt.
    if (!(await confirmPushAllowed(context))) {
      vscode.window.showWarningMessage('Push annulé : compte ou dépôt à vérifier.');
      return;
    }

    const hasUpstream = !!status.tracking;
    if (hasUpstream && status.ahead === 0 && (!remote || remote.ahead === 0)) {
      vscode.window.showInformationMessage(
        'Rien à pousser : ton dépôt est déjà synchronisé avec le cloud.'
      );
      return;
    }

    // Feedback visible pendant l'envoi (un push GitHub prend quelques secondes) :
    // sans cela, on croit à tort que le clic n'a rien fait et on reclique.
    const before = await localHead(git.raw());
    const branch = status.current ?? defaultBranch;
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Envoi vers origin/${branch}…`,
        cancellable: false
      },
      async (progress) => {
        progress.report({ message: 'Push en cours…' });
        await git.pushWithToken(token, branch);
      }
    );
    clearLastRemoteCheck();
    const ahead = hasUpstream ? status.ahead : 0;
    await finishPush(context, git.raw(), token, branch, before, ahead);
  } catch (err: any) {
    handleError('push', err);
  }
}
