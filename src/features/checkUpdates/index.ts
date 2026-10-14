import * as vscode from 'vscode';
import { GitService } from '../../git/gitService';
import { getWorkspaceRoot } from '../../core/workspace';
import { getOrPromptToken } from '../accounts';
import { handleError } from '../../core/errorHandler';
import { getRemoteUrl } from '../../git/gitGuards';
import { fetchAndCompare, RemoteCheckResult } from '../../git/remoteCheck';
import { withGitLock } from '../../git/gitLock';

/** Dernier résultat de vérification (mémoire process). */
let lastResult: RemoteCheckResult | null = null;

export function getLastRemoteCheck(): RemoteCheckResult | null {
  return lastResult;
}

/** Invalide le cache après une action qui change l'état (pull, push…). */
export function clearLastRemoteCheck(): void {
  lastResult = null;
}

/** Vérification distante (fetch) : sous verrou, comme toute opération Git. */
export function runCheckUpdates(
  context: vscode.ExtensionContext
): Promise<RemoteCheckResult | null> {
  return withGitLock(() => checkUpdatesImpl(context));
}

async function checkUpdatesImpl(
  context: vscode.ExtensionContext
): Promise<RemoteCheckResult | null> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Ouvre d\'abord un dossier de projet.');
    return null;
  }

  try {
    const git = new GitService(root);
    if (!(await git.isRepo())) {
      vscode.window.showErrorMessage('Ce dossier n\'est pas un repo Git.');
      return null;
    }

    const remoteUrl = await getRemoteUrl(git.raw(), 'origin');
    if (!remoteUrl) {
      vscode.window.showErrorMessage(
        'Aucun remote "origin". Crée ou lie un repo GitHub d\'abord.'
      );
      return null;
    }

    const token = await getOrPromptToken(context);
    if (!token) {
      vscode.window.showWarningMessage('Aucun token fourni.');
      return null;
    }

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Vérification distante (sans modification locale)…',
        cancellable: false
      },
      async () => fetchAndCompare(git.raw(), token)
    );

    lastResult = result;

    if (!result.upstream) {
      vscode.window.showWarningMessage(
        'Aucune branche distante trouvée. Pousse au moins une fois pour configurer le tracking.'
      );
    } else if (result.behind === 0) {
      vscode.window.showInformationMessage('À jour avec le cloud.');
    } else {
      vscode.window.showInformationMessage(
        `${result.behind} commit(s) distant(s) à récupérer.`
      );
    }

    return result;
  } catch (err: any) {
    handleError('vérification distante', err);
    return null;
  }
}
