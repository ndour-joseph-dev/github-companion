import { AsyncLocalStorage } from 'async_hooks';
import * as fs from 'fs';
import * as path from 'path';

const inside = new AsyncLocalStorage<boolean>();
let tail: Promise<unknown> = Promise.resolve();

/**
 * Une seule opération Git de l'extension à la fois : deux commandes
 * concurrentes (ex. push pendant un pull) peuvent corrompre l'index
 * (.git/index.lock) — donc on les met systématiquement en file d'attente.
 *
 * Réentrant : un enchaînement interne (commit → push auto) partage le même
 * verrou au lieu de se bloquer lui-même.
 */
export function withGitLock<T>(fn: () => Promise<T>): Promise<T> {
  if (inside.getStore()) return fn();
  const run = () => inside.run(true, fn);
  const next = tail.then(run, run);
  // La file ne doit jamais rester bloquée par une opération en échec.
  tail = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

/**
 * Verrou git laissé par un process interrompu. On ne le SUPPRIME JAMAIS
 * nous-mêmes (le supprimer à tort casserait un git légitime en cours) :
 * on refuse simplement d'agir et on explique quoi faire.
 */
export function staleLock(root: string): string | undefined {
  const lock = path.join(root, '.git', 'index.lock');
  try {
    const age = Date.now() - fs.statSync(lock).mtimeMs;
    return age > 5000 ? lock : undefined; // trop récent : git travaille peut-être
  } catch {
    return undefined;
  }
}
