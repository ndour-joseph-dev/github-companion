import * as vscode from 'vscode';
import { readAccounts, writeAccounts, resolveProfile } from './store';

// Un seul essai par compte et par session : évite de figer le panneau hors ligne.
const tried = new Set<string>();

/**
 * Complète les comptes dont le profil GitHub n'a pas encore été résolu :
 * comptes ajoutés hors ligne, ou créés avant l'arrivée de la page profil.
 * Aucune requête réseau si l'information est déjà présente.
 */
export async function ensureProfiles(context: vscode.ExtensionContext): Promise<void> {
  const accounts = await readAccounts(context);
  const todo = accounts.filter(
    (a) => (!a.login || a.repoCount === undefined) && !tried.has(a.id)
  );
  if (todo.length === 0) return;
  todo.forEach((a) => tried.add(a.id));

  let changed = false;
  for (const a of todo) {
    const p = await resolveProfile(a.token);
    if (!p) continue;
    a.login = p.login;
    a.htmlUrl = p.htmlUrl;
    a.repoCount = p.repoCount;
    changed = true;
  }
  if (changed) await writeAccounts(context, accounts);
}
