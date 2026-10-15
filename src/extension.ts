import * as vscode from 'vscode';
import { GithubCompanionViewProvider } from './features/panel';
import { initStatusBar, updateStatusBar } from './features/statusBar';
import { runInitLocalRepo } from './features/initLocalRepo';
import { runCreateRepo } from './features/createRepo';
import { runCommitPrompt } from './features/commit';
import { runPush } from './features/push';
import { runPull } from './features/pull';
import { runCheckUpdates } from './features/checkUpdates';
import { resetToken, runAddAccount, runSwitchAccount, runRefresh } from './features/accounts';
import { registerSecurityCommands } from './core/security';
import { registerJournalCommand } from './features/journal';

export function activate(context: vscode.ExtensionContext) {
  const provider = new GithubCompanionViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('githubCompanion.panel', provider)
  );

  initStatusBar(context);
  // Priorité n°1 : surveiller toute fuite de token et avertir l'utilisateur.
  registerSecurityCommands(context);
  // Transparence : historique des actions de l'extension (+ annulation sûre).
  registerJournalCommand(context);

  // Chaque action rafraîchit la barre de statut et le panneau (état local).
  const refresh = (fn: () => unknown) => async () => {
    await fn();
    await updateStatusBar();
    await provider.pushState();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('githubCompanion.openPanel', () => {
      vscode.commands.executeCommand('workbench.view.extension.githubCompanion');
    }),
    vscode.commands.registerCommand('githubCompanion.initLocalRepo', refresh(runInitLocalRepo)),
    vscode.commands.registerCommand('githubCompanion.createRepo', refresh(() => runCreateRepo(context))),
    vscode.commands.registerCommand('githubCompanion.commit', refresh(() => runCommitPrompt(context))),
    vscode.commands.registerCommand('githubCompanion.push', refresh(() => runPush(context))),
    vscode.commands.registerCommand('githubCompanion.pull', refresh(() => runPull(context))),
    vscode.commands.registerCommand('githubCompanion.checkUpdates', refresh(() => runCheckUpdates(context))),
    vscode.commands.registerCommand('githubCompanion.refresh', refresh(() => runRefresh(context))),
    vscode.commands.registerCommand('githubCompanion.setToken', refresh(() => resetToken(context))),
    vscode.commands.registerCommand('githubCompanion.addAccount', refresh(() => runAddAccount(context))),
    vscode.commands.registerCommand('githubCompanion.switchAccount', refresh(() => runSwitchAccount(context)))
  );
}
export function deactivate() {}
