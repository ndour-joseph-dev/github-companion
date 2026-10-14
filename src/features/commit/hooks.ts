import * as vscode from 'vscode';
import { GitService } from '../../git/gitService';
import { ensureStarterFiles } from '../../git/gitignoreCheck';
import { runPush } from '../push';

/**
 * Aucun .gitignore : « git add . » ajouterait tout (y compris des fichiers
 * qu'on ne veut pas publier, type .env). On propose de créer la base, ou pas.
 */
export async function warnMissingGitignore(root: string, git: GitService): Promise<boolean> {
  const status = await git.raw().status();
  const preview =
    status.not_added.slice(0, 8).join(', ') +
    (status.not_added.length > 8 ? '…' : '');

  const choice = await vscode.window.showWarningMessage(
    `Aucun .gitignore. "git add ." ajoutera tout (ex : ${preview}).`,
    { modal: true },
    'Créer .gitignore + README',
    'Continuer quand même'
  );

  if (choice === 'Créer .gitignore + README') {
    const created = ensureStarterFiles(root);
    vscode.window.showInformationMessage(
      `Créé : ${created.join(', ')}. Vérifie puis relance "Commit local".`
    );
    return false;
  }
  return choice === 'Continuer quand même';
}

/** Sync auto : push immédiat après un commit RÉUSSI (si le réglage est activé). */
export async function maybeAutoPush(context?: vscode.ExtensionContext): Promise<void> {
  const autoSync = vscode.workspace
    .getConfiguration('githubCompanion')
    .get<boolean>('autoSync', false);
  if (autoSync && context) await runPush(context);
}
