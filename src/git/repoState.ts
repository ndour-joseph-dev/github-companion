import * as fs from 'fs';
import * as path from 'path';
import { SimpleGit } from 'simple-git';
import { hasNoCommitsYet } from './gitGuards';

export type OpKind = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect';

export interface RepoState {
  op?: OpKind; // opération interrompue (fusion, rebase…)
  dirty: number; // modifications non commitées (hors conflits)
  conflicts: number;
  detached: boolean;
  unborn: boolean; // aucun commit encore
}

const MARKERS: Array<[string, OpKind]> = [
  ['MERGE_HEAD', 'merge'],
  ['CHERRY_PICK_HEAD', 'cherry-pick'],
  ['REVERT_HEAD', 'revert'],
  ['BISECT_LOG', 'bisect'],
  ['rebase-merge', 'rebase'],
  ['rebase-apply', 'rebase']
];

/** Répertoire .git absolu (undefined si indéterminable). */
async function gitDir(git: SimpleGit): Promise<string | undefined> {
  try {
    return (await git.raw(['rev-parse', '--absolute-git-dir'])).trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Une opération Git interrompue est-elle en cours ? (lecture seule, rapide) */
export async function detectOp(git: SimpleGit): Promise<OpKind | undefined> {
  const dir = await gitDir(git);
  if (!dir) return undefined;
  for (const [file, op] of MARKERS) {
    if (fs.existsSync(path.join(dir, file))) return op;
  }
  return undefined;
}

/** État complet du dépôt : opération en cours + propreté + position de HEAD. */
export async function readRepoState(git: SimpleGit): Promise<RepoState> {
  const state: RepoState = { dirty: 0, conflicts: 0, detached: false, unborn: false };
  state.op = await detectOp(git);
  try {
    const status = await git.status();
    state.dirty = status.modified.length + status.staged.length + status.not_added.length;
    state.conflicts = status.conflicted.length;
    state.detached = status.detached;
  } catch {
    /* dépôt illisible : on reste prudent, tout est à zéro */
  }
  state.unborn = await hasNoCommitsYet(git);
  return state;
}

export interface StateAdvice {
  label: string;
  advice: string;
  abort?: string[]; // annulation proposée (jamais destructive pour les fichiers)
}

const ADVICE: Record<OpKind, StateAdvice> = {
  merge: { label: 'Fusion en cours', advice: 'Résous les conflits puis termine le commit, ou annule la fusion.', abort: ['merge', '--abort'] },
  rebase: { label: 'Rebase en cours', advice: 'Termine (git rebase --continue) ou annule le rebase.', abort: ['rebase', '--abort'] },
  'cherry-pick': { label: 'Cherry-pick en cours', advice: 'Résous puis continue, ou annule.', abort: ['cherry-pick', '--abort'] },
  revert: { label: 'Revert en cours', advice: 'Résous puis continue, ou annule.', abort: ['revert', '--abort'] },
  bisect: { label: 'Bisect en cours', advice: 'Termine (git bisect reset) ou annule.', abort: ['bisect', 'reset'] }
};

const NONE: StateAdvice = { label: 'Aucune opération en cours', advice: '' };

/** Libellé, conseil et annulation possible pour une opération donnée. */
export function advice(op?: OpKind): StateAdvice {
  return op ? ADVICE[op] : NONE;
}

/** Libellé court d'une opération en cours (barre d'état, panneau). */
export async function opLabel(git: SimpleGit): Promise<string | undefined> {
  const op = await detectOp(git);
  return op ? ADVICE[op].label : undefined;
}
