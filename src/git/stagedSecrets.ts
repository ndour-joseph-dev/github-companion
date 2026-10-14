import { SimpleGit } from 'simple-git';
import { secretShapes } from '../core/security/mask';
import { hasNoCommitsYet } from './gitGuards';

/** Noms de fichiers qui ne devraient jamais partir dans un dépôt. */
const RISKY: RegExp[] = [
  /(^|\/)\.env(\.|$)/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.htpasswd$/i,
  /(^|\/)credentials(\.|$)/i,
  /(^|\/)secrets?\.(json|ya?ml|env)$/i
];

const MAX_DIFF = 400 * 1024;

export interface StagedScan {
  paths: string[]; // fichiers sensibles par leur nom
  contentHits: string[]; // fichiers dont une ligne ajoutée ressemble à un secret
  truncated: boolean; // analyse partielle (diff trop volumineux)
}

/**
 * Analyse l'INDEX (ce qui partirait au prochain commit) — lecture seule.
 * Aucun contenu n'est conservé : seuls des NOMS de fichiers sont retournés.
 */
export async function scanStaged(git: SimpleGit): Promise<StagedScan> {
  const out: StagedScan = { paths: [], contentHits: [], truncated: false };
  const names = (await git.raw(['diff', '--cached', '--name-only']))
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  out.paths = names.filter((n) => RISKY.some((re) => re.test(n)));

  let diff = '';
  try {
    diff = await git.raw(['diff', '--cached', '--unified=0']);
  } catch {
    return out;
  }
  if (diff.length > MAX_DIFF) {
    out.truncated = true;
    diff = diff.slice(0, MAX_DIFF);
  }
  let file = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      file = line.slice(6).trim();
      continue;
    }
    if (!file || !line.startsWith('+') || line.startsWith('+++')) continue;
    if (secretShapes(line).length > 0 && !out.contentHits.includes(file)) {
      out.contentHits.push(file);
    }
  }
  return out;
}

/** true si l'analyse a trouvé du contenu à risque. */
export function hasRisk(scan: StagedScan): boolean {
  return scan.paths.length + scan.contentHits.length > 0;
}

/**
 * Retire des fichiers de l'index SANS toucher au disque (git reset -- …).
 * Dépôt sans commit : on retombe sur « git rm --cached » (aucun fichier suivi
 * n'existe encore, donc rien ne peut disparaître d'un historique).
 */
export async function unstage(git: SimpleGit, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await git.raw(['reset', '--', ...paths]);
  } catch {
    if (await hasNoCommitsYet(git)) {
      await git.raw(['rm', '--cached', '-r', '--', ...paths]);
      return;
    }
    throw new Error(
      'Désindexation impossible : retire ces fichiers de l’index (palette Git) avant de commiter.'
    );
  }
}
