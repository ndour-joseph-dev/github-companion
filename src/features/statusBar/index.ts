import * as vscode from 'vscode';
import { GitService } from '../../git/gitService';
import { getWorkspaceRoot } from '../../core/workspace';
import { buildStatus, RepoStatus } from '../../git/gitStatus';

let item: vscode.StatusBarItem | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

const WARN = 'statusBarItem.warningForeground';

interface View {
  text: string;
  tip: string;
  warn?: boolean;
}

/** Traduit l'état du dépôt en texte + infobulle pour la barre de statut. */
function describe(s: RepoStatus): View {
  if (s.opLabel) {
    return { text: `$(warning) ${s.opLabel}`, warn: true,
      tip: `${s.opLabel} — termine ou annule l'opération avant de synchroniser.` };
  }
  if (s.conflicts > 0) {
    return { text: `$(warning) ${s.conflicts} conflit(s)`, warn: true,
      tip: 'Conflits de merge à résoudre avant toute synchro.' };
  }
  if (s.behind > 0) {
    return { text: `$(cloud-download) ${s.behind} à récupérer`, warn: true,
      tip: `${s.behind} commit(s) distant(s). Clic : ouvrir le panneau.` };
  }
  if (s.ahead > 0) {
    return { text: `$(cloud-upload) ${s.ahead} à pousser`,
      tip: `${s.ahead} commit(s) local(aux) prêt(s) à envoyer.` };
  }
  if (!s.hasRemote) {
    const dirty = s.modified + s.staged;
    return { text: '$(github) Sans remote', warn: true,
      tip: dirty > 0
        ? `Aucun remote origin (${dirty} fichier(s) modifié(s)). Crée un repo GitHub (étape 2).`
        : 'Aucun remote origin : crée un repo GitHub (étape 2).' };
  }
  if (s.modified + s.staged > 0) {
    return { text: `$(pencil) ${s.modified + s.staged} non commité(s)`,
      tip: 'Modifications en attente de commit.' };
  }
  return { text: '$(check) À jour', tip: 'Le dépôt est synchronisé avec le cloud.' };
}

function apply(view: View): void {
  if (!item) return;
  item.text = view.text;
  item.tooltip = view.tip;
  item.color = view.warn ? new vscode.ThemeColor(WARN) : undefined;
  item.show();
}

/** Lit l'état local du dépôt (aucun appel réseau) et met la barre à jour. */
export async function updateStatusBar(): Promise<void> {
  if (!item) return;
  const root = getWorkspaceRoot();
  if (!root) {
    apply({ text: '$(github) Companion', tip: 'Ouvre un dossier de projet.' });
    return;
  }
  try {
    const git = new GitService(root);
    if (!(await git.isRepo())) {
      apply({ text: '$(github) Repo non initialisé', tip: 'Étape 1 : initialiser un repo local.' });
      return;
    }
    apply(describe(await buildStatus(git.raw())));
  } catch {
    item.hide();
  }
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void updateStatusBar(), 150);
}

export function initStatusBar(context: vscode.ExtensionContext): void {
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = 'githubCompanion.openPanel';
  item.name = 'GitHub Companion';
  context.subscriptions.push(
    item,
    vscode.window.onDidChangeActiveTextEditor(schedule),
    vscode.window.onDidChangeWindowState(schedule),
    vscode.workspace.onDidChangeWorkspaceFolders(schedule)
  );
  void updateStatusBar();
}
