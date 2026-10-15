# Journal des versions

Toutes les évolutions notables de **GitHub Companion**. Le format suit
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et les versions
respectent le [versionnage sémantique](https://semver.org/lang/fr/).

## [0.0.14] - 2026-10-15

Un dépôt GitHub supprimé **puis remplacé** ne laisse plus ses traces : l'état
distant est rattaché à un dépôt et à un commit précis, le push se vérifie sur le
cloud, et le compte actif ne se confond plus avec le propriétaire affiché.

### Corrigé

- **Commits distants et « À récupérer » d'un ancien dépôt encore affichés** : le
  verdict de « Vérifier les mises à jour » était gardé **sans limite et sans
  rattachement** — un dossier relié à un dépôt neuf (l'ancien ayant été supprimé
  sur GitHub) continuait d'afficher les commits distants d'un dépôt qui n'existe
  plus. Le verdict porte désormais le **dépôt** (issu de l'URL du remote) et le
  **commit local** qu'il décrit, et il n'est plus repris passé **10 minutes** :
  autre dépôt, commit arrivé depuis, ou verdict trop vieux → l'information
  disparaît au lieu d'être affirmée.
- **« Rien à pousser : ton dépôt est déjà synchronisé » alors que le dépôt distant
  était vide** : la décision reposait sur `status.ahead`, c'est-à-dire sur
  `origin/<branche>` **déjà rapatriée** — la référence de l'ancien dépôt. Après
  suppression du dépôt GitHub et liaison à un dépôt neuf (`git remote` remplacé),
  l'extension refusait donc de pousser un dossier plein. Elle demande maintenant
  au cloud le **SHA réel de la branche** : « rien à pousser » n'est annoncé que
  si le cloud porte **exactement** le commit local. Sans preuve (branche absente,
  réseau injoignable), le push est tenté : git répond « Everything up-to-date »
  s'il n'y a réellement rien à envoyer.
- **« Dernier commit / Message » ambigu** : ces deux lignes décrivent le **dossier
  ouvert** et étaient affichées comme si elles valaient pour le dépôt cloud. Elles
  sont annoncées « Dernier commit **(local)** » dès qu'un remote existe (le
  distant a ses propres lignes), et un dépôt sans commit écrit « Aucun commit en
  local » au lieu de laisser la ligne muette. Elles restent **relues à chaque
  affichage** : après un commit, c'est bien le nouveau message qui apparaît.
- **Compte actif confondu avec le propriétaire du dépôt** : « dépôt de « X »,
  compte actif : Y » se lisait comme une seule identité. Le login du compte actif
  est maintenant mis en **badge rouge**, et le libellé « (compte actif différent) »
  accompagne le propriétaire. Le nom affiché reste celui du **propriétaire déduit
  de l'URL du remote** : aucune valeur figée, ni dans le panneau ni dans les
  dialogues.
- **Avertissement de changement de compte** : la provenance du nom est explicitée
  (« propriétaire d'après l'URL du remote ») et un 404 est annoncé « accès refusé,
  **ou** dépôt supprimé » — GitHub répond la même chose dans les deux cas.

### Modifié

- **Zone d'état aérée, une information par conteneur** : chaque ligne (Actif,
  Profil, Repos, Branche, Remote, Dépôt, Rôle, Correspondance, Dernier commit,
  Message, Modifiés…) est rendue dans **son propre `<div>`**, qui porte désormais
  son espacement vertical (4 px en haut, 4 px en bas — le pas d'espacement du
  panneau). La liste des commits distants suit le même rythme dans son bloc. Les
  lignes ne se collent plus, et la lisibilité ne dépend plus du `gap` du
  conteneur : un élément ajouté demain hérite du même espacement.

### Interne

- Nouveau module `features/checkUpdates/store.ts` (mémoire du verdict distant,
  sans `vscode`, donc testable) + `head` mémorisé avec le résultat distant.
- Nouvelles suites `remoteCache` (péremption, rattachement au dépôt, au commit,
  preuve de push), `accountMessages` (messages du garde-fou de compte, et
  **aucun login de compte en dur** dans `src/` et `media/`) et `statusLayout`
  (chaque information de la zone d'état est dans son `<div>`, jamais de texte nu,
  pour les états complets, dépôt vide, chargement et erreurs).

## [0.0.13] - 2026-10-15

