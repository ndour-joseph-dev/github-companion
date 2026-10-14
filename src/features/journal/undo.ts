import * as vscode from 'vscode';
import { GitService } from '../../git/gitService';
import { getWorkspaceRoot } from '../../core/workspace';
import { redact } from '../../core/sanitize';
import { JournalEntry } from './store';

/**
 * Annule le DERNIER commit avec « git reset --soft » : HEAD recule d'un cran,
 * mais AUCUN fichier n'est touché (tout reste sur le disque et repasse
 * « en attente de commit »). C'est la seule annulation proposée : elle est
 * réversible et ne peut pas faire perdre de travail.
 *
 * Refusée si l'historique a bougé depuis (on ne réécrit jamais autre chose).
 */
export async function undoCommit(entry: JournalEntry): Promise<boolean> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage("Ouvre d'abord un dossier de projet.");
    return false;
  }
  try {
    const git = new GitService(root);
    const simple = git.raw();
    if (!(await git.isRepo())) {
      vscode.window.showErrorMessage("Ce dossier n'est pas un dépôt Git.");
      return false;
    }
    const head = (await simple.raw(['rev-parse', 'HEAD'])).trim();
    if (!entry.after || head !== entry.after) {
      vscode.window.showWarningMessage(
        "L'historique a changé depuis ce commit : annulation refusée (aucun fichier touché)."
      );
      return false;
    }
    const confirm = await vscode.window.showWarningMessage(
      'Annuler ce commit ? Tes fichiers restent sur le disque, tes modifications repassent en attente.',
      { modal: true },
      'Annuler le commit',
      'Garder'
    );
    if (confirm !== 'Annuler le commit') return false;

    await simple.raw(['reset', '--soft', 'HEAD~1']);
    vscode.window.showInformationMessage(
      `Commit annulé : retour à ${entry.before?.slice(0, 7) ?? "l'état précédent"}. ` +
        "Aucun fichier n'a été modifié ni supprimé."
    );
    return true;
  } catch (err: any) {
    vscode.window.showErrorMessage(`Annulation impossible : ${redact(err?.message ?? err)}`);
    return false;
  }
}
