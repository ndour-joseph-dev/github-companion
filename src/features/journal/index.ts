import * as vscode from 'vscode';
import { JournalEntry, readJournal } from './store';
import { undoCommit } from './undo';

export * from './store';

function labelOf(e: JournalEntry): string {
  const time = new Date(e.at).toLocaleTimeString();
  const shas = e.before && e.after ? ` ${e.before.slice(0, 7)}→${e.after.slice(0, 7)}` : '';
  const detail = e.detail ? ` · ${e.detail}` : '';
  return `${e.ok ? '$(check)' : '$(error)'} ${time} · ${e.op}${shas}${detail}`;
}

/**
 * Historique des actions de l'extension (transparence totale) : ce qui a été
 * exécuté, quand, et uniquement ce qui est annulable sans risque peut l'être.
 */
export function registerJournalCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('githubCompanion.journal', async () => {
      const entries = [...readJournal(context)].reverse();
      if (entries.length === 0) {
        void vscode.window.showInformationMessage(
          "Aucune action de l'extension enregistrée pour ce projet."
        );
        return;
      }
      const picked = await vscode.window.showQuickPick(
        entries.map((entry) => ({ label: labelOf(entry), entry })),
        {
          title: 'Actions GitHub Companion (plus récentes en premier)',
          placeHolder: 'Choisis une action pour la voir ou l’annuler'
        }
      );
      if (!picked) return;
      const e = picked.entry;
      if (e.op === 'commit') {
        const confirm = await vscode.window.showWarningMessage(
          `Annuler le commit ${e.after?.slice(0, 7)} ? Tes fichiers resteront intacts.`,
          { modal: true },
          'Oui, annuler ce commit',
          'Fermer'
        );
        if (confirm === 'Oui, annuler ce commit') await undoCommit(e);
        return;
      }
      void vscode.window.showInformationMessage(
        `Action « ${e.op} » du ${new Date(e.at).toLocaleString()} : rien à annuler ` +
          '(aucune suppression de fichier par l’extension).'
      );
    })
  );
}
