import * as vscode from 'vscode';

const KEY = 'githubCompanion.journal';
const MAX = 50;

/** Une opération déclenchée par l'extension (aucun secret, jamais de token). */
export interface JournalEntry {
  at: number;
  op: string; // 'commit' | 'push' | 'pull' | 'init' | 'undo'…
  ok: boolean;
  before?: string; // SHA de HEAD avant l'opération
  after?: string; // SHA de HEAD après
  detail?: string; // précision courte (branche, nb de commits…)
}

export function readJournal(context: vscode.ExtensionContext): JournalEntry[] {
  const raw = context.workspaceState.get<JournalEntry[]>(KEY);
  return Array.isArray(raw) ? raw : [];
}

/**
 * Ajoute une entrée. L'historique sert à deux choses : transparence totale
 * (l'utilisateur voit ce que l'extension a exécuté) et annulation sûre.
 */
export async function recordOp(
  context: vscode.ExtensionContext | undefined,
  entry: JournalEntry
): Promise<void> {
  if (!context) return;
  try {
    const list = [...readJournal(context), entry].slice(-MAX);
    await context.workspaceState.update(KEY, list);
  } catch {
    /* l'historique ne doit jamais faire échouer une action */
  }
}

/** Dernière entrée d'une opération donnée (la plus récente). */
export function lastEntry(
  context: vscode.ExtensionContext,
  op: string
): JournalEntry | undefined {
  return [...readJournal(context)].reverse().find((e) => e.op === op);
}
