import * as vscode from 'vscode';
import { redact } from './sanitize';

/** Centralise la gestion d'erreurs pour donner un message clair et actionnable. */
export function handleError(step: string, err: any): void {
  // Les erreurs git/HTTP peuvent contenir l'en-tête d'authentification :
  // on les nettoie avant tout affichage.
  const raw = redact(err?.message ?? String(err), 'une commande Git');

  if (raw.includes('401') || raw.toLowerCase().includes('bad credentials')) {
    vscode.window.showErrorMessage(
      `Échec (${step}) : le token GitHub est invalide ou expiré. Utilise "GitHub Companion: Configurer le token GitHub" pour le renouveler.`
    );
    return;
  }
  if (raw.includes('422') || raw.toLowerCase().includes('name already exists')) {
    vscode.window.showErrorMessage(`Échec (${step}) : un repo avec ce nom existe déjà sur ton compte GitHub.`);
    return;
  }
  if (raw.toLowerCase().includes('rejected') || raw.toLowerCase().includes('non-fast-forward')) {
    vscode.window.showErrorMessage(
      `Échec (${step}) : le remote a des changements que tu n'as pas en local. Fais un "git pull" manuel puis réessaie.`
    );
    return;
  }
  vscode.window.showErrorMessage(`Échec (${step}) : ${raw}`);
}
