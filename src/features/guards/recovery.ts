import * as vscode from 'vscode';
import { SimpleGit } from 'simple-git';
import { advice, RepoState } from '../../git/repoState';
import { hasRisk, scanStaged, StagedScan, unstage } from '../../git/stagedSecrets';
import { redact } from '../../core/sanitize';

/** Propose d'annuler proprement une opération interrompue (jamais destructive). */
export async function offerAbort(git: SimpleGit, state: RepoState): Promise<boolean> {
  const a = advice(state.op);
  if (!a.abort) return false;
  const choice = await vscode.window.showWarningMessage(
    `${a.label} : ${a.advice}`,
    { modal: true },
    "Annuler l'opération",
    'Laisser tel quel'
  );
  if (choice !== "Annuler l'opération") return false;
  try {
    await git.raw(a.abort);
    vscode.window.showInformationMessage(
      `Opération annulée (git ${a.abort.join(' ')}). Tes fichiers sont intacts.`
    );
    return true;
  } catch (err: any) {
    vscode.window.showErrorMessage(`Annulation impossible : ${redact(err?.message ?? err)}`);
    return false;
  }
}

/**
 * Fichiers sensibles (ou contenant des identifiants) indexés : on demande
 * confirmation AVANT de publier. Un dépôt GitHub se nettoie très mal après coup.
 * Réponse false = ne pas commiter.
 */
export async function guardStagedSecrets(git: SimpleGit): Promise<boolean> {
  const scan: StagedScan = await scanStaged(git);
  if (!hasRisk(scan)) return true;
  const files = [...scan.paths, ...scan.contentHits];
  const detail = [
    scan.paths.length > 0 ? `fichiers sensibles : ${scan.paths.join(', ')}` : '',
    scan.contentHits.length > 0
      ? `lignes ajoutées ressemblant à des identifiants dans : ${scan.contentHits.join(', ')}`
      : '',
    scan.truncated ? '(analyse partielle : diff volumineux)' : ''
  ]
    .filter(Boolean)
    .join(' — ');

  const choice = await vscode.window.showWarningMessage(
    `Ce commit publierait des identifiants. ${detail}. ` +
      'Vérifie avant d’envoyer (un secret poussé reste dans l’historique GitHub).',
    { modal: true },
    'Désindexer ces fichiers',
    'Commiter quand même',
    'Annuler'
  );

  if (choice === 'Désindexer ces fichiers') {
    await unstage(git, files);
    vscode.window.showInformationMessage(
      `Retirés de l'index — fichiers intacts sur le disque : ${files.join(', ')}. ` +
        'Relance le commit quand tu veux.'
    );
    return false;
  }
  return choice === 'Commiter quand même';
}
