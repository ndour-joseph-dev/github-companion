import * as path from 'path';
import * as vscode from 'vscode';
import { GitService } from '../../git/gitService';
import { getWorkspaceRoot } from '../../core/workspace';
import { GitHubService } from '../../github/githubService';
import { getOrPromptToken, forgetRepoAccess } from '../accounts';
import { handleError } from '../../core/errorHandler';
import { getRemoteUrl } from '../../git/gitGuards';
import { repoRefFromUrl } from '../../git/repoRef';
import { stripCredentials } from '../../core/sanitize';
import { validateRepoName } from './validateRepoName';

export async function runCreateRepo(context: vscode.ExtensionContext): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Ouvre d\'abord un dossier de projet.');
    return;
  }

  const git = new GitService(root);
  if (!(await git.isRepo())) {
    vscode.window.showErrorMessage(
      'Pas encore de repo Git local. Clique d\'abord sur "Initialiser un repo local".'
    );
    return;
  }

  const existingOrigin = await getRemoteUrl(git.raw(), 'origin');
  if (existingOrigin) {
    // Affichage « owner/repo » : jamais d'URL complète (elle peut porter un token).
    const shown = repoRefFromUrl(existingOrigin)?.fullName ?? stripCredentials(existingOrigin);
    const choice = await vscode.window.showWarningMessage(
      `Un remote "origin" existe déjà (${shown}). Le remplacer ?`,
      'Remplacer',
      'Annuler'
    );
    if (choice !== 'Remplacer') return;
  }

  // Suggestion = nom du dossier ouvert (modifiable, jamais imposé)
  const folderName = path.basename(root);

  const name = await vscode.window.showInputBox({
    title: 'Nom du dépôt GitHub',
    prompt: 'Quel nom veux-tu donner à ce dépôt ? (ce n\'est PAS le token)',
    placeHolder: 'ex : mon-super-projet',
    value: folderName,
    ignoreFocusOut: true,
    validateInput: validateRepoName
  });
  if (!name) return;

  const token = await getOrPromptToken(context);
  if (!token) {
    vscode.window.showWarningMessage('Aucun token fourni, opération annulée.');
    return;
  }

  const config = vscode.workspace.getConfiguration('githubCompanion');
  const defaultVisibility = config.get<string>('defaultVisibility', 'private');
  const visibilityPick = await vscode.window.showQuickPick(['private', 'public'], {
    title: 'Visibilité du dépôt',
    placeHolder: `Par défaut : ${defaultVisibility}`
  });
  const isPrivate = (visibilityPick ?? defaultVisibility) === 'private';

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'GitHub Companion', cancellable: false },
    async (progress) => {
      try {
        const github = new GitHubService(token);
        progress.report({ message: 'Vérification du token…' });
        await github.verifyToken();

        progress.report({ message: `Création de « ${name.trim()} »…` });
        const { cloneUrl, htmlUrl } = await github.createRepo({
          name: name.trim(),
          isPrivate
        });

        progress.report({ message: 'Configuration du remote…' });
        await git.addRemote('origin', cloneUrl);
        forgetRepoAccess(); // le dépôt lié vient de changer

        vscode.window.showInformationMessage(
          `Dépôt créé : ${htmlUrl}. Utilise "Commit local" puis "Push" quand tu es prêt.`
        );
      } catch (err: any) {
        handleError('création du repo', err);
      }
    }
  );
}
