import * as vscode from 'vscode';
import { listAccounts, getActiveAccount } from './core';
import { setActiveId } from './store';
import { ensureProfiles } from './profile';
import { runAddAccount, changeToken } from './manage';
import { runRemoveAccount } from './switch';
import { guardAccountSwitch } from './guard';
import type { AccountInfo } from './store';

/**
 * Liste sans tokens, prête à être envoyée au webview.
 * Complète au passage les profils manquants (nom, page, nombre de dépôts,
 * liste des dépôts détenus).
 */
export async function accountsForPanel(
  context: vscode.ExtensionContext
): Promise<AccountInfo[]> {
  await ensureProfiles(context);
  const accounts = await listAccounts(context);
  const active = await getActiveAccount(context);
  return accounts.map((a) => ({
    id: a.id,
    login: a.login,
    active: a.id === active?.id,
    htmlUrl: a.htmlUrl,
    repoCount: a.repoCount,
    repos: a.repos
  }));
}

/** Annonce le compte désormais actif (retour utilisateur explicite). */
async function announce(
  context: vscode.ExtensionContext,
  id: string
): Promise<void> {
  const acc = (await listAccounts(context)).find((a) => a.id === id);
  if (acc) {
    vscode.window.showInformationMessage(
      `Compte actif : ${acc.login || 'Compte sans nom'}.`
    );
  }
}

/** Messages « compte » envoyés par les boutons du panneau. */
export async function handleAccountAction(
  context: vscode.ExtensionContext,
  action: string,
  id?: string
): Promise<void> {
  if (action === 'add') return runAddAccount(context);
  if (action === 'remove') return runRemoveAccount(context, id);
  if (action === 'token') return changeToken(context);
  if (action === 'switch' && id) {
    // Garde-fou : ne pas basculer vers un compte étranger au dépôt ouvert
    // sans un accord explicite (un push partirait vers le mauvais dépôt).
    const finalId = await guardAccountSwitch(context, id);
    if (!finalId) return;
    await setActiveId(context, finalId);
    await announce(context, finalId);
  }
}
