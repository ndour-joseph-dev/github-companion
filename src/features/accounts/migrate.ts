import * as vscode from 'vscode';
import {
  Account,
  readAccounts,
  writeAccounts,
  setActiveId,
  resolveProfile,
  getLegacyToken,
  clearLegacyToken
} from './store';

// Une migration par session suffit : l'opération est idempotente.
let done = false;

/**
 * Migration : l'ancien token unique (versions < 0.0.5) devient le 1er compte.
 * Si le profil n'est pas résoluble (hors ligne), le token est CONSERVÉ tel quel
 * dans l'ancienne clé afin de ne jamais perdre l'accès.
 */
export async function ensureMigrated(context: vscode.ExtensionContext): Promise<void> {
  if (done) return;
  done = true;

  const accounts = await readAccounts(context);
  const legacy = await getLegacyToken(context);
  if (!legacy || accounts.some((a) => a.token === legacy)) return;

  const p = await resolveProfile(legacy);
  const acc: Account = {
    id: p?.login || 'compte-1',
    login: p?.login || '',
    htmlUrl: p?.htmlUrl,
    repoCount: p?.repoCount,
    repos: p?.repos,
    token: legacy
  };
  await writeAccounts(context, [acc, ...accounts]);
  await setActiveId(context, acc.id);
  if (p) await clearLegacyToken(context); // le compte nommé remplace l'ancien
}
