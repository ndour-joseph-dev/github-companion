import { SimpleGit } from 'simple-git';
import { getRemoteUrl } from './gitGuards';

/** Référence « cloud » d'un dépôt, déduite de l'URL du remote (aucun réseau). */
export interface RepoRef {
  host: string;     // ex. github.com
  owner: string;    // ex. octocat
  name: string;     // ex. mon-projet
  fullName: string; // owner/name
  webUrl: string;   // page GitHub du dépôt
}

/** Sépare hôte et chemin d'une URL de remote (https, ssh, git@…) ; undefined si local. */
function hostAndPath(raw: string): { host: string; path: string } | undefined {
  if (raw.includes('://')) {
    const rest = raw.slice(raw.indexOf('://') + 3);
    const slash = rest.indexOf('/');
    return slash < 0 ? undefined : { host: rest.slice(0, slash), path: rest.slice(slash + 1) };
  }
  const colon = raw.indexOf(':');
  if (colon < 0 || raw.startsWith('/') || raw.startsWith('.')) return undefined;
  return { host: raw.slice(0, colon), path: raw.slice(colon + 1) }; // scp-like git@host:owner/repo
}

/** Nom d'hôte sans identifiants ni port ('' si l'URL n'est pas distante). */
function hostOf(raw: string): string {
  return (hostAndPath(raw)?.host.split('@').pop() || '').replace(/:\d+$/, '');
}

/**
 * Extrait owner/name d'une URL de remote. Renvoie undefined pour un chemin
 * local (file://, /home/…, ../…) : aucun dépôt cloud à afficher.
 */
export function parseRepoUrl(url: unknown): { owner: string; name: string } | undefined {
  const raw = String(url ?? '').trim();
  const parts = hostAndPath(raw);
  if (!parts || !hostOf(raw).includes('.')) return undefined; // pas un nom d'hôte
  const segments = parts.path.replace(/\.git$/i, '').split('/').filter(Boolean);
  if (segments.length < 2) return undefined;
  return { owner: segments[0], name: segments[1] };
}

/** Référence complète, prête pour l'affichage (webUrl sans identifiants). */
export function repoRefFromUrl(url: unknown): RepoRef | undefined {
  const raw = String(url ?? '').trim();
  const parsed = parseRepoUrl(raw);
  if (!parsed) return undefined;
  const host = hostOf(raw);
  const fullName = `${parsed.owner}/${parsed.name}`;
  return { host, owner: parsed.owner, name: parsed.name, fullName,
    webUrl: `https://${host}/${fullName}` };
}

/** Dépôt cloud associé au remote donné (par défaut « origin »). */
export async function getRepoRef(
  git: SimpleGit,
  remote = 'origin'
): Promise<RepoRef | undefined> {
  return repoRefFromUrl(await getRemoteUrl(git, remote));
}
