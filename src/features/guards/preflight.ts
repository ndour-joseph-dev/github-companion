import * as vscode from 'vscode';
import { SimpleGit } from 'simple-git';
import { staleLock } from '../../git/gitLock';
import { advice, readRepoState, RepoState } from '../../git/repoState';
import { offerAbort } from './recovery';

export type Op = 'commit' | 'push' | 'pull' | 'fetch';

export interface Preflight {
  ok: boolean;
  state: RepoState;
}

/**
 * Contrôles AVANT toute action Git de l'extension. Objectif : aucune action ne
 * peut casser le projet (fichiers perdus, dépôt incohérent, index corrompu).
 * Rien n'est jamais modifié ici : uniquement des refus, des explications et des
 * propositions de récupération.
 */
export async function preflight(root: string, git: SimpleGit, op: Op): Promise<Preflight> {
  const state = await readRepoState(git);

  const lock = staleLock(root);
  if (lock) {
    vscode.window.showErrorMessage(
      `Une autre opération Git semble en cours (verrou « ${lock} »). ` +
        "Ferme le programme qui l'a créé ou attends qu'il termine, puis réessaie. " +
        "Ce verrou n'a pas été supprimé par l'extension."
    );
    return { ok: false, state };
  }

  if (state.op) {
    // Un commit SANS conflit est justement la façon normale de terminer une fusion.
    if (op === 'commit' && state.conflicts === 0) return { ok: true, state };
    const a = advice(state.op);
    const choice = await vscode.window.showWarningMessage(
      `${a.label} : ${a.advice} L'action « ${op} » a été interrompue pour ne rien casser.`,
      { modal: true },
      'Aider à annuler',
      'Compris'
    );
    if (choice === 'Aider à annuler') await offerAbort(git, state);
    return { ok: false, state };
  }

  if (state.conflicts > 0) {
    vscode.window.showErrorMessage(
      `${state.conflicts} fichier(s) en conflit. Résous-les (ou annule la fusion) avant de continuer.`
    );
    return { ok: false, state };
  }

  // Récupération avec des modifications locales : git refusera plutôt que
  // d'écraser, mais mieux vaut prévenir (aucune perte possible ici).
  if (op === 'pull' && state.dirty > 0) {
    const choice = await vscode.window.showWarningMessage(
      `${state.dirty} fichier(s) modifié(s) non commité(s). Git refusera d'écraser tes ` +
        "changements s'ils gênent la récupération : tes fichiers ne seront pas perdus. " +
        'Commiter d’abord est plus confortable.',
      { modal: true },
      'Continuer',
      'Annuler'
    );
    if (choice !== 'Continuer') return { ok: false, state };
  }

  return { ok: true, state };
}
