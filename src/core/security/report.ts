import * as vscode from 'vscode';
import { Interception, onSecretIntercepted } from '../sanitize';
import { Leak, describeLeaks } from './scan';

const TOKENS_URL = 'https://github.com/settings/tokens';

let channel: vscode.OutputChannel | undefined;
let item: vscode.StatusBarItem | undefined;
const interceptions = new Map<string, number>();
let leaks: Leak[] = [];
const warned = new Set<string>();

function log(line: string): void {
  channel?.appendLine(`[${new Date().toLocaleTimeString()}] ${line}`);
}

function refresh(): void {
  if (!item) return;
  if (interceptions.size + leaks.length === 0) {
    item.hide();
    return;
  }
  item.text = '$(shield) Sécurité du token : action requise';
  item.tooltip =
    "GitHub Companion a détecté une exposition possible d'identifiant. " +
    "Clique pour lancer l'audit et voir le détail.";
  item.show();
}

/** Boutons de l'alerte : informer ou régénérer — jamais d'action destructive. */
function handleChoice(choice?: string): void {
  if (choice === 'Voir le détail') {
    void vscode.commands.executeCommand('githubCompanion.securityAudit');
  }
  if (choice === 'Régénérer le token') void vscode.env.openExternal(vscode.Uri.parse(TOKENS_URL));
}

/** Un secret a été intercepté AVANT affichage : on avertit (une fois par type). */
function noteInterception(info: Interception): void {
  const key = `${info.where}| ${info.kinds.join(', ')}`;
  interceptions.set(key, (interceptions.get(key) ?? 0) + 1);
  log(`Secret intercepté avant affichage — ${info.where} : ${info.kinds.join(', ')}`);
  refresh();
  const fresh = info.kinds.filter((k) => !warned.has(k));
  if (fresh.length === 0) return;
  fresh.forEach((k) => warned.add(k));
  void vscode.window
    .showWarningMessage(
      `GitHub Companion a intercepté un identifiant (${fresh.join(', ')}) avant tout affichage : ` +
        "il n'a donc pas été montré. Par prudence, régénère ton token si tu penses qu'il a pu être exposé.",
      'Voir le détail',
      'Régénérer le token',
      'Ignorer'
    )
    .then(handleChoice);
}

/** Fuites constatées par l'audit des surfaces : alerte renforcée si certaine. */
export function reportLeaks(found: Leak[], checked: number): void {
  leaks = found;
  log(`Audit : ${checked} surface(s) vérifiée(s), ${found.length} fuite(s).`);
  if (found.length > 0) log(describeLeaks(found));
  refresh();
  if (found.length === 0) return;
  const sure = found.some((l) => l.severity === 'critique');
  const text = sure
    ? `FUITE DE TOKEN : ton token GitHub est présent en clair dans « ${found[0].where} ». ` +
      "Régénère-le MAINTENANT (et révoque l'ancien) : quiconque accède à ce fichier peut l'utiliser."
    : `Identifiant(s) à vérifier dans « ${found[0].where} » (${found[0].kinds.join(', ')}).`;
  void vscode.window
    .showErrorMessage(text, 'Voir le détail', 'Régénérer le token', 'Ignorer')
    .then(handleChoice);
}

/** État courant (pour affichage et tests) : jamais de secret dedans. */
export function securityState(): { interceptions: Array<[string, number]>; leaks: Leak[] } {
  return { interceptions: [...interceptions.entries()], leaks };
}

/** Canal de sortie, indicateur de la barre d'état et guetteur d'interception. */
export function installSecurityUi(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel('GitHub Companion — Sécurité');
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  item.command = 'githubCompanion.securityAudit';
  item.name = 'GitHub Companion — sécurité';
  context.subscriptions.push(channel, item);
  onSecretIntercepted(noteInterception);
  log('Surveillance des fuites de token active (aucun token n’est journalisé).');
}
