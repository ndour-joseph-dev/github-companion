import * as vscode from 'vscode';
import { redact } from '../../core/sanitize';
import { loadHtml, errorHtml } from './loadHtml';
import { settingsMessage, statusMessage, enrichStatus } from './state';
import { handlePanelMessage, PanelHost } from './messages';

/**
 * Panneau latéral. VS Code peut reconstruire la vue (masquée puis réaffichée) :
 * l'état est renvoyé à chaque « ready », retour de visibilité et commande.
 */
export class GithubCompanionViewProvider implements vscode.WebviewViewProvider, PanelHost {
  private view?: vscode.WebviewView;
  private subs: vscode.Disposable[] = [];
  constructor(readonly context: vscode.ExtensionContext) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    this.subs.forEach((d) => d.dispose()); // une seule souscription vivante
    this.subs = [];
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [media] };
    try {
      webviewView.webview.html = loadHtml(webviewView.webview, media);
    } catch (err: any) {
      webviewView.webview.html = errorHtml(err);
      return;
    }
    this.subs.push(
      webviewView.webview.onDidReceiveMessage((msg) => handlePanelMessage(msg, this)),
      webviewView.onDidChangeVisibility(() => {
        // Rafraîchissement de fond : rien n'attend cette promesse.
        if (webviewView.visible) void this.pushState();
      }),
      webviewView.onDidDispose(() => {
        if (this.view === webviewView) this.view = undefined;
      })
    );
    await this.pushState();
  }

  /**
   * Renvoie l'état complet au webview. L'état git d'abord : il est purement
   * local et instantané, alors que les comptes peuvent dépendre du réseau. Une
   * panne (ou une lenteur) des comptes ne doit jamais laisser l'écran vide.
   */
  async pushState(): Promise<void> {
    await this.refreshStatus();
    await this.sendSettings();
  }

  async sendSettings(): Promise<void> {
    try {
      this.post(await settingsMessage(this.context));
    } catch (err) {
      this.failAccounts(err);
    }
  }

  /** État git local, puis précision du rôle sur le dépôt cloud si utile. */
  async refreshStatus(): Promise<void> {
    const msg = await this.step('l’état du dépôt', () => statusMessage());
    if (!msg) return;
    this.post(msg);
    const refined = await this.step(
      'le rôle du compte sur le dépôt cloud',
      () => enrichStatus(msg, this.context)
    );
    if (refined) this.post(refined);
  }

  /** Exécute une étape d'état : en cas de panne, l'échec reste visible. */
  private async step<T>(what: string, run: () => Promise<T>): Promise<T | undefined> {
    try {
      return await run();
    } catch (err) {
      this.failStatus(what, err);
      return undefined;
    }
  }

  /**
   * Panne des comptes : diagnostic dans la zone des comptes (liste vide = « aucun
   * compte » serait un mensonge), plus un message VS Code. Jamais de token :
   * le texte passe par redact().
   */
  private failAccounts(err: unknown): void {
    const detail = redact((err as Error)?.message ?? err, 'le panneau');
    this.post({ type: 'notice', message: `Comptes indisponibles (${detail})` });
    vscode.window.showErrorMessage(`GitHub Companion : comptes indisponibles — ${detail}`);
  }

  /** Panne de l'état git : la zone d'état porte le diagnostic (jamais muette). */
  private failStatus(what: string, err: unknown): void {
    const detail = redact((err as Error)?.message ?? err, 'le panneau');
    this.post({ type: 'status', state: 'error', message: `${what} indisponible (${detail})` });
    vscode.window.showErrorMessage(`GitHub Companion : ${what} — ${detail}`);
  }

  /** Écrit dans le webview, si la vue existe encore (jamais après destruction). */
  post(message: unknown): void {
    if (this.view) this.view.webview.postMessage(message);
  }
}
