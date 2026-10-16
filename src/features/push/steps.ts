import * as vscode from 'vscode';
import { SimpleGit } from 'simple-git';
import { localHead, remoteHead } from '../../git/remoteHead';
import { recordOp } from '../journal';

/** Pousser sur une base en retard crée des conflits côté cloud : on prévient. */
export async function confirmBehindPush(behind: number): Promise<boolean> {
  if (behind <= 0) return true;
  const choice = await vscode.window.showWarningMessage(
    `Tu as ${behind} commit(s) distant(s) non récupéré(s). ` +
      'Pousser sur une base ancienne peut créer des conflits.',
    { modal: true },
    // VS Code ajoute le bouton d'annulation de tout dialogue modal.
    'Pousser quand même'
  );
  return choice === 'Pousser quand même'; // fermer le dialogue annule le push
}

/**
 * Vérifie APRÈS le push que le cloud a reçu exactement le commit local :
 * sans cela, un push « accepté » mais incomplet passerait pour un succès.
 * En cas d'écart on le dit clairement ; rien n'est modifié en local.
 */
export async function finishPush(
  context: vscode.ExtensionContext | undefined,
  git: SimpleGit,
  token: string,
  branch: string,
  before: string | undefined,
  ahead: number
): Promise<void> {
  const local = await localHead(git);
  const remote = await remoteHead(git, token, branch);
  const detail = ahead > 0 ? `${ahead} commit(s)` : 'tous les commits';
  await recordOp(context, {
    at: Date.now(),
    op: 'push',
    ok: !remote || remote === local,
    before,
    after: local,
    detail: `origin/${branch} · ${detail}`
  });

  if (remote && local && remote !== local) {
    vscode.window.showErrorMessage(
      `Push incomplet : le cloud est sur ${remote.slice(0, 7)} alors que ton commit local ` +
        `est ${local.slice(0, 7)}. Vérifie sur GitHub (aucun fichier local n'a été modifié).`
    );
    return;
  }
  vscode.window.showInformationMessage(
    `Push réussi : ${detail} envoyé(s) vers origin/${branch}` +
      (remote ? ` — vérifié sur le cloud (${remote.slice(0, 7)}).` : '.')
  );
}
