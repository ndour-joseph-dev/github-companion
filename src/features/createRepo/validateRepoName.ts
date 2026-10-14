/**
 * Valide le nom d'un dépôt GitHub saisi par l'utilisateur.
 * Extrait de createRepo/index.ts pour respecter la limite de 100 lignes.
 */
export function validateRepoName(v: string): string | undefined {
  const name = v.trim();
  if (!name) return 'Le nom ne peut pas être vide.';
  if (name.length > 100) return 'Maximum 100 caractères.';
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    return 'Lettres, chiffres, - _ . uniquement.';
  }
  if (name.startsWith('ghp_') || name.startsWith('github_pat_')) {
    return 'Ça ressemble à un token. Entre le nom du projet.';
  }
  return undefined;
}
