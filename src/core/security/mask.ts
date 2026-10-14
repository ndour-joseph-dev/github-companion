// Manipulation sûre des secrets : on ne garde JAMAIS la valeur entière à
// l'écran, seulement une empreinte courte pour identifier le token concerné.

/** Version masquée d'un secret, sûre à afficher (ghp_…9f3c · 40 car.). */
export function maskSecret(secret: string): string {
  const s = String(secret ?? '');
  if (s.length < 12) return `*** (${s.length} car.)`;
  return `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} car.)`;
}

/** true si `text` contient *exactement* le secret fourni (preuve d'exposition). */
export function findSecret(secret: string | undefined, text: unknown): boolean {
  const s = String(secret ?? '');
  return s.length >= 8 && String(text ?? '').includes(s);
}

/**
 * Motifs génériques de secrets : permet d'alerter même sans connaître le token
 * exact (token d'un compte oublié, token déjà présent sur le disque, clé privée).
 */
const SHAPES: Array<[RegExp, string]> = [
  [/\bgh[pousr]_[A-Za-z0-9]{16,}/, 'token GitHub (ghp_…)'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, 'token GitHub (github_pat_…)'],
  [/AUTHORIZATION:\s*basic\s+[A-Za-z0-9+/=]{8,}/i, "en-tête d'authentification"],
  [/http\.extraHeader\s*=\s*\S+/, 'configuration git http.extraHeader'],
  // Quantificateurs bornés : `[a-z0-9+.-]*` recouvrait le `[a-z]` initial
  // (alternance ambiguë → temps quadratique sur une entrée hostile).
  [/[a-z][a-z0-9+.-]{0,31}:\/\/[^\s/@:]+:[^\s/@]+@/i, 'identifiants dans une URL'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clé privée']
];

/** Types de secrets repérés dans un texte (liste vide si rien). */
export function secretShapes(text: unknown): string[] {
  const t = String(text ?? '');
  return SHAPES.filter(([re]) => re.test(t)).map(([, name]) => name);
}
