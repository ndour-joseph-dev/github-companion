# GitHub Companion

Extension VS Code qui **groupe** les commandes Git/GitHub derrière des boutons.
Chaque action part d'un clic explicite — sauf si tu actives volontairement le
toggle **Sync auto**.

## Ce que ça fait

- **1. Initialiser un repo local** : `git init` (branche par défaut configurable).
- **2. Créer un repo GitHub** : crée le repo distant + configure `origin`.
  Aucun commit ni push à cette étape.
- **3. Commit local** : `git add .` + `git commit -m "…"`.
  Affiche les noms des fichiers inclus. Si **Sync auto** est coché → push aussi.
- **4. Push vers le cloud** : envoie les commits en attente (premier push avec `-u`).
  « Rien à pousser » n'est annoncé que si le cloud porte **déjà** le commit local :
  un dépôt GitHub neuf et vide reçoit donc toujours son premier push, même si le
  dossier était auparavant relié à un autre dépôt.
- **Mettre à jour** : `git pull` des commits distants — bouton placé **sous**
  **Vérifier les mises à jour** (`git fetch` seul, aucun fichier local modifié),
  en haut du panneau, sous le titre *Mises à jour*.

## Le panneau

Trois zones, dans l'ordre : les **comptes** (sélecteur, puis rangée d'actions sous le titre
*Gestion des comptes*), l'**état** du dépôt, puis les **actions** groupées par titre.
Aucun bouton n'est étiré : chacun se limite à la largeur de son libellé et de son icône, et
chaque rangée passe à la ligne si le panneau est étroit — rien n'est tronqué. Sous le titre
*Mises à jour*, les deux actions de synchronisation sont **empilées** : **Vérifier les mises
à jour** d'abord, **Mettre à jour** juste en dessous, chacune avec sa commande et son
explication. Le verdict de « Vérifier » (commits distants, *à récupérer*) n'est **pas
éternel** : il n'est réaffiché que tant qu'il décrit le **même dépôt** et le **même
commit local**, et il n'est jamais repris passé **10 minutes** — un dépôt changé
(supprimé puis recréé, remote renommé) ou un commit local depuis la vérification
remet le compteur à zéro au lieu d'afficher l'état d'avant.

## Comptes multiples

- Le sélecteur en haut du panneau choisit le compte utilisé pour créer / pousser / tirer.
- L'état affiche le **nombre de dépôts détenus** par le compte actif (forks compris) et un
  **sélecteur de dépôts** : la liste exacte s'ouvre dans le panneau, en **lecture seule**
  (on regarde, on ne sélectionne rien — c'est le dossier ouvert qui décide, via son remote),
  et le dépôt du dossier ouvert y est signalé.
- **La liste des dépôts est une photo datée de GitHub**, pas une certitude :
  réinterrogée automatiquement dès qu'elle a plus de **5 minutes**, jamais deux fois
  d'affilée pour un même compte. Le bouton **Rafraîchir** (à côté de *Ajouter un token*)
  force la question immédiatement : un dépôt **créé ou supprimé** sur GitHub disparaît de
  l'état au premier rafraîchissement, sans fermer ni rouvrir l'éditeur. Si GitHub ne
  répond pas, la liste connue est **conservée** et c'est **dit** — jamais de liste vide qui
  ferait croire à un compte sans dépôt.
- Le bloc d'état affiche le **dépôt cloud** du dossier (`owner/repo`, lien cliquable), le
  **propriétaire** et le **rôle** du compte actif : propriétaire, administrateur
  d'organisation, collaborateur (avec ou sans droit de pousser), ou aucun accès.
- **Une information par bloc** : chaque élément de la zone d'état (compte actif, profil,
  nombre de dépôts, branche, remote, dépôt, rôle, correspondance, dernier commit, message,
  fichiers modifiés…) est rendu dans **son propre conteneur**, espacé verticalement.
  Les lignes ne se collent plus et un élément ajouté demain hérite du même espacement.
