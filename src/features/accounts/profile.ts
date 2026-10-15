import * as vscode from 'vscode';
import { readAccounts } from './store';
import { attemptedRecently, needsRefresh, refreshProfiles } from './refresh';

/**
 * Complète ou remet à jour les comptes dont la photo GitHub n'est pas utilisable :
 * comptes ajoutés hors ligne, dont le nom n'a jamais été résolu, ou dont la liste
 * de dépôts est trop ancienne (REPOS_TTL_MS) pour être encore crue.
 *
 * Aucune requête réseau si la photo est fraîche, et jamais deux essais rapprochés
 * pour un même compte : le panneau peut être reconstruit ou réaffiché plusieurs
 * fois d'affilée, GitHub n'a pas à le savoir.
 */
export async function ensureProfiles(context: vscode.ExtensionContext): Promise<void> {
  const now = Date.now();
  const todo = (await readAccounts(context))
    .filter((a) => needsRefresh(a, now) && !attemptedRecently(a.id, now));
  if (todo.length === 0) return;
  await refreshProfiles(context, todo.map((a) => a.id));
}
