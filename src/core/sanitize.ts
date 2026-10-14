// Neutralise toute fuite de secret dans un texte destiné à l'utilisateur :
// messages d'erreur git/HTTP, URL de remote, sortie de commande.
// Un token ne doit JAMAIS être affiché, journalisé ni envoyé au webview.

/** Motifs de tokens GitHub, en-têtes d'auth et URL porteuses d'identifiants. */
const PATTERNS: Array<[RegExp, string, string]> = [
  [/\bgh[pousr]_[A-Za-z0-9]{16,}/g, '***', 'token GitHub (ghp_…)'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '***', 'token GitHub (github_pat_…)'],
  [/(AUTHORIZATION:\s*basic\s+)[A-Za-z0-9+/=]+/gi, '$1***', "en-tête d'authentification"],
  [/(http\.extraHeader\s*=\s*)[^\s,]+/gi, '$1***', 'configuration git http.extraHeader'],
  [/\/\/[^\s/@:]+:[^\s/@]+@/g, '//***@', 'identifiants dans une URL']
];

/** Où un secret a été intercepté (jamais la valeur, jamais le texte brut). */
export interface Interception {
  where: string;
  kinds: string[];
}

let onIntercept: ((info: Interception) => void) | undefined;

/** Enregistre le guetteur appelé à CHAQUE secret intercepté (transparence). */
export function onSecretIntercepted(fn: (info: Interception) => void): void {
  onIntercept = fn;
}

/** Remplace tout secret identifiable par « *** » et signale l'interception. */
export function redact(text: unknown, where = 'un message'): string {
  let out = String(text ?? '');
  const kinds: string[] = [];
  for (const [re, rep, kind] of PATTERNS) {
    const before = out;
    out = out.replace(re, rep);
    if (out !== before) kinds.push(kind);
  }
  if (kinds.length && onIntercept) {
    try {
      onIntercept({ where, kinds });
    } catch {
      /* le nettoyage ne doit jamais échouer à cause du guetteur */
    }
  }
  return out;
}

/**
 * URL débarrassée de ses identifiants (user:token@) et de tout secret :
 * sert avant d'afficher ou d'ouvrir une URL de remote.
 */
export function stripCredentials(url: unknown): string {
  return redact(url, "l'URL d'un remote")
    .replace(/(https?:\/\/)[^\s/@:]+(:[^\s/@]*)?@/i, '$1');
}
