import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../../git/gitService';
import { getWorkspaceRoot } from '../../core/workspace';
import { handleError } from '../../core/errorHandler';
import { getTopLevelPath } from '../../git/gitGuards';
import { withGitLock } from '../../git/gitLock';
import { ensureStarterFiles, hasGitignore, hasReadme } from '../../git/gitignoreCheck';

/** `git init` sous verrou : jamais pendant une autre opération Git. */
export function runInitLocalRepo(): Promise<void> {
  return withGitLock(() => initImpl());
}

async function initImpl(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Ouvre d\'abord un dossier de projet.');
    return;
  }
  const config = vscode.workspace.getConfiguration('githubCompanion');
  const defaultBranch = config.get<string>('defaultBranch', 'main');

  try {
    const git = new GitService(root);
    if (await git.isRepo()) {
      const topLevel = await getTopLevelPath(git.raw());
      if (topLevel && path.resolve(topLevel) !== path.resolve(root)) {
        vscode.window.showWarningMessage(
          `Ce dossier fait partie d'un repo Git plus large ("${topLevel}").`
        );
        return;
      }
      vscode.window.showInformationMessage('Ce dossier est déjà un repo Git local.');
      return;
    }

    await git.ensureRepo(defaultBranch);

    // Propose les fichiers de base si absents
    const missing: string[] = [];
    if (!hasGitignore(root)) missing.push('.gitignore');
    if (!hasReadme(root)) missing.push('README.md');

    if (missing.length > 0) {
      const choice = await vscode.window.showInformationMessage(
        `Repo initialisé (branche "${defaultBranch}"). Créer ${missing.join(' + ')} ?`,
        'Oui',
        'Non'
      );
      if (choice === 'Oui') {
        const created = ensureStarterFiles(root);
        vscode.window.showInformationMessage(
          `Créé : ${created.join(', ')}. Tu peux les éditer avant le premier commit.`
        );
        return;
      }
    }

    vscode.window.showInformationMessage(
      `Repo local initialisé (branche "${defaultBranch}").`
    );
  } catch (err: any) {
    handleError('initialisation locale', err);
  }
}
