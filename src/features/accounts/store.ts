import * as vscode from 'vscode';
import { GitHubService, GitHubProfile } from '../../github/githubService';

const LEGACY_KEY = 'githubCompanion.githubToken';
const ACCOUNTS_KEY = 'githubCompanion.accounts';
const ACTIVE_KEY = 'githubCompanion.activeAccount';

/** Un compte GitHub : token + profil résolu via l'API. */
export interface Account {
  id: string;         // clé stable (le login, ou « compte-N » si non résolu)
  login: string;      // nom d'utilisateur GitHub ('' s'il n'a pas pu être résolu)
  htmlUrl?: string;   // page du profil GitHub
  repoCount?: number; // nombre de dépôts (undefined = encore inconnu)
  token: string;
}

/** Version exposée au panneau : ne contient JAMAIS le token. */
export interface AccountInfo {
  id: string;
  login: string;
  active: boolean;
  htmlUrl?: string;
  repoCount?: number;
}

/** Profil GitHub associé au token (undefined si hors ligne ou token invalide). */
export async function resolveProfile(token: string): Promise<GitHubProfile | undefined> {
  try {
    return await new GitHubService(token).getProfile();
  } catch {
    return undefined;
  }
}

function parse(raw: string | undefined): Account[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((a) => a && typeof a.token === 'string' && a.token.length > 0);
  } catch {
    return [];
  }
}

export async function readAccounts(context: vscode.ExtensionContext): Promise<Account[]> {
  return parse(await context.secrets.get(ACCOUNTS_KEY));
}

export async function writeAccounts(
  context: vscode.ExtensionContext,
  accounts: Account[]
): Promise<void> {
  await context.secrets.store(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export async function getActiveId(context: vscode.ExtensionContext): Promise<string | undefined> {
  return (await context.secrets.get(ACTIVE_KEY)) || undefined;
}

export async function setActiveId(context: vscode.ExtensionContext, id: string): Promise<void> {
  await context.secrets.store(ACTIVE_KEY, id);
}

/** Ancien token unique (versions < 0.0.5) : conservé en secours tant qu'il sert. */
export async function getLegacyToken(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  return (await context.secrets.get(LEGACY_KEY)) || undefined;
}

/** Nom affiché d'un compte (le login peut être vide, ex. ajout hors ligne). */
export function label(a: Account): string {
  return a.login || 'Compte sans nom';
}

export async function clearLegacyToken(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(LEGACY_KEY);
}
