import * as vscode from 'vscode';
import { listAccounts, getActiveAccount, removeAccount } from './core';
import { setActiveId, label } from './store';
import { runAddAccount } from './manage';
import { guardAccountSwitch } from './guard';
import type { Account } from './store';

/** Sélection d'un compte via une liste déroulante rapide. */
export async function pickAccount(
  accounts: Account[],
  title: string
): Promise<Account | undefined> {
  const pick = await vscode.window.showQuickPick(
    accounts.map((a) => ({ label: label(a), description: a.id, id: a.id })),
    { title, placeHolder: 'Compte utilisé pour créer / pousser / tirer' }
  );
  return accounts.find((a) => a.id === pick?.id);
}

/** Bascule vers un autre compte enregistré (garde-fou : dépôt ↔ compte). */
export async function runSwitchAccount(context: vscode.ExtensionContext): Promise<void> {
  const accounts = await listAccounts(context);
  if (accounts.length === 0) return runAddAccount(context);
  const active = await getActiveAccount(context);
  const pick = await pickAccount(accounts, 'Compte GitHub à utiliser');
  if (!pick || pick.id === active?.id) return;
  const id = await guardAccountSwitch(context, pick.id);
  if (!id) return; // l'utilisateur a annulé après l'avertissement
  await setActiveId(context, id);
  vscode.window.showInformationMessage(
    `Compte actif : ${label(accounts.find((a) => a.id === id) ?? pick)}.`
  );
}

/** Retire un compte (confirmation modale : son token est effacé). */
export async function runRemoveAccount(
  context: vscode.ExtensionContext,
  id?: string
): Promise<void> {
  const accounts = await listAccounts(context);
  if (accounts.length === 0) {
    vscode.window.showInformationMessage('Aucun compte enregistré.');
    return;
  }
  const target = id
    ? accounts.find((a) => a.id === id)
    : await pickAccount(accounts, 'Retirer quel compte ?');
  if (!target) return;
  const name = label(target);
  const ok = await vscode.window.showWarningMessage(
    `Retirer « ${name} » ? Son token sera effacé du coffre-fort VS Code.`,
    { modal: true },
    'Retirer'
  );
  if (ok !== 'Retirer') return;
  await removeAccount(context, target.id);
  vscode.window.showInformationMessage(`Compte « ${name} » retiré.`);
}
