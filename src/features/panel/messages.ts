import * as vscode from 'vscode';
import { redact } from '../../core/sanitize';
import { updateStatusBar } from '../statusBar';
import { handleAccountAction, forgetRepoAccess, runRefresh } from '../accounts';
import { runInitLocalRepo } from '../initLocalRepo';
import { runCreateRepo } from '../createRepo';
import { runCommit } from '../commit';
import { runPush } from '../push';
import { runPull } from '../pull';
import { runCheckUpdates } from '../checkUpdates';
import { externalUri } from './state';

/** Ce que le traitement des messages doit pouvoir appeler sur le panneau. */
export interface PanelHost {
  context: vscode.ExtensionContext;
  post(message: unknown): void;
  pushState(): Promise<void>;
  sendSettings(): Promise<void>;
  refreshStatus(): Promise<void>;
}

/**
 * Traite un message du webview. Toute action part d'un clic explicite :
 * l'extension décide, met à jour la barre de statut puis l'état du panneau.
 */
export async function handlePanelMessage(msg: any, host: PanelHost): Promise<void> {
  try {
    switch (msg.type) {
      case 'ready': await host.pushState(); return; // le webview vient de se charger
      case 'initLocalRepo': await runInitLocalRepo(); break;
      case 'createRepo':
        await runCreateRepo(host.context);
        forgetRepoAccess(); // le remote vient peut-être de changer de propriétaire
        break;
      case 'commit':
        await runCommit(msg.message, () => host.post({ type: 'clearCommitMessage' }), host.context);
        break;
      case 'push': await runPush(host.context); break;
      case 'pull': await runPull(host.context); break;
      case 'checkUpdates': await runCheckUpdates(host.context); break;
      case 'refresh':
        // La liste des dépôts est distante : un dépôt a pu être créé ou supprimé
        // sur GitHub sans que le dossier local en sache quoi que ce soit. On
        // repose la question, puis on renvoie l'état des comptes au panneau.
        await runRefresh(host.context);
        await host.sendSettings();
        break;
      case 'account':
        await handleAccountAction(host.context, msg.action, msg.id);
        await host.sendSettings();
        break;
      case 'setAutoSync':
        await vscode.workspace.getConfiguration('githubCompanion')
          .update('autoSync', !!msg.value, vscode.ConfigurationTarget.Global);
        return;
      case 'openExternal': {
        const target = externalUri(msg.url);
        if (target) vscode.env.openExternal(target);
        return;
      }
    }
    await host.refreshStatus();
    await updateStatusBar();
  } catch (err: any) {
    vscode.window.showErrorMessage(`GitHub Companion : ${redact(err?.message ?? err, 'le panneau')}`);
  }
}
