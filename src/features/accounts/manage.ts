import * as vscode from 'vscode';
import { getActiveAccount, getActiveToken, saveToken, replaceToken } from './core';
import { label, type Account } from './store';
import { warnAccountRepoMismatch } from './guard';
import { auditQuietly } from '../../core/security/watch';

const TOKEN_PROMPT = [
  'Crée un Personal Access Token sur GitHub :',
  '1. https://github.com/settings/tokens → "Generate new token (classic)"',
  '2. Coche le scope "repo"',
  '3. Copie le token (ghp_…) et colle-le ici.',
  'Stocké dans le coffre-fort VS Code — jamais écrit dans .git/config.'
].join('\n');

/** Demande un token (saisie masquée, jamais journalisée ni affichée). */
async function askToken(title: string): Promise<string | undefined> {
  const token = await vscode.window.showInputBox({
    title,
    password: true,
    ignoreFocusOut: true,
    // Placeholder informatif : jamais un vrai format de token (un ghp_ réel
    // ferait échouer les scanners de secrets, ici et chez les contributeurs).
    placeHolder: 'ghp_… (40 caractères)',
    prompt: TOKEN_PROMPT
  });
  return token ? token.trim() : undefined;
}

/** Nom affiché d'un compte (le login n'est pas toujours résolu, ex. hors ligne). */
export { label };

/** Enregistre le token saisi et annonce le compte détecté. */
async function saveAndAnnounce(
  context: vscode.ExtensionContext,
  title: string
): Promise<Account | undefined> {
  const token = await askToken(title);
  if (!token) return undefined;
  const acc = await saveToken(context, token);
  vscode.window.showInformationMessage(
    acc.login
      ? `Compte « ${acc.login} » enregistré et sélectionné.`
      : 'Token enregistré. Nom du compte non résolu (connexion internet ?).'
  );
  await warnAccountRepoMismatch(context, acc.id);
  await auditQuietly(context);
  return acc;
}

/** Token du compte actif, ou invite à en saisir un au tout premier usage. */
export async function getOrPromptToken(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  const existing = await getActiveToken(context);
  if (existing) return existing;
  return (await saveAndAnnounce(context, 'Token GitHub'))?.token;
}

/** Ajoute un compte GitHub supplémentaire (le nouveau devient actif). */
export async function runAddAccount(context: vscode.ExtensionContext): Promise<void> {
  await saveAndAnnounce(context, 'Nouveau compte GitHub — token');
}

/** Remplace le token du compte actif (ou en ajoute un si la liste est vide). */
export async function changeToken(context: vscode.ExtensionContext): Promise<void> {
  const active = await getActiveAccount(context);
  if (!active) return runAddAccount(context);
  const token = await askToken(`Nouveau token pour « ${label(active)} »`);
  if (!token) return;
  const acc = await replaceToken(context, active.id, token);
  vscode.window.showInformationMessage(
    acc?.login ? `Compte « ${acc.login} » mis à jour.` : 'Token mis à jour.'
  );
  if (acc) await warnAccountRepoMismatch(context, acc.id);
  await auditQuietly(context);
}

/** Alias conservé pour la commande « Modifier le token » de la palette. */
export async function resetToken(context: vscode.ExtensionContext): Promise<void> {
  await changeToken(context);
}
