import * as vscode from 'vscode';
import { analyzeRepoMatch } from './repoMatch';
import { listAccounts } from './core';
import { label } from './store';

/**
 * Confirmation modale simple (Continuer / fermeture).
 *
 * Le bouton d'annulation n'est JAMAIS déclaré ici : pour un dialogue modal, VS
 * Code ajoute lui-même le bouton de fermeture (« Annuler »/« Cancel », traduit).
 * Le déclarer en plus afficherait deux boutons identiques.
 */
async function ask(question: string): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(
    `${question} Continuer la bascule de compte ?`,
    { modal: true },
    'Continuer'
  );
  return choice === 'Continuer'; // fermeture (undefined) : on ne bascule pas
}

/**
 * Garde-fou avant de rendre un compte actif : si le dépôt cloud du dossier
 * ouvert appartient à un autre compte (ou n'est pas accessible), on prévient
 * AVANT de changer d'identité — un push partirait vers le mauvais dépôt.
 *
 * Retourne l'identifiant du compte à activer, ou undefined si l'utilisateur a
 * annulé (dans ce cas l'appelant ne change rien).
 */
export async function guardAccountSwitch(
  context: vscode.ExtensionContext,
  targetId: string
): Promise<string | undefined> {
  const match = await analyzeRepoMatch(context, targetId);
  if (!match) return targetId; // rien à vérifier : aucun dépôt cloud lié
  const { account, repo, access } = match;
  const name = label(account);
  // Compte légitime (propriétaire, ou administrateur d'un dépôt d'organisation) :
  // aucune question posée.
  if (access.role === 'owner' || access.role === 'admin') return targetId;

  const owner = repo.owner;
  // Le propriétaire vient de l'URL du remote du dossier ouvert : c'est un
  // LOGIN GitHub réel (change d'un utilisateur à l'autre, d'un dépôt à
  // l'autre), jamais un nom figé dans l'extension. On le dit, pour que personne
  // ne prenne ce nom pour sa propre identité ou pour celle du compte choisi.
  const by = `Propriétaire d'après l'URL du remote : « ${owner} ».`;
  if (access.role === 'unknown') {
    const go = await ask(
      `Impossible de vérifier l'accès de « ${name} » au dépôt ${repo.fullName} ` +
        `(hors ligne ou token invalide). ${by}`
    );
    return go ? targetId : undefined;
  }

  const problem =
    access.role === 'none'
      ? // GitHub répond 404 pour un dépôt supprimé comme pour un accès refusé :
        // affirmer un refus sec serait mentir sur l'un des deux cas.
        `« ${name} » n'a aucun accès à ${repo.fullName} — accès refusé, ou ` +
        `dépôt supprimé sur GitHub (même réponse). ${by}`
      : access.canPush === false
        ? `« ${name} » n'a qu'un accès en LECTURE SEULE à ${repo.fullName}. ${by}`
        : `« ${name} » n'est pas propriétaire de ${repo.fullName} (accès collaborateur). ${by}`;

  const known = (await listAccounts(context))
    .find((a) => a.login && a.login.toLowerCase() === owner.toLowerCase());
  const useOwner = known && known.id !== targetId ? `Utiliser « ${label(known)} »` : undefined;
  const keep = access.role === 'collaborator' && access.canPush !== false
    ? 'Continuer'
    : 'Changer quand même';
  // Pas d'item « Annuler » dans la liste : VS Code ajoute son propre bouton de
  // fermeture (« Annuler ») à tout dialogue modal — le nommer ici le ferait
  // apparaître deux fois, côte à côte.
  const buttons = [useOwner, keep].filter((b): b is string => !!b);

  const choice = await vscode.window.showWarningMessage(
    `${problem} Les commits partiront vers ce dépôt : ` +
      'vérifie que le compte choisi est bien celui que tu veux utiliser.',
    { modal: true },
    ...buttons
  );
  // Fermeture du dialogue (bouton « Annuler » de VS Code, ou Échap) : le compte
  // actif ne change pas.
  if (!choice) return undefined;
  if (useOwner && choice === useOwner) return known!.id;
  return targetId;
}

/** Avertissement non bloquant : compte ajouté ≠ propriétaire du dépôt ouvert. */
export async function warnAccountRepoMismatch(
  context: vscode.ExtensionContext,
  accountId: string
): Promise<void> {
  const match = await analyzeRepoMatch(context, accountId);
  if (!match) return;
  const role = match.access.role;
  if (role === 'owner' || role === 'admin' || role === 'unknown') return;
  vscode.window.showWarningMessage(
    `Attention : « ${label(match.account)} » n'est pas propriétaire du dépôt ouvert ` +
      `${match.repo.fullName} (propriétaire : « ${match.repo.owner} »). ` +
      'Un push depuis ce compte visera un dépôt qui ne t\'appartient pas.'
  );
}
