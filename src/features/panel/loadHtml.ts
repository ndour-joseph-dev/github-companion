import * as fs from 'fs';
import * as vscode from 'vscode';
import { redact } from '../../core/sanitize';

/** Charge media/panel.html et remplace les jetons __X__ par les URI webview. */
export function loadHtml(webview: vscode.Webview, media: vscode.Uri): string {
  const uri = (name: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(media, name)).toString();
  const htmlPath = vscode.Uri.joinPath(media, 'panel.html');
  return fs.readFileSync(htmlPath.fsPath, 'utf8')
    .replaceAll('__CSP_SOURCE__', webview.cspSource)
    .replaceAll('__STYLE_URI__', uri('panel.css'))
    .replaceAll('__BADGE_CSS__', uri('badge.css'))
    .replaceAll('__ACCOUNTS_CSS__', uri('accounts.css'))
    .replaceAll('__CORE_JS__', uri('panel.js'))
    .replaceAll('__STATUS_JS__', uri('status.js'))
    .replaceAll('__REPO_JS__', uri('repo.js'))
    .replaceAll('__ACCOUNTS_JS__', uri('accounts.js'));
}

/** Page d'erreur du panneau : le message est nettoyé de tout secret. */
export function errorHtml(err: any): string {
  return '<html><body style="padding:12px;color:var(--vscode-errorForeground)">' +
    '<p>Panneau impossible à charger.</p><pre>' +
    redact(err?.message ?? err) + '</pre></body></html>';
}

