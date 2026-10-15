import { RemoteCheckResult } from '../../git/remoteCheck';
import { repoRefFromUrl } from '../../git/repoRef';

/**
 * Mémoire du dernier « Vérifier les mises à jour ».
 *
 * Une vérification distante coûte un fetch : la garder évite de la refaire pour
 * rien. Mais un verdict de synchronisation n'est vrai QUE pour un dépôt et un
 * HEAD donnés :
 *   — après suppression du dépôt GitHub puis liaison à un dépôt neuf, l'ancien
 *     verdict (« à jour », « 0 commit à récupérer ») décrivait un dépôt disparu ;
 *   — après un commit local, la comparaison ahead/behind qu'il porte est périmée.
 * D'où les trois conditions ci-dessous : le verdict ne ressort que pour le même
 * dépôt, le même HEAD, et tant qu'il n'est pas trop vieux.
 *
 * Ce module n'importe PAS `vscode` : il est testable tel quel, et les appelants
 * (état du panneau, push) partagent la même instance.
 */

/**
 * Au-delà, le verdict n'est plus présenté comme un fait : le panneau montre
 * l'âge (« Vérifié il y a… ») et l'utilisateur relance « Vérifier ». Un état
 * distant vieux d'une heure n'a aucune raison d'être encore affirmé.
 */
const REMOTE_TTL_MS = 10 * 60 * 1000;

/** Ce que le verdict décrit : le dépôt cloud (owner/name) interrogé. */
interface CacheEntry {
  at: number;
  repo: string | null;
  result: RemoteCheckResult;
}

let entry: CacheEntry | null = null;

/** Contexte d'un appel : quel dépôt est affiché, et où en est le HEAD local. */
export interface RemoteCheckScope {
  remoteUrl?: unknown;
  /** SHA de HEAD au moment de l'affichage (undefined = aucun commit encore). */
  head?: string;
}

/** Clé du dépôt déduite de l'URL du remote (null si l'URL n'est pas distante). */
function repoKey(remoteUrl: unknown): string | null {
  return repoRefFromUrl(remoteUrl)?.fullName ?? null;
}

/** Enregistre un verdict frais, rattaché au dépôt qui l'a produit. */
export function rememberRemoteCheck(result: RemoteCheckResult, remoteUrl: unknown): void {
  entry = { at: result.checkedAt, repo: repoKey(remoteUrl), result };
}

/**
 * Dernier verdict, s'il décrit encore la situation demandée — sinon null.
 * Sans périmètre fourni, seul l'âge est vérifié.
 */
export function getRemoteCheck(
  scope: RemoteCheckScope = {},
  now = Date.now()
): RemoteCheckResult | null {
  if (!entry) return null;
  if (now - entry.at >= REMOTE_TTL_MS) return null;
  // Autre dépôt : comparer les commits de l'ancien n'a aucun sens.
  if (scope.remoteUrl !== undefined && repoKey(scope.remoteUrl) !== entry.repo) return null;
  // HEAD déplacé depuis le verdict (commit, réinitialisation) : à revérifier.
  if (scope.head && entry.result.head && scope.head !== entry.result.head) return null;
  return entry.result;
}

/** Oublie le verdict (changement de remote, push, pull…). */
export function clearRemoteCheck(): void {
  entry = null;
}
