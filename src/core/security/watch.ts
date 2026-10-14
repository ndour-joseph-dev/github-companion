import * as vscode from 'vscode';
import { auditTokenLeak } from './audit';
import { installSecurityUi, reportLeaks } from './report';
import { getActiveToken } from '../../features/accounts/core';

/**
 * Audit à la demande : dit précisément où un token pourrait fuiter
 * (.git/config, fichiers de credentials, environnement, réglages).
 */
export async function runSecurityAudit(context: vscode.ExtensionContext): Promise<void> {
  const secret = await getActiveToken(context);
  const { leaks, checked } = auditTokenLeak(secret);
  reportLeaks(leaks, checked);
  if (leaks.length === 0) {
    void vscode.window.showInformationMessage(
      `Aucune fuite détectée : ${checked} surface(s) vérifiée(s) ` +
        "(fichiers git, environnement, réglages VS Code). Ton token n'y apparaît nulle part."
    );
  }
}

/** Audit silencieux : n'avertit QUE s'il trouve une fuite (démarrage, token). */
export async function auditQuietly(context: vscode.ExtensionContext): Promise<void> {
  try {
    const secret = await getActiveToken(context);
    const { leaks, checked } = auditTokenLeak(secret);
    if (leaks.length > 0) reportLeaks(leaks, checked);
  } catch {
    /* jamais bloquant */
  }
}

/** Installe l'indicateur, le guetteur d'interception et la commande d'audit. */
export function registerSecurityCommands(context: vscode.ExtensionContext): void {
  installSecurityUi(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('githubCompanion.securityAudit', async () => {
      try {
        await runSecurityAudit(context);
      } catch {
        /* l'audit ne doit jamais casser l'extension */
      }
    })
  );
  void auditQuietly(context);
}
