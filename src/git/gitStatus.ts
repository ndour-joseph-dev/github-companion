import { SimpleGit } from 'simple-git';
import { getLastRemoteCheck } from '../features/checkUpdates';
import { RemoteCommit } from './remoteCheck';
import { stripCredentials } from '../core/sanitize';
import { repoRefFromUrl, RepoRef } from './repoRef';
import { opLabel } from './repoState';

export interface RepoStatus {
  branch: string | null;
  isDetached: boolean;
  hasRemote: boolean;
  remoteUrl?: string;
  /** Dépôt cloud associé au remote « origin » (undefined si local ou absent) */
  repo?: RepoRef;
  modified: number;
  staged: number;
  ahead: number;
  behind: number;
  conflicts: number;
  lastCommit?: string;
  lastAuthor?: string;
  /** Date du dernier commit (ms) : le panneau affiche la date et l'heure. */
  lastCommitAt?: number;
  /** Infos issues du dernier "Vérifier" explicite */
  remoteCommits?: RemoteCommit[];
  checkedAt?: number;
  hasTracking?: boolean;
  /** Branche distante réellement utilisée (undefined si aucune vérifiée) */
  upstream?: string;
  /** Opération Git interrompue (« Fusion en cours »…) : ne rien automatiser */
  opLabel?: string;
}

function toWebUrl(remoteUrl: string): string {
  return remoteUrl
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\.git$/, '');
}

export async function buildStatus(git: SimpleGit): Promise<RepoStatus> {
  const status = await git.status();
  const remotes = await git.getRemotes(true);
  const origin = remotes.find((r) => r.name === 'origin');
  const originUrl = origin?.refs?.fetch;

  let lastCommit: string | undefined;
  let lastAuthor: string | undefined;
  let lastCommitAt: number | undefined;
  let lastCommitHash: string | undefined;
  try {
    const log = await git.log({ maxCount: 1 });
    if (log.latest) {
      lastCommit = log.latest.message.split('\n')[0];
      lastAuthor = log.latest.author_name;
      lastCommitHash = log.latest.hash;
      const when = Date.parse(log.latest.date);
      // Date illisible : on laisse undefined plutôt qu'un NaN dans l'état.
      if (!Number.isNaN(when)) lastCommitAt = when;
    }
  } catch {
    /* aucun commit */
  }

  // Le verdict distant mémorisé ne vaut que pour CE dépôt et CE commit : après
  // un changement de remote ou un commit local, le comparer à l'affichage
  // reviendrait à afficher l'état d'un autre dépôt (ou d'un autre moment).
  const remote = getLastRemoteCheck({ remoteUrl: originUrl, head: lastCommitHash });
  // Prefer explicit check results for behind/ahead when available
  const behind = remote ? remote.behind : status.behind;
  // "ahead" vient du status live dès qu'un upstream existe (sinon du dernier check)
  const ahead = status.tracking ? status.ahead : remote ? remote.ahead : 0;

  return {
    branch: status.current,
    opLabel: await opLabel(git),
    isDetached: status.detached,
    hasRemote: !!origin,
    // stripCredentials : une URL de remote ne doit jamais transporter de token.
    remoteUrl: originUrl ? stripCredentials(toWebUrl(originUrl)) : undefined,
    repo: originUrl ? repoRefFromUrl(originUrl) : undefined,
    modified: status.modified.length + status.not_added.length,
    staged: status.staged.length,
    ahead,
    behind,
    conflicts: status.conflicted.length,
    lastCommit,
    lastAuthor,
    lastCommitAt,
    remoteCommits: remote?.commits,
    checkedAt: remote?.checkedAt,
    hasTracking: remote ? remote.hasTracking : !!status.tracking,
    upstream: remote?.upstream
  };
}

