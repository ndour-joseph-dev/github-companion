/**
 * Environnement transmis aux commandes git.
 *
 * Deux raisons de nettoyer l'environnement du processus parent :
 *  — SÉCURITÉ : aucune variable ne doit pouvoir faire exécuter un programme
 *    externe ni ouvrir une fenêtre de mot de passe (l'authentification passe
 *    par un en-tête, jamais par un helper de credentials) ;
 *  — FIABILITÉ : simple-git REFUSE de dialoguer avec un dépôt distant quand
 *    GIT_ASKPASS (posé par VS Code / VSCodium) est présent dans l'environnement.
 *    Sans ce nettoyage, push / pull / fetch échouent avant même de démarrer.
 */
const STRIPPED = [
  'GIT_ASKPASS',
  'SSH_ASKPASS',
  'VSCODE_GIT_ASKPASS_NODE',
  'VSCODE_GIT_ASKPASS_MAIN',
  'VSCODE_GIT_ASKPASS_EXTRA_ARGS',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'GIT_PROXY_COMMAND',
  'GIT_EXTERNAL_DIFF',
  'GIT_PAGER',
  'PAGER',
  'GIT_EDITOR',
  'EDITOR',
  'GIT_SEQUENCE_EDITOR',
  'GIT_TEMPLATE_DIR',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_EXEC_PATH',
  'PREFIX'
];

/** Copie de l'environnement, nettoyée, sans aucune invite de credentials. */
export function gitEnv(extra: Record<string, string> = {}): Record<string, string> {
  const stripped = new Set(STRIPPED.map((k) => k.toUpperCase()));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || stripped.has(key.toUpperCase())) continue;
    env[key] = value;
  }
  return { ...env, GIT_TERMINAL_PROMPT: '0', ...extra };
}
