import { findSecret, maskSecret, secretShapes } from './mask';

/** Une surface d'exposition à inspecter (fichier, variable, réglage…). */
export interface Surface {
  surface: string; // étiquette affichée (« .git/config », « environnement »…)
  where: string; // chemin ou précision
  text: string; // contenu analysé (jamais transmis au-delà de l'analyse)
}

/** Fuite constatée : ne contient JAMAIS le secret ni la ligne coupable. */
export interface Leak {
  surface: string;
  where: string;
  severity: 'critique' | 'alerte';
  kinds: string[];
}

/**
 * Analyse les surfaces et retourne les fuites. `secret` (optionnel) permet de
 * prouver une exposition certaine ; sinon on se fie aux motifs génériques
 * (ce qui détecte aussi un token d'un compte oublié).
 */
export function scanSurfaces(surfaces: Surface[], secret?: string): Leak[] {
  const leaks: Leak[] = [];
  for (const s of surfaces) {
    if (!s.text) continue;
    if (findSecret(secret, s.text)) {
      leaks.push({
        surface: s.surface,
        where: s.where,
        severity: 'critique',
        kinds: [`ton token actif ${maskSecret(String(secret))}`]
      });
      continue;
    }
    const kinds = secretShapes(s.text);
    if (kinds.length > 0) {
      leaks.push({ surface: s.surface, where: s.where, severity: 'alerte', kinds });
    }
  }
  return dedupe(leaks);
}

function dedupe(leaks: Leak[]): Leak[] {
  const seen = new Set<string>();
  const out: Leak[] = [];
  for (const l of leaks) {
    const key = `${l.surface}|${l.where}|${l.severity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

/** Résumé lisible d'une liste de fuites (jamais de secret dedans). */
export function describeLeaks(leaks: Leak[]): string {
  return leaks
    .map((l) => `• ${l.surface} — ${l.where} : ${l.kinds.join(', ')} (${l.severity})`)
    .join('\n');
}
