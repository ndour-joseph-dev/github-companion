import * as vscode from 'vscode';
import { Account, readAccounts, writeAccounts, getActiveId, setActiveId, resolveProfile, getLegacyToken } from './store';
import { ensureMigrated } from './migrate';

/** Tous les comptes enregistrés (migration de l'ancien token incluse). */
export async function listAccounts(context: vscode.ExtensionContext): Promise<Account[]> {
  await ensureMigrated(context);
  return readAccounts(context);
}

/** Compte actif (repli sur le premier enregistré). */
export async function getActiveAccount(
  context: vscode.ExtensionContext
): Promise<Account | undefined> {
  const accounts = await listAccounts(context);
  const id = await getActiveId(context);
  return accounts.find((a) => a.id === id) ?? accounts[0];
}

/** Token à utiliser pour toute opération GitHub. */
export async function getActiveToken(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  return (await getActiveAccount(context))?.token ?? (await getLegacyToken(context));
}

/** Ajoute (ou réutilise) un compte, puis le sélectionne. */
export async function saveToken(
  context: vscode.ExtensionContext,
  token: string
): Promise<Account> {
  const clean = token.trim();
  const accounts = await readAccounts(context);
  const known = accounts.find((a) => a.token === clean);
  if (known) {
    await setActiveId(context, known.id);
    return known;
  }
  const p = await resolveProfile(clean);
  const acc: Account = {
    id: p?.login || `compte-${Date.now()}`,
    login: p?.login || '',
    htmlUrl: p?.htmlUrl,
    repoCount: p?.repoCount,
    token: clean
  };
  await writeAccounts(context, [...accounts, acc]);
  await setActiveId(context, acc.id);
  return acc;
}

/** Remplace le token d'un compte et rafraîchit son nom de compte. */
export async function replaceToken(
  context: vscode.ExtensionContext,
  id: string,
  token: string
): Promise<Account | undefined> {
  const accounts = await readAccounts(context);
  const target = accounts.find((a) => a.id === id) ?? accounts[0];
  if (!target) return undefined;
  target.token = token.trim();
  const p = await resolveProfile(target.token);
  if (p) {
    target.id = p.login;
    target.login = p.login;
    target.htmlUrl = p.htmlUrl;
    target.repoCount = p.repoCount;
    await setActiveId(context, p.login);
  }
  await writeAccounts(context, accounts);
  return target;
}

/** Retire un compte : un autre prend automatiquement le relais. */
export async function removeAccount(context: vscode.ExtensionContext, id: string): Promise<void> {
  const accounts = (await readAccounts(context)).filter((a) => a.id !== id);
  await writeAccounts(context, accounts);
  if ((await getActiveId(context)) === id) {
    await setActiveId(context, accounts[0]?.id ?? '');
  }
}