Un dépôt supprimé sur GitHub n'est plus affiché à vie : la liste des dépôts est
une **photo datée**, et le panneau propose de la reprendre à la demande.

### Ajouté

- **Bouton « Rafraîchir »** dans le panneau (et commande de palette
  `GitHub Companion: Rafraîchir les dépôts du compte`) : réinterroge GitHub tout
  de suite et repousse l'état des comptes. Le verdict d'accès au dépôt du dossier
  ouvert est oublié au passage, pour que le rôle affiché soit recalculé.

### Corrigé

- **Dépôts supprimés sur GitHub qui restaient affichés** : la liste enregistrée
  avec un compte était considérée comme définitive. Trois dépôts supprimés
  apparaissaient encore après fermeture puis réouverture de l'éditeur, et le
  bouton « Vérifier les mises à jour » (`git fetch`) n'y changeait rien — il ne
  parle pas à GitHub. La liste porte désormais sa **date de prise de vue**
  (`reposUpdatedAt`) et est réinterrogée dès qu'elle a plus de **5 minutes**
  (jamais deux fois de suite pour un même compte : le panneau peut être
  reconstruit ou réaffiché sans que GitHub le sache).
- **Une panne de GitHub ne peut plus effacer une liste connue** : si le listage
  échoue (réseau, token sans portée « repo »), la photo précédente et le total
  exact sont conservés, et l'échec est expliqué au lieu de passer pour « à jour ».
- **Dépôt supprimé ≠ accès refusé** : GitHub répond 404 dans les deux cas, le
  panneau annonce donc « refusé **ou** dépôt supprimé » au lieu d'affirmer un
  refus (et ne laisse plus croire que le dépôt existe toujours).

### Interne

- Nouvelle suite de tests `accountsRefresh` (péremption, anti-martèlement,
  rafraîchissement forcé, panne réseau, action utilisateur) ; le coffre-fort
  simulé des tests mémorise désormais réellement ses écritures.

## [0.0.12] - 2026-10-15

Première version prête à installer : le panneau ne se contente plus de l'état du
dossier ouvert, il dit aussi **quel compte** pilote le dépôt — et si ce n'est pas
le bon.

### Ajouté

- **Liste des dépôts du compte actif** : le nombre de dépôts détenus (forks
  compris) apparaît dans l'état, et le sélecteur ouvre la liste exacte en
  **lecture seule** — c'est le dossier ouvert, via son remote, qui décide du
  dépôt utilisé ; le dépôt du dossier y est signalé.
- **Dépôt cloud du dossier** : `owner/repo` avec lien cliquable, **propriétaire**
  et **rôle** du compte actif (propriétaire, administrateur d'organisation,
  collaborateur avec ou sans droit de pousser, aucun accès).
- **Correspondance dépôt ↔ compte** : l'état indique si le dépôt ouvert est bien
  celui du compte actif, ou de quel autre compte il dépend — un push ne part
  jamais vers le dépôt d'un autre compte sans que ce soit visible.
- **Dernier commit** : date, heure et message, chacun sur sa ligne.
- **Deux suites de tests** supplémentaires pour ces affichages
  (`accountsStore`, `repoCount`).

### Corrigé

- **Comptage des dépôts des gros comptes** : le nombre de dépôts est lu
  directement dans le lien `rel="last"` de l'en-tête HTTP de GitHub, au lieu
  d'être déduit d'une comparaison de numéros de page. Plus de décalage possible
  au-delà de quelques milliers de dépôts, et un test de régression couvre le cas
  pathologique d'une réponse de 40 000 chiffres.

### Interne

- Le paquet installable (`.vsix`) n'embarque plus les artefacts de
  développement (rapports de couverture, données de l'indexeur local, fichiers
  de configuration du projet) : `vsce` ne lit pas le `.gitignore`, ces
  exclusions sont désormais explicites.
- Nouvelle commande `npm run package` pour reconstruire le `.vsix`.

## [0.0.11] - 2026-10-14

Socle initial, packagé pour la première fois : boutons groupés
(initialiser un dépôt, créer le dépôt GitHub, commit, push, pull, vérifier les
mises à jour), comptes GitHub multiples avec sélecteur, token conservé dans le
coffre-fort de l'OS, et les garde-fous (aucune commande destructive, une seule
opération Git à la fois, alerte avant diffusion de secrets, historique avec
annulation sûre du dernier commit).