- **Correspondance dépôt ↔ compte** : l'état dit si le dépôt ouvert est bien celui du compte
  actif (`oui` / `non — dépôt de « tel compte », compte actif : « tel compte » en badge`). Le nom du
  **compte actif** est mis en **badge rouge** dès qu'il diffère du propriétaire : deux noms
  voisins ne se lisent plus comme une seule identité, et un push ne part jamais vers le dépôt
  d'un autre compte sans qu'on l'ait vu.
- **Dernier commit (local)** : la date et l'heure (`14/10/2026 16:41`), puis le **message** sur
  sa propre ligne. Ces deux informations sont **relues du dossier à chaque affichage** (jamais
  mémorisées) ; un dossier sans commit affiche « Aucun commit en local » au lieu de laisser la
  ligne muette, et « (local) » rappelle que l'état **distant** est une autre information,
  affichée plus bas.
- **Garde-fou au changement de compte** : si le compte choisi n'est pas le propriétaire du
  dépôt ouvert (ou n'y a pas accès), l'extension prévient avant de basculer et propose le
  compte correspondant. Le message ne contient que des valeurs **lues à l'exécution** : le
  **login du compte choisi**, le dépôt du dossier, et le **propriétaire d'après l'URL du remote**
  (explicitement nommé comme tel — ce n'est jamais un compte figé dans l'extension). Un 404 est
  annoncé « accès refusé, **ou** dépôt supprimé », GitHub répondant la même chose dans les deux
  cas. Même filet de sécurité avant un push.
- **Dialogues qui ne listent que les choix réels** : le bouton **Annuler** est celui que VS Code
  ajoute lui-même à tout dialogue modal (traduit selon la langue de l'éditeur) ; le redéclarer
  affichait **deux** boutons « Annuler » côte à côte. Fermer le dialogue (ce bouton, la croix ou
  Échap) est traité comme un **refus** : le compte actif ne change pas, rien n'est poussé.

## Token GitHub

- Saisi **une seule fois** (stocké dans le coffre-fort VS Code / OS, jamais sur disque).
- Réutilisé pour tous tes projets jusqu'à expiration.
- Groupe **Gestion des comptes** en haut du panneau : **Ajouter un compte**,
  **Ajouter un token** et **Retirer ce compte** sur une même rangée (ou commande palette
  « Modifier le token du compte actif »).
- Instructions claires au premier usage + messages d'erreur actionnables
  (token invalide, repo déjà existant, non-fast-forward, etc.).

### Sécurité du token

- Jamais écrit dans `.git/config`, jamais affiché, jamais envoyé au panneau.
- Jamais visible dans la liste des processus : l'en-tête d'authentification passe par
  l'environnement (`--config-env`, git ≥ 2.31), pas par la ligne de commande.
- Les messages d'erreur et les URL de remote sont nettoyés de tout secret avant affichage.
- L'environnement transmis à Git est nettoyé : aucune variable ne peut faire exécuter un
  helper de credentials ni ouvrir une fenêtre de mot de passe (et cela évite un blocage
  connu quand VS Code / VSCodium pose `GIT_ASKPASS`).
- **Surveillance des fuites** : l'extension inspecte les endroits où un token ne doit
  jamais apparaître (`.git/config` du projet, `~/.gitconfig`, `~/.git-credentials`,
  `~/.netrc`, environnement, réglages VS Code) au démarrage, après chaque saisie de token
  et à la demande. Si ton token est exposé, une alerte rouge s'affiche avec **l'endroit
  exact** et propose de le **régénérer** (aucune valeur secrète n'est jamais affichée).
- **Avertissement d'interception** : si un identifiant devait malgré tout atteindre un
  point d'affichage, il est nettoyé **et** tu reçois un avertissement transparent ; le
  journal de sécurité indique *où* et *quel type* de secret, jamais la valeur.

## Garde-fous : ne jamais casser ton projet

Actifs sans aucun réglage. L'extension n'exécute **jamais** de commande destructive :
aucun `reset --hard`, `clean`, `checkout --`, `stash` ni `push --force` n'existe dans le
code (vérifié par un test automatisé).

- **Une seule opération Git à la fois** : deux commandes concurrentes ne peuvent plus
  corrompre l'index (`.git/index.lock`).
- **Verrou résiduel détecté, jamais supprimé** : si un git interrompu a laissé un
  `index.lock`, l'action est refusée avec l'explication — le verrou n'est pas effacé.
- **Opération interrompue détectée** : fusion, rebase, cherry-pick, revert ou bisect en
  cours → l'extension refuse d'agir, explique, et peut proposer l'annulation propre
  (`git merge --abort`, `git rebase --abort`…). Tes fichiers restent intacts.
- **Secrets avant commit** : si un `.env`, une clé privée, un `.npmrc` ou une ligne
  contenant un token est sur le point d'être publié, l'extension prévient et peut
  **désindexer** ces fichiers (sans jamais les supprimer du disque).
- **Récupération prudente** : `git pull` avec des modifications locales → avertissement
  avant d'agir (git refuse d'écraser : tes fichiers ne sont jamais perdus).
- **Vérification après push** : le commit local est comparé au commit réellement présent
  sur le cloud. En cas d'écart, l'extension le dit au lieu d'afficher « push réussi ».
- **Historique + annulation sûre** (`GitHub Companion: Historique des actions`) : liste
  les actions exécutées et permet d'annuler le dernier commit avec `git reset --soft`
  (aucun fichier touché, les modifications repassent en attente de commit).

## Commandes de la palette (sécurité & transparence)

| Commande | Rôle |
|----------|------|
| `GitHub Companion: Rafraîchir les dépôts du compte` | Réinterroge GitHub : dépôts créés ou supprimés depuis le dernier chargement (bouton **Rafraîchir** du panneau) |
| `GitHub Companion: Auditer la sécurité du token (fuites)` | Cherche le token dans les fichiers, l'environnement et les réglages, puis affiche le détail |
| `GitHub Companion: Historique des actions (annuler un commit)` | Journal de ce que l'extension a exécuté + annulation du dernier commit |

## Sync auto

Toggle sous le bouton Push. Désactivé par défaut.
Quand activé : un commit local déclenche immédiatement un push.

## Installation (dev)

```bash
npm install
npm run compile
```

Puis `F5` dans VS Code (Extension Development Host).

## Tests

Suite complète, **sans réseau ni service externe** (dépôts Git temporaires et
faux module VS Code) — elle vérifie en particulier qu'aucun token ne fuite et
qu'aucune action ne peut casser un dépôt :

```bash
bash test/run-all.sh
```

Elle couvre notamment : le nettoyage des secrets, la détection de fuite
(fichiers git, environnement, réglages), l'avertissement d'interception, le
verrou anti-opérations concurrentes, la détection d'une fusion/rebase en cours,
la désindexation des fichiers sensibles, l'annulation sûre d'un commit, la
vérification d'après-push, et l'absence totale de commande destructive.

## Configuration

| Setting | Défaut | Description |
|---------|--------|-------------|
| `githubCompanion.defaultBranch` | `main` | Branche par défaut |
| `githubCompanion.defaultVisibility` | `private` | Visibilité des nouveaux repos |
| `githubCompanion.autoSync` | `false` | Commit → push automatique |

## Licence

**MIT** — 100 % gratuit, sans contrepartie :

- usage **personnel** ou **commercial**, modification, redistribution ;
- **intégration dans un autre produit** (y compris vendu) : autorisée ;
- **vente** de copies : autorisée.

Une seule obligation : **conserver la notice de copyright et la licence**
(le fichier `LICENSE`, livré avec l'extension) dans les copies ou parties
substantielles du logiciel — le nom de l'auteur ne peut donc pas être retiré ni
remplacé, et ce travail ne peut pas être présenté comme celui d'un autre.

Le logiciel est fourni « en l'état », sans garantie d'aucune sorte.
