import * as vscode from 'vscode';
import { analyzeRepoMatch } from './repoMatch';
import { label } from './store';

/**
 * Filet de sécurité avant un push : si le compte actif n'a aucun accès (ou
 * seulement un accès en lecture) au dépôt cloud du dossier ouvert, on prévient
 * AVANT que git n'échoue — et avant qu'un commit ne parte vers le dépôt d'un
 * autre compte. Hors ligne (rôle inconnu), on ne bloque jamais.
 */
export async function confirmPushAllowed(
  context: vscode.ExtensionContext
): Promise<boolean> {
  const match = await analyzeRepoMatch(context); // compte actif
  if (!match) return true; // aucun dépôt cloud lié : rien à vérifier
  const { account, repo, access } = match;
  if (access.role === 'owner' || access.role === 'admin' || access.role === 'unknown') return true;
  if (access.role === 'collaborator' && access.canPush !== false) return true; // légitime

  const cause = access.role === 'none'
    ? 'n\'a aucun accès au dépôt'
    : 'n\'a qu\'un accès en LECTURE SEULE au dépôt';
  const choice = await vscode.window.showWarningMessage(
    `« ${label(account)} » ${cause} ${repo.fullName} ` +
      `(propriétaire : « ${repo.owner} »). Le push va échouer : ` +
      'choisis plutôt le compte correspondant au dépôt.',
    { modal: true },
    // Un seul item : le bouton d'annulation est ajouté par VS Code pour tout
    // dialogue modal (le déclarer ici en afficherait deux).
    'Pousser quand même'
  );
  return choice === 'Pousser quand même'; // fermer le dialogue refuse le push
}
