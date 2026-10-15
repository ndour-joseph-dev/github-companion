import * as vscode from 'vscode';
import { GitHubProfile } from '../../github/githubService';
import { Account, label, readAccounts, writeAccounts, resolveProfile } from './store';
import { listAccounts } from './core';
import { forgetRepoAccess } from './repoMatch';

/**
 * Durée de validité d'une photo de la liste des dépôts : au-delà, GitHub est
 * réinterrogé. La liste est distante (un dépôt peut être créé, renommé ou
 * supprimé à tout moment) : elle ne se déduit jamais du dossier local.
 */
export const REPOS_TTL_MS = 5 * 60 * 1000;

/** Deux requêtes rapprochées pour un même compte n'apportent rien (réseau, quota). */
const MIN_RETRY_MS = 60 * 1000;

/** Dernier essai par compte (id → horodatage), partagé par tous les appelants. */
const lastAttempt = new Map<string, number>();

/** Un compte vient-il d'être interrogé ? (panneau reconstruit ou réaffiché) */
export function attemptedRecently(id: string, now = Date.now()): boolean {
  const at = lastAttempt.get(id);
  return at !== undefined && now - at < MIN_RETRY_MS;
}

/**
 * Ce compte a-t-il besoin d'une nouvelle photo ?
 * Oui s'il n'a jamais été résolu (login, total ou liste inconnus), ou si sa
 * liste date de plus de REPOS_TTL_MS — ou n'a pas de date du tout (photo
 * enregistrée par une version antérieure).
 */
export function needsRefresh(account: Account, now = Date.now()): boolean {
  if (!account.login || account.repoCount === undefined || account.repos === undefined) return true;
  return now - (account.reposUpdatedAt ?? 0) >= REPOS_TTL_MS;
}

/**
 * Applique un profil fraîchement résolu à un compte déjà enregistré.
 *
 * Le nombre de dépôts vient de la liste lorsqu'elle est revenue : c'est le seul
 * total exact (l'API exclut les forks de `public_repos`). Si le listage échoue,
 * la photo précédente est CONSERVÉE telle quelle — mieux vaut une liste datée
 * qu'une liste vide qui ferait croire à un compte sans dépôt — et la date n'est
 * pas posée : on n'a rien photographié.
 *
 * L'identifiant du compte n'est jamais renommé : c'est la clé du compte actif,
 * et un renommage côté GitHub ne doit pas le perdre de vue.
 *
 * Retourne true si la liste des dépôts a réellement été mise à jour.
 */
function applyProfile(account: Account, p: GitHubProfile, now = Date.now()): boolean {
  account.login = p.login;
  account.htmlUrl = p.htmlUrl;
  if (p.repos === undefined) {
    // Nom et page à jour, mais aucune liste reçue : rien à dater.
    if (account.repoCount === undefined) account.repoCount = p.repoCount;
    return false;
  }
  account.repos = p.repos;
  account.repoCount = p.repoCount;
  account.reposUpdatedAt = now;
  return true;
}

/** Ce qu'un rafraîchissement a obtenu, et ce qu'il n'a pas pu obtenir. */
interface RefreshOutcome {
  refreshed: number; // comptes dont la liste de dépôts est à jour
  failed: number;    // comptes que GitHub n'a pas confirmés (photo conservée)
}

/**
 * Réinterroge GitHub pour les comptes visés (tous par défaut).
 * Utilisé par le rafraîchissement automatique (photo périmée) et par le bouton
 * « Rafraîchir » du panneau : la liste ne se devine pas, elle se demande.
 */
export async function refreshProfiles(
  context: vscode.ExtensionContext,
  ids?: string[]
): Promise<RefreshOutcome> {
  const accounts = await readAccounts(context);
  const targets = ids ? accounts.filter((a) => ids.includes(a.id)) : accounts;
  const outcome: RefreshOutcome = { refreshed: 0, failed: 0 };
  if (targets.length === 0) return outcome;
  const now = Date.now();
  for (const account of targets) {
    lastAttempt.set(account.id, now);
    const p = await resolveProfile(account.token);
    if (p && applyProfile(account, p, now)) outcome.refreshed++;
    else outcome.failed++;
  }
  await writeAccounts(context, accounts);
  return outcome;
}

/** Détail lisible d'un état des comptes : « alice · 3 dépôt(s) ». */
function summarize(accounts: Account[]): string {
  return accounts
    .map((a) => (a.repos ? `${label(a)} · ${a.repos.length} dépôt(s)` : `${label(a)} · liste indisponible`))
    .join(', ');
}

/**
 * Action « Rafraîchir » (bouton du panneau, commande palette) : repose la
 * question à GitHub et le DIT, au lieu de laisser croire à une liste figée.
 */
export async function runRefresh(context: vscode.ExtensionContext): Promise<void> {
  if ((await listAccounts(context)).length === 0) {
    vscode.window.showInformationMessage(
      'Aucun compte GitHub enregistré : ajoute un compte pour consulter ses dépôts.'
    );
    return;
  }
  const outcome = await refreshProfiles(context);
  // Le dépôt du dossier ouvert a pu être supprimé sur GitHub : le verdict
  // d'accès mémorisé (10 min) ne doit pas survivre à un rafraîchissement demandé.
  forgetRepoAccess();
  const detail = summarize(await listAccounts(context));
  if (outcome.failed === 0) {
    vscode.window.showInformationMessage(`Dépôts à jour — ${detail}.`);
  } else if (outcome.refreshed === 0) {
    vscode.window.showWarningMessage(
      `GitHub n'a pas répondu : la liste affichée reste la dernière connue — ${detail}.`
    );
  } else {
    vscode.window.showWarningMessage(
      `Dépôts à jour pour une partie des comptes (les autres n'ont pas répondu) — ${detail}.`
    );
  }
}
