import { SimpleGit } from 'simple-git';
import { fetchWithAuth } from './gitAuth';

export interface RemoteCommit {
  author: string;
  when: string;
  subject: string;
}

export interface RemoteCheckResult {
  behind: number;
  ahead: number;
  commits: RemoteCommit[];
  hasTracking: boolean;
  upstream?: string;
  checkedAt: number; // Date.now()
}

/** true si la ref existe localement (branche distante déjà récupérée).
 *  On n'utilise PAS --quiet : simple-git détecte l'échec via stderr,
 *  or --quiet supprimerait ce message (la commande serait vue comme OK). */
async function refExists(git: SimpleGit, ref: string): Promise<boolean> {
  try {
    await git.raw(['rev-parse', '--verify', ref]);
    return true;
  } catch {
    return false;
  }
}

function emptyResult(): RemoteCheckResult {
  return { behind: 0, ahead: 0, commits: [], hasTracking: false, checkedAt: Date.now() };
}

/**
 * fetch (refs distantes seulement) + comparaison HEAD..upstream.
 * Ne touche jamais au working tree.
 */
export async function fetchAndCompare(
  git: SimpleGit,
  token: string
): Promise<RemoteCheckResult> {
  await fetchWithAuth(git, token);

  const status = await git.status();
  const branch = status.current;
  let upstream = status.tracking || undefined;
  let hasTracking = !!upstream;

  // Tracking déclaré mais branche distante absente (remote vide, branche supprimée)
  if (upstream && !(await refExists(git, upstream))) {
    upstream = undefined;
    hasTracking = false;
  }

  // Pas de tracking utilisable : tenter origin/<branche> après le fetch
  if (!upstream && branch && (await refExists(git, `origin/${branch}`))) {
    upstream = `origin/${branch}`;
    hasTracking = false;
  }

  if (!upstream) return emptyResult();

  const behindStr = (await git.raw(['rev-list', '--count', `HEAD..${upstream}`])).trim();
  const aheadStr = (await git.raw(['rev-list', '--count', `${upstream}..HEAD`])).trim();
  const behind = Number.parseInt(behindStr, 10) || 0;
  const ahead = Number.parseInt(aheadStr, 10) || 0;

  const commits: RemoteCommit[] = [];
  if (behind > 0) {
    const log = await git.raw([
      'log',
      `HEAD..${upstream}`,
      '--format=%an|%ar|%s',
      '-n',
      '10'
    ]);
    for (const line of log.trim().split('\n')) {
      if (!line) continue;
      const [author, when, ...rest] = line.split('|');
      commits.push({
        author: author || '?',
        when: when || '',
        subject: rest.join('|') || ''
      });
    }
  }

  return {
    behind,
    ahead,
    commits,
    hasTracking,
    upstream,
    checkedAt: Date.now()
  };
}
