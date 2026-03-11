# 🖥️ Red Tetris — Architecture Backend

> Node.js + TypeScript + Socket.IO + Express
> Document d'architecture et guide de développement — **sans code**

---

## ⚠️ Note préliminaire — Corrections par rapport au brouillon

Plusieurs points du brouillon original ont été corrigés ou retirés :

- **Section Redux supprimée** : la gestion d'état Redux (gameSlice, roomSlice, socketMiddleware) est une préoccupation **100% frontend**. Elle n'a aucune place dans un document d'architecture backend.
- **Règles CSS supprimées** : les contraintes sur `grid`, `flexbox`, `<TABLE>`, `Canvas`, `SVG` sont des contraintes **frontend**. Le backend n'est pas concerné.
- **Règle "pas de `this` supprimée"** : cette contrainte s'applique uniquement au client. Côté serveur, l'usage de `this` est **obligatoire** (OOP imposé par le sujet).
- **Ajouts significatifs** : gestion des erreurs, validation des payloads, stratégie de reconnexion, cycle de vie complet d'une room, séparation des responsabilités clarifiée, et considérations de robustesse.

---

## 📋 Table des matières

1. [Vue d'ensemble et responsabilités du serveur](#1-vue-densemble-et-responsabilités-du-serveur)
2. [Structure des dossiers](#2-structure-des-dossiers)
3. [Couche Partagée — `shared/`](#3-couche-partagée--shared)
4. [Point d'entrée — `index.ts`](#4-point-dentrée--indexts)
5. [Classe `Piece`](#5-classe-piece)
6. [Classe `Player`](#6-classe-player)
7. [Classe `Game`](#7-classe-game)
8. [Classe `GameManager`](#8-classe-gamemanager)
9. [Utilitaire — `pieceGenerator.ts`](#9-utilitaire--piecegeneratorts)
10. [Couche Socket — `handlers.ts` et `emitters.ts`](#10-couche-socket--handlersts-et-emittersts)
11. [Protocole Réseau complet](#11-protocole-réseau-complet)
12. [Cycle de vie complet d'une Room](#12-cycle-de-vie-complet-dune-room)
13. [Gestion des erreurs et robustesse](#13-gestion-des-erreurs-et-robustesse)
14. [Tests unitaires](#14-tests-unitaires)
15. [Contraintes imposées par le sujet](#15-contraintes-imposées-par-le-sujet)

---

## 1. Vue d'ensemble et responsabilités du serveur

### Rôle général
- Le serveur est l'**arbitre central** de toutes les parties en cours
- Il ne fait **jamais confiance** aux données envoyées par les clients — toutes les données entrantes sont validées
- Il ne gère **aucun état visuel** : pas de plateau, pas de mouvement de pièces, pas de détection de collision — c'est le rôle du client
- Il est le **seul générateur de pièces** : les clients reçoivent les pièces, ils ne les créent pas

### Ce que le serveur gère
- La création et la destruction des rooms (instances de `Game`)
- L'attribution du rôle d'hôte et son transfert
- La génération et la distribution équitable de la séquence de pièces partagée
- La redistribution des spectres entre adversaires
- Le calcul et la distribution des lignes de pénalité
- L'élimination des joueurs et la détection de la condition de victoire
- La déconnexion propre des clients (volontaire ou réseau)

### Ce que le serveur ne gère PAS
- Les mouvements des pièces (gauche, droite, rotation, chute) — côté client uniquement
- La détection de collision sur le plateau — côté client uniquement
- L'effacement des lignes complètes — côté client uniquement
- Le rendu visuel — côté client uniquement
- La persistance des données — aucune base de données, tout en mémoire

### Stack technique
- **Node.js** : runtime JavaScript serveur
- **TypeScript** : typage statique, compilé vers JavaScript standard
- **Express** : serveur HTTP léger pour servir les assets statiques et la route de santé
- **Socket.IO** : bibliothèque de communication bidirectionnelle temps réel (WebSocket avec fallback polling)
- **dotenv** : gestion des variables d'environnement depuis un fichier `.env`

---

## 2. Structure des dossiers

```
backend/
│
├── node_app/
│   ├── src/
│   │   ├── index.ts                    # Point d'entrée unique du serveur
│   │   ├── classes/                    # Modèles OOP métier (cœur du domaine)
│   │   │   ├── Player.ts
│   │   │   ├── Piece.ts
│   │   │   └── Game.ts
│   │   ├── managers/
│   │   │   └── GameManager.ts          # Registre global de toutes les rooms
│   │   ├── socket/
│   │   │   ├── handlers.ts             # Écoute des événements entrants
│   │   │   └── emitters.ts             # Fonctions d'émission sortantes typées
│   │   ├── utils/
│   │   │   └── pieceGenerator.ts       # Génération de séquences de pièces
│   │   └── types/
│   │       └── index.ts                # Types TypeScript internes au serveur
│   ├── tsconfig.json
│   └── package.json
│
├── shared/                             # Code partagé client ET serveur
│   ├── events.ts                       # Noms des événements socket
│   ├── types.ts                        # Interfaces communes
│   └── constants.ts                    # Constantes numériques du jeu
│
├── tests/
│   └── server/
│       ├── classes/
│       │   ├── Player.test.ts
│       │   ├── Piece.test.ts
│       │   └── Game.test.ts
│       ├── managers/
│       │   └── GameManager.test.ts
│       └── utils/
│           └── pieceGenerator.test.ts
│
├── .env                                # Variables d'environnement (gitignored !)
├── .gitignore
└── README.md
```

### Principes de séparation des responsabilités

- **`classes/`** : logique métier pure — ces fichiers ne doivent jamais importer depuis `socket/` ni depuis `managers/`
- **`managers/`** : orchestration des instances de `Game` — fait le lien entre les événements réseau et les objets métier
- **`socket/`** : couche réseau uniquement — reçoit, valide, délègue. Jamais de logique métier ici
- **`utils/`** : fonctions utilitaires sans état — peuvent être appelées depuis n'importe où
- **`shared/`** : contrat commun entre client et serveur — aucun import depuis `node_app/src/`

---

## 3. Couche Partagée — `shared/`

> ⚠️ Amélioration par rapport au brouillon : ce dossier mérite une section dédiée car il est **critique pour la cohérence client/serveur**. Toute modification ici impacte les deux côtés.

### `shared/constants.ts`
- `BOARD_WIDTH` : largeur du plateau en nombre de colonnes — valeur : 10
- `BOARD_HEIGHT` : hauteur du plateau en nombre de lignes — valeur : 20
- `PIECE_SEQUENCE_LENGTH` : nombre de pièces pré-générées par partie — valeur recommandée : 2000 (largement suffisant pour une session)
- `PENALTY_CELL_VALUE` : valeur numérique spéciale représentant une cellule de pénalité indestructible — valeur : 8
- `PIECE_TYPES` : liste ordonnée des 7 types de tetriminos — `['I', 'O', 'T', 'S', 'Z', 'J', 'L']`
- `GAME_STATUS` : objet énumérant les statuts possibles d'une partie — `waiting`, `playing`, `ended`

### `shared/events.ts`
- Contient **uniquement des constantes string** correspondant aux noms d'événements Socket.IO
- Séparés en deux groupes clairement commentés : événements Client → Serveur et Serveur → Client
- Exporté comme `const` assertion (`as const`) pour bénéficier du typage littéral TypeScript
- Aucune logique, aucun import — fichier de configuration pur
- **Règle absolue** : toute modification d'un nom d'événement ici doit être répercutée des deux côtés immédiatement

### `shared/types.ts`
- Définit les interfaces que client et serveur s'échangent via Socket.IO
- `PieceType` : union de string literals pour les 7 types
- `Position` : objet `{ x: number, y: number }` représentant une position sur le plateau
- `IPiece` : représentation minimale d'une pièce à envoyer au client — contient uniquement `type` et `position` (pas la forme, pas la rotation — calculées côté client)
- `IPlayerInfo` : représentation d'un joueur pour les clients — contient `name`, `isHost`, `isAlive` — jamais la socket
- `RoomStatePayload` : payload de l'événement `ROOM_STATE` — liste des joueurs, statut de la partie, flag isHost pour le destinataire
- `SpectrumUpdatePayload` : payload de `SPECTRUM_UPDATE` — nom du joueur et tableau de 10 valeurs
- `PenaltyLinesPayload` : payload de `PENALTY_LINES` — nombre de lignes à ajouter
- `GameOverPayload` : payload de `GAME_OVER` — nom du vainqueur (ou chaîne vide en mode solo)

### `node_app/src/types/index.ts` — Types internes au serveur
- Payloads des événements **entrants** (Client → Serveur) — ces types n'ont pas besoin d'être partagés car le client ne les lit pas
- `JoinRoomPayload`, `StartGamePayload`, `RequestPiecePayload`, `UpdateSpectrumPayload`, `LinesClearedPayload`, `GameOverPlayerPayload`, `RestartGamePayload`
- Alias de type pour `ServerSocket` (type `Socket` de Socket.IO) pour éviter les imports répétitifs

---

## 4. Point d'entrée — `index.ts`

### Rôle
- Fichier racine qui orchestre le démarrage du serveur
- Doit être **le plus court possible** : aucune logique métier ici, uniquement de la configuration et du câblage

### Séquence de démarrage (dans cet ordre)
1. Charger les variables d'environnement depuis `.env` via `dotenv`
2. Créer l'application Express
3. Configurer les middlewares Express : CORS, parsing JSON
4. Ajouter une route `/health` retournant un statut JSON — utile pour les tests d'intégration et le monitoring
5. Créer le serveur HTTP natif en passant l'app Express
6. Initialiser Socket.IO en l'attachant au serveur HTTP — **pas directement à Express**
7. Configurer les options Socket.IO : CORS (même origine que Express), pingTimeout, pingInterval
8. Récupérer l'instance unique de `GameManager` et lui injecter la référence à `io`
9. Enregistrer le handler `connection` sur `io` — à chaque nouvelle socket, appeler `registerSocketHandlers`
10. Démarrer l'écoute HTTP sur le port défini dans `.env`

### Variables d'environnement requises
- `PORT` : port d'écoute du serveur — valeur par défaut : 3001
- `CLIENT_ORIGIN` : URL du frontend Next.js autorisée par CORS — valeur par défaut : `http://localhost:3000`

### Pourquoi HTTP natif + Express plutôt qu'Express seul ?
- Socket.IO doit être attaché à un serveur HTTP Node.js natif (`http.createServer`)
- Express seul ne peut pas servir de base à Socket.IO directement
- Le serveur HTTP "enveloppe" Express et permet à Socket.IO de prendre le contrôle des requêtes WebSocket

### Export pour les tests
- Exporter `httpServer` et `io` permet aux tests d'intégration d'interagir avec le serveur sans le redémarrer

---

## 5. Classe `Piece`

### Rôle
- Représente **un tetrimino individuel** dans la séquence partagée d'une partie
- Instanciée uniquement côté serveur, lors de la génération de la séquence
- Sérialisée en `IPiece` (type + position) avant d'être envoyée à un client

### Propriétés
- `type` — le type du tetrimino (`I`, `O`, `T`, `S`, `Z`, `J`, `L`) — lecture seule après construction
- `position` — la position de spawn sur le plateau — lecture seule après construction
  - `x` : centré horizontalement — calculé comme `Math.floor(BOARD_WIDTH / 2) - 2` = 3 pour un plateau de 10 colonnes
  - `y` : valeur `-1` — légèrement **au-dessus** du plateau visible
  - Cette valeur `-1` est intentionnelle : elle permet au client de détecter un game over **avant** que la pièce apparaisse visuellement (si la position `-1` est invalide, le plateau est plein)

### Méthodes statiques
- `randomType()` — tire un type au hasard parmi les 7 types disponibles avec une distribution uniforme
- `spawnPosition()` — retourne toujours la même position de spawn centrale

### Méthode d'instance
- `toIPiece()` — sérialise l'instance en `IPiece` pour l'envoi réseau
  - Retourne une **copie** de la position, pas une référence — pour éviter toute mutation accidentelle
  - Ne contient que `type` et `position` — le client calcule tout le reste (forme, rotations, couleur)

### Ce que la classe Piece ne fait PAS
- Elle ne stocke pas la forme du tetrimino — c'est la responsabilité du client
- Elle ne gère pas les rotations — idem
- Elle ne connaît pas les couleurs — idem
- Elle n'interagit pas avec le plateau — la logique de collision est entièrement côté client

---

## 6. Classe `Player`

### Rôle
- Représente **un joueur humain connecté** à une room
- Fait le lien entre une socket réseau (technique) et des données de jeu (métier)
- **Encapsule** la socket : aucun autre objet ne devrait appeler `socket.emit()` directement sur la socket d'un joueur

### Propriétés
- `id` — identifiant unique, égal à `socket.id` — attribué par Socket.IO — lecture seule
- `name` — pseudo choisi par le joueur — lecture seule (ne change pas en cours de partie)
- `roomName` — nom de la room à laquelle il appartient — lecture seule
- `socket` — référence à la socket Socket.IO — **privée**, jamais exposée à l'extérieur de la classe
- `isHost` — booléen indiquant si ce joueur est l'hôte de la room — mutable (change lors d'un transfert d'hôte)
- `isAlive` — booléen indiquant si ce joueur est encore en jeu — mutable (passe à `false` à l'élimination)
- `pieceIndex` — index entier pointant vers la prochaine pièce à récupérer dans la séquence partagée — mutable (incrémenté à chaque `REQUEST_PIECE`)

### Méthodes d'instance
- `emit(event, data)` — envoie un événement Socket.IO **uniquement à ce joueur**
  - Wrapping de `socket.emit` pour ne pas exposer la socket
  - Typé génériquement pour forcer la cohérence entre l'événement et le payload
- `joinSocketRoom()` — abonne la socket de ce joueur à la room Socket.IO correspondante
  - Permet ensuite d'utiliser `io.to(roomName).emit()` pour broadcaster à tous les membres
  - À appeler dans `Game.addPlayer()` immédiatement après l'ajout
- `leaveSocketRoom()` — désabonne la socket de la room Socket.IO
  - À appeler dans `Game.removePlayer()` lors du départ
- `toIPlayerInfo()` — sérialise en `IPlayerInfo` pour l'envoi aux clients
  - N'expose pas la socket, ni le `pieceIndex`, ni l'`id`
- `reset()` — remet le joueur dans son état initial pour une nouvelle partie
  - Remet `isAlive` à `true`
  - Remet `pieceIndex` à `0`
  - À appeler dans `Game.restart()` sur tous les joueurs

### Ce que la classe Player ne fait PAS
- Elle ne connaît pas les autres joueurs de sa room
- Elle ne connaît pas la séquence de pièces
- Elle ne contient aucune logique de jeu
- Elle ne dispatche aucun événement à la room entière — c'est le rôle de `Game`

---

## 7. Classe `Game`

### Rôle
- Représente **une partie en cours** dans une room nommée
- C'est le **cœur du serveur** : toute la logique de coordination multijoueur passe ici
- Reçoit les instructions des handlers socket et orchestre les players et les pièces

### Propriétés
- `roomName` — identifiant de la room, lecture seule après construction
- `status` — statut de la partie : `'waiting'` | `'playing'` | `'ended'`
  - `waiting` : en attente que l'hôte démarre
  - `playing` : partie en cours, plus aucun joueur ne peut rejoindre
  - `ended` : partie terminée, l'hôte peut relancer
- `players` — `Map<string, Player>` — les joueurs indexés par leur `socket.id`
  - Choix de `Map` plutôt qu'un tableau : accès O(1) par socket.id, iteration ordonnée
- `pieces` — tableau de `Piece` — la séquence partagée, générée au démarrage de la partie
  - Vide pendant la phase `waiting`
- `io` — référence à l'instance Socket.IO Server — **privée**, utilisée pour les broadcasts

### Méthodes de gestion des joueurs

#### `addPlayer(player: Player): boolean`
- Vérifie que la partie n'est pas déjà en cours (`status !== 'playing'`) — si c'est le cas, envoyer quand même `ROOM_STATE` au joueur pour lui afficher l'état courant, puis retourner `false`
- Si la `Map` est vide → ce joueur est le premier → lui attribuer `isHost = true`
- Ajouter le joueur à la `Map`
- Appeler `player.joinSocketRoom()` pour l'abonner aux broadcasts
- Envoyer `ROOM_STATE` **uniquement à ce joueur** via `player.emit()` — avec l'état actuel des joueurs et son flag `isHost` personnalisé
- Broadcaster `PLAYER_JOINED` à **tous les autres** via `broadcastToOthers()` — pas au nouveau pour éviter qu'il reçoive deux fois
- Retourner `true`

#### `removePlayer(socketId: string): void`
- Récupérer le player depuis la `Map` — si inexistant, sortir immédiatement
- Le supprimer de la `Map`
- Appeler `player.leaveSocketRoom()`
- Broadcaster `PLAYER_LEFT` à tous les joueurs restants
- Si la `Map` est maintenant vide → ne rien faire de plus (le `GameManager` nettoiera)
- Si le joueur qui part était l'hôte → appeler `transferHost()`
- Si la partie était en cours (`status === 'playing'`) → appeler `checkWinCondition()`

#### `getPlayer(socketId: string): Player | undefined`
- Accès direct à la `Map` — retourne `undefined` si le joueur n'existe pas

#### `getPlayersInfo(): IPlayerInfo[]`
- Itère sur tous les joueurs de la `Map`
- Retourne un tableau de `IPlayerInfo` via `player.toIPlayerInfo()` pour chaque joueur

#### `isEmpty(): boolean`
- Retourne `true` si la `Map` est vide — utilisé par `GameManager.cleanupIfEmpty()`

### Méthodes de gestion de la partie

#### `start(): void`
- Vérifier que `status === 'waiting'` — si non, logger un avertissement et sortir
- Passer `status` à `'playing'`
- Générer la séquence de pièces via `generatePieceSequence(PIECE_SEQUENCE_LENGTH)` — **avant** de notifier les clients
- Appeler `player.reset()` sur tous les joueurs de la `Map`
- Broadcaster `GAME_STARTED` à tous les joueurs via `broadcast()`

#### `restart(): void`
- Remettre `status` à `'waiting'`
- Appeler `start()` — réutilise toute la logique de démarrage

#### `getNextPiece(player: Player): void`
- Vérifier que `status === 'playing'`
- Vérifier que `player.pieceIndex` ne dépasse pas `pieces.length` (garde-fou contre l'épuisement de séquence)
- Récupérer `pieces[player.pieceIndex]`
- Incrémenter `player.pieceIndex`
- Envoyer `NEW_PIECE` avec `piece.toIPiece()` **uniquement à ce joueur** via `player.emit()`
- **Point critique** : deux joueurs à `pieceIndex = 0` reçoivent la même pièce — c'est la garantie du sujet ("mêmes pièces dans le même ordre")

#### `applyPenalty(sourcePlayer: Player, linesCleared: number): void`
- Calculer `penaltyCount = Math.max(0, linesCleared - 1)` — règle du sujet
- Si `penaltyCount === 0` → sortir sans rien faire (1 ligne effacée = 0 pénalité)
- Itérer sur tous les joueurs de la `Map`
  - Exclure `sourcePlayer` (il ne se pénalise pas lui-même)
  - Exclure les joueurs dont `isAlive === false` (inutile d'envoyer des pénalités à un joueur déjà éliminé)
  - Envoyer `PENALTY_LINES` avec `{ count: penaltyCount }` via `player.emit()`

#### `updateSpectrum(player: Player, spectrum: number[]): void`
- Le spectre est calculé côté client — le serveur ne fait que le relayer
- Appeler `broadcastToOthers(player.id, SPECTRUM_UPDATE, { playerName: player.name, spectrum })`
- Le joueur source n'a pas besoin de recevoir son propre spectre

#### `eliminatePlayer(player: Player): void`
- Vérifier que `player.isAlive` — si déjà `false`, sortir (éviter les doublons)
- Passer `player.isAlive` à `false`
- Broadcaster `PLAYER_ELIMINATED` avec `{ playerName: player.name }` à tous
- Appeler `checkWinCondition()`

#### `checkWinCondition(): void`
- Ne faire quelque chose que si `status === 'playing'`
- Filtrer les joueurs vivants : `alivePlayers = players où isAlive === true`
- **Cas 1 — Mode solo (1 joueur total)** : si `alivePlayers.length === 0` → appeler `endGame(null)`
- **Cas 2 — Mode multijoueur** : si `alivePlayers.length <= 1` → le vainqueur est `alivePlayers[0]` si il existe, sinon `null`
- Si aucune condition remplie → la partie continue, ne rien faire

#### `endGame(winner: string | null): void` — méthode privée
- Passer `status` à `'ended'`
- Broadcaster `GAME_OVER` avec `{ winner: winner ?? '' }` à tous les joueurs

### Méthodes de gestion de l'hôte

#### `transferHost(): void` — méthode privée
- Récupérer le premier joueur disponible dans la `Map` via `.values().next().value`
- Si aucun joueur disponible → sortir (room vide)
- Passer `nextPlayer.isHost = true`
- Broadcaster `HOST_CHANGED` avec `{ newHost: nextPlayer.name }` à tous

### Méthodes de broadcast — méthodes utilitaires privées

#### `broadcast(event, data): void`
- Utilise `io.to(this.roomName).emit(event, data)`
- Envoie à **tous** les membres de la room Socket.IO (y compris l'émetteur d'origine)
- Usage : `GAME_STARTED`, `PLAYER_LEFT`, `PLAYER_ELIMINATED`, `GAME_OVER`, `HOST_CHANGED`

#### `broadcastToOthers(excludeSocketId, event, data): void`
- Itère sur la `Map` et appelle `player.emit()` sur chaque joueur sauf celui dont l'id est exclu
- Usage : `PLAYER_JOINED` (exclure le nouveau), `SPECTRUM_UPDATE` (exclure l'émetteur)
- **Alternative** : Socket.IO propose `socket.to(room).emit()` qui exclut automatiquement la socket source — les deux approches sont valides, mais itérer sur la `Map` est plus explicite et testable

---

## 8. Classe `GameManager`

### Rôle
- **Registre global** de toutes les instances de `Game` actives en mémoire
- Implémente le **pattern Singleton** : une seule instance existe dans tout le processus Node.js
- Fait le lien entre les événements socket (identifiés par `roomName`) et les objets `Game`

### Pattern Singleton — justification
- Les handlers socket reçoivent le `GameManager` par injection depuis `index.ts`
- On aurait pu utiliser une simple variable globale de module, mais le Singleton explicite est plus testable (possibilité de reset entre les tests) et plus lisible

### Propriétés
- `instance` — propriété statique privée stockant l'unique instance — initialement `null`
- `games` — `Map<string, Game>` — les rooms actives indexées par leur nom
- `io` — référence à Socket.IO Server — injectée via `setIO()` après construction

### Méthodes

#### `getInstance(): GameManager` — statique
- Retourne l'instance existante ou en crée une nouvelle si elle n'existe pas encore
- À appeler dans `index.ts` pour obtenir le GameManager

#### `setIO(io: Server): void`
- Injecte la référence Socket.IO — nécessaire car `io` n'existe pas encore au moment de la construction du Singleton (il est créé après)
- Doit être appelé **une seule fois** dans `index.ts` avant tout autre usage

#### `getOrCreateGame(roomName: string): Game`
- Si une `Game` existe déjà pour ce `roomName` → la retourner
- Sinon → créer une nouvelle instance de `Game` avec `roomName` et `io`, l'ajouter à la `Map`, la retourner
- C'est la méthode appelée à chaque `JOIN_ROOM`

#### `getGame(roomName: string): Game | undefined`
- Simple accès à la `Map` — retourne `undefined` si la room n'existe pas
- Utilisé par tous les handlers autre que `JOIN_ROOM`

#### `removeGame(roomName: string): void`
- Supprime la room de la `Map` — libère la mémoire

#### `cleanupIfEmpty(roomName: string): void`
- Récupère la game et vérifie si elle est vide via `game.isEmpty()`
- Si vide → appelle `removeGame()`
- À appeler systématiquement dans le handler `disconnect`

#### `getActiveGamesCount(): number`
- Retourne la taille de la `Map` — utile pour les tests et le monitoring

#### `resetForTests(): void` — statique
- Remet `instance` à `null`
- **Uniquement pour les tests** — permet à chaque test de repartir d'un état propre

---

## 9. Utilitaire — `pieceGenerator.ts`

### Rôle
- Génère la **séquence de pièces partagée** par tous les joueurs d'une room
- Appelé **une seule fois** par partie, dans `Game.start()`
- La séquence est suffisamment longue pour couvrir une partie entière sans jamais s'épuiser

### Algorithme — Bag System (système de sac)
- C'est l'algorithme officiel du Tetris moderne — il garantit une distribution équilibrée des pièces
- **Principe** :
  - On remplit un "sac" virtuel avec les 7 types de tetriminos
  - On mélange le sac dans un ordre aléatoire (**algorithme Fisher-Yates**)
  - On vide le sac dans la séquence
  - Quand le sac est vide, on le remplit à nouveau et on recommence
- **Avantage** : on ne peut jamais avoir plus de 12 pièces consécutives sans voir apparaître chaque type au moins une fois — évite les longues séries de la même pièce

### Algorithme Fisher-Yates — pourquoi ce choix
- Garantit une **permutation parfaitement uniforme** — chaque ordre possible est équiprobable
- Complexité O(n) — très efficace
- Alternatif naïf (`sort(() => Math.random() - 0.5)`) est biaisé — ne pas l'utiliser

### Propriétés de la séquence générée
- Les pièces sont des instances de la classe `Piece` — type + position de spawn
- La séquence est immutable après génération — les clients ne peuvent pas l'influencer
- Tous les joueurs naviguent dans le **même tableau**, chacun avec son propre `pieceIndex`
- La séquence est détruite et régénérée à chaque nouvelle partie (`restart()`)

### Garantie du sujet — "mêmes pièces dans le même ordre"
- Alice à `pieceIndex = 5` et Bob à `pieceIndex = 5` reçoivent exactement la même pièce
- Ils peuvent être à des index différents à n'importe quel moment — c'est normal, ils jouent à leur propre rythme
- Ce qui est garanti : **quand ils arrivent au même index, ils voient la même pièce**

---

## 10. Couche Socket — `handlers.ts` et `emitters.ts`

### Principe général de séparation

- **`handlers.ts`** : écoute les événements **entrants** (Client → Serveur) — lit, valide, délègue à `Game`
- **`emitters.ts`** : fonctions d'émission **sortantes** (Serveur → Client) — encapsule les appels à `socket.emit` et `io.to().emit`
- Cette séparation améliore la testabilité : les handlers peuvent être testés en mockant les emitters

### `handlers.ts` — Logique de chaque handler

#### Principe commun à tous les handlers
- **Valider d'abord** : tout payload mal formé est silencieusement ignoré (pas d'envoi d'erreur au client)
- **Récupérer ensuite** : obtenir la `Game` via `gameManager.getGame()`, puis le `Player` via `game.getPlayer(socket.id)`
- **Autoriser** : vérifier les droits (ex. : seul l'hôte peut démarrer)
- **Déléguer** : appeler la méthode de `Game` correspondante — aucune logique métier dans le handler lui-même

#### Handler `JOIN_ROOM`
- Valider que `room` et `playerName` sont des chaînes non vides
- Sanitiser : trim(), limite de longueur (20 chars pour le nom, 30 pour la room)
- Vérifier que les caractères sont sûrs pour une utilisation comme clé de `Map` (éviter les injections)
- Appeler `gameManager.getOrCreateGame(room)` — crée la room si nécessaire
- Créer une nouvelle instance de `Player` avec la socket courante
- Appeler `game.addPlayer(player)`
- Stocker le `roomName` dans les données de la socket (ex. : `socket.data.currentRoom`) pour la retrouver lors du `disconnect`

#### Handler `START_GAME`
- Valider que `room` est fourni
- Récupérer la `Game` — si absente, ignorer
- Récupérer le `Player` — si absent, ignorer
- Vérifier `player.isHost === true` — si non, ignorer (pas d'envoi d'erreur)
- Déléguer à `game.start()`

#### Handler `REQUEST_PIECE`
- Valider que `room` est fourni
- Récupérer `Game` et `Player`
- Vérifier que le joueur est en vie (`player.isAlive`)
- Déléguer à `game.getNextPiece(player)`

#### Handler `UPDATE_SPECTRUM`
- Valider que `room` est fourni et que `spectrum` est un tableau
- Vérifier que le tableau contient **exactement 10 valeurs** — si non, ignorer
- Vérifier que toutes les valeurs sont des nombres entre 0 et 20 — si non, ignorer
- Récupérer `Game` et `Player`
- Vérifier que le joueur est en vie
- Déléguer à `game.updateSpectrum(player, spectrum)`

#### Handler `LINES_CLEARED`
- Valider que `room` est fourni et que `count` est un nombre
- Vérifier que `count` est compris entre 1 et 4 inclus — si non, ignorer
- Récupérer `Game` et `Player`
- Vérifier que le joueur est en vie
- Déléguer à `game.applyPenalty(player, count)`

#### Handler `GAME_OVER_PLAYER`
- Valider que `room` est fourni
- Récupérer `Game` et `Player`
- Déléguer à `game.eliminatePlayer(player)`

#### Handler `RESTART_GAME`
- Valider que `room` est fourni
- Récupérer `Game` et `Player`
- Vérifier `player.isHost === true`
- Déléguer à `game.restart()`

#### Handler `disconnect` — événement natif Socket.IO
- Récupérer le `roomName` depuis `socket.data.currentRoom`
- Si absent (joueur qui n'avait pas encore rejoint de room) → sortir
- Récupérer la `Game` via `gameManager.getGame(roomName)`
- Appeler `game.removePlayer(socket.id)`
- Appeler `gameManager.cleanupIfEmpty(roomName)` — supprime la room si elle est vide

### `emitters.ts` — Fonctions d'émission typées

- Fournit des **wrappers typés** autour de `socket.emit()` et `io.to().emit()`
- Chaque fonction prend un payload typé — le compilateur TypeScript garantit la cohérence
- Utile pour centraliser les appels d'émission et faciliter le mocking dans les tests
- Fonctions typiques :
  - `emitToSocket(socket, event, payload)` — émission à une seule socket
  - `emitToRoom(io, roomName, event, payload)` — broadcast à une room entière
  - Des fonctions spécialisées pour chaque événement important : `emitRoomState`, `emitNewPiece`, `emitPenaltyLines`, `emitGameOver`...

---

## 11. Protocole Réseau complet

### Tableau des événements Client → Serveur

| Événement | Champs du payload | Validation serveur | Droits requis |
|---|---|---|---|
| `JOIN_ROOM` | `room`, `playerName` | Non vides, longueur max, caractères sûrs | Aucun |
| `START_GAME` | `room` | Room existante | isHost |
| `REQUEST_PIECE` | `room` | Room et joueur existants | isAlive |
| `UPDATE_SPECTRUM` | `room`, `spectrum` | Tableau de 10 nombres (0-20) | isAlive |
| `LINES_CLEARED` | `room`, `count` | count entre 1 et 4 | isAlive |
| `GAME_OVER_PLAYER` | `room` | Room et joueur existants | Aucun |
| `RESTART_GAME` | `room` | Room existante | isHost |

### Tableau des événements Serveur → Client

| Événement | Payload | Destinataires | Déclencheur |
|---|---|---|---|
| `ROOM_STATE` | `{ players, gameStatus, isHost }` | Joueur venant de joindre (lui seul) | `addPlayer()` |
| `PLAYER_JOINED` | `{ name, isHost, isAlive }` | Tous sauf le nouveau | `addPlayer()` |
| `PLAYER_LEFT` | `{ playerName }` | Tous les restants | `removePlayer()` |
| `HOST_CHANGED` | `{ newHost }` | Tous | `transferHost()` |
| `GAME_STARTED` | `{}` | Tous | `start()` |
| `NEW_PIECE` | `{ piece: { type, position } }` | Joueur demandeur uniquement | `getNextPiece()` |
| `SPECTRUM_UPDATE` | `{ playerName, spectrum }` | Tous sauf l'émetteur | `updateSpectrum()` |
| `PENALTY_LINES` | `{ count }` | Tous les vivants sauf la source | `applyPenalty()` |
| `PLAYER_ELIMINATED` | `{ playerName }` | Tous | `eliminatePlayer()` |
| `GAME_OVER` | `{ winner }` | Tous | `endGame()` |

---

## 12. Cycle de vie complet d'une Room

> Cette section est **absente du brouillon original** — elle est pourtant essentielle pour comprendre tous les cas limites à implémenter.

### Phase 1 — Création de la room
- Un client envoie `JOIN_ROOM` avec un `roomName` qui n'existe pas encore
- `GameManager.getOrCreateGame()` crée une nouvelle instance de `Game` avec `status = 'waiting'`
- Le joueur est ajouté, il devient automatiquement l'hôte
- La room est maintenant enregistrée dans le `GameManager`

### Phase 2 — Salle d'attente (waiting)
- D'autres clients peuvent rejoindre en envoyant `JOIN_ROOM` avec le même `roomName`
- Chaque nouvel arrivant reçoit `ROOM_STATE` et les autres reçoivent `PLAYER_JOINED`
- Si un joueur part, `PLAYER_LEFT` est broadcasté
- Si l'hôte part, `transferHost()` est appelé et `HOST_CHANGED` est envoyé
- Les joueurs qui arrivent après que la partie a démarré reçoivent `ROOM_STATE` avec `gameStatus: 'playing'` mais ne peuvent pas participer — ils attendent la prochaine partie

### Phase 3 — Démarrage de la partie
- L'hôte envoie `START_GAME`
- `status` passe à `'playing'`
- La séquence de pièces est générée
- Tous les joueurs reçoivent `GAME_STARTED`
- Chaque client envoie immédiatement `REQUEST_PIECE` (deux fois de suite en réalité : une pour la pièce courante, une pour la "next piece")

### Phase 4 — Partie en cours (playing)
- Boucle continue : `REQUEST_PIECE` → `NEW_PIECE` → (jeu local) → `REQUEST_PIECE`...
- Régulièrement : `UPDATE_SPECTRUM` → `SPECTRUM_UPDATE` vers les adversaires
- À chaque effacement de lignes : `LINES_CLEARED` → `PENALTY_LINES` vers les autres joueurs vivants
- Si un joueur est éliminé : `GAME_OVER_PLAYER` → `PLAYER_ELIMINATED` → `checkWinCondition()`
- Si un joueur se déconnecte pendant la partie : traité comme une élimination puis un départ

### Phase 5 — Fin de partie
- `checkWinCondition()` détecte qu'il ne reste qu'un (ou zéro) joueur vivant
- `status` passe à `'ended'`
- `GAME_OVER` est broadcasté à tous avec le nom du vainqueur
- La room reste en mémoire (le `GameManager` ne la supprime pas automatiquement)

### Phase 6 — Redémarrage
- L'hôte envoie `RESTART_GAME`
- `status` repasse à `'waiting'` puis immédiatement à `'playing'`
- Nouvelle séquence de pièces générée
- Tous les joueurs actuels (dont les éliminés) sont remis à `isAlive = true`, `pieceIndex = 0`
- `GAME_STARTED` est broadcasté à tous

### Phase 7 — Fermeture de la room
- Le dernier joueur se déconnecte ou quitte
- `game.isEmpty()` retourne `true`
- `GameManager.cleanupIfEmpty()` appelle `removeGame()`
- L'instance de `Game` est supprimée de la `Map` et sera garbage collectée

---

## 13. Gestion des erreurs et robustesse

> Cette section est **absente du brouillon original** — c'est pourtant un domaine critique pour un serveur de jeu en temps réel.

### Stratégie générale
- **Ne jamais crasher** : le serveur doit rester opérationnel même face à des payloads malformés ou des comportements inattendus des clients
- **Fail silently** : ignorer les événements invalides sans répondre d'erreur (pour ne pas donner d'informations à des clients malveillants)
- **Logger** : tracer les anomalies côté serveur pour le débogage, sans les exposer au client

### Validation des payloads entrants
- Tout handler commence par valider la **structure** du payload (champs présents, bons types)
- Puis valider les **valeurs** (bornes numériques, longueurs de chaînes, valeurs attendues)
- Si invalide → logger un avertissement et `return` immédiatement
- Exemples de validations critiques :
  - `count` dans `LINES_CLEARED` doit être entre 1 et 4 — un client malveillant pourrait envoyer 1000
  - `spectrum` dans `UPDATE_SPECTRUM` doit être un tableau de **exactement 10 nombres** entre 0 et 20
  - `roomName` et `playerName` doivent être sanitisés pour éviter les caractères spéciaux

### Gestion des déconnexions inattendues
- Socket.IO émet automatiquement `disconnect` sur chaque socket qui se ferme (fermeture du navigateur, coupure réseau, timeout)
- Le handler `disconnect` doit être **idempotent** : appeler `removePlayer` sur un `socketId` inexistant ne doit pas causer d'erreur
- Si la déconnexion survient pendant une partie → traiter comme si le joueur avait abandonné
  - Si c'était l'hôte → transfert automatique de l'hôte
  - Si c'était un joueur en vie → vérifier la condition de victoire

### Prévention des memory leaks
- Chaque room vide doit être supprimée du `GameManager` via `cleanupIfEmpty()`
- Sans ce nettoyage, des rooms fantômes s'accumulent en mémoire au fil du temps
- À vérifier : la room est-elle bien supprimée si le seul joueur se déconnecte avant que la partie commence ?

### Gestion des états incohérents
- Un joueur qui envoie `REQUEST_PIECE` alors que la partie n'est pas en cours → ignorer
- Un joueur qui envoie `GAME_OVER_PLAYER` alors qu'il est déjà `isAlive = false` → ignorer (déjà géré dans `eliminatePlayer`)
- Un joueur qui essaie de démarrer une partie déjà démarrée → logger + ignorer
- Un joueur qui essaie de rejoindre une room pleine (partie en cours) → recevoir `ROOM_STATE` mais ne pas jouer

---

## 14. Tests unitaires

### Objectifs de couverture (imposés par le sujet)
- Statements : ≥ 70%
- Functions : ≥ 70%
- Lines : ≥ 70%
- Branches : ≥ 50%

### Framework recommandé
- **Jest** avec **ts-jest** pour le support TypeScript natif
- Pas de bibliothèque de mocking externe nécessaire — Jest fournit `jest.fn()` et `jest.spyOn()`
- Pour les tests impliquant Socket.IO : utiliser des **mocks manuels** de `Socket` et `Server` (pas besoin de vrais WebSockets)

### Stratégie de mock pour Socket.IO
- La classe `Player` encapsule la socket → dans les tests, passer un objet "fake socket" avec `id`, `emit`, `join`, `leave` comme `jest.fn()`
- La classe `Game` reçoit `io` dans son constructeur → passer un objet "fake io" avec `to()` retournant `{ emit: jest.fn() }`
- Ces mocks simples suffisent pour tester toute la logique métier sans vrai réseau

### Ce qu'il faut tester — priorités

#### `Piece.test.ts` — priorité haute (fonctions pures, facile à tester)
- `new Piece()` sans argument → type valide parmi les 7
- `new Piece('I')` → type forcé respecté
- `Piece.randomType()` sur 1000 appels → tous les 7 types apparaissent
- `Piece.spawnPosition()` → x = 3, y = -1
- `toIPiece()` → retourne uniquement `type` et `position`, pas de référence partagée

#### `Player.test.ts` — priorité haute
- Construction → vérifier toutes les valeurs initiales (`isHost = false`, `isAlive = true`, `pieceIndex = 0`)
- `emit()` → vérifie que `socket.emit` est appelé avec les bons arguments
- `joinSocketRoom()` → vérifie que `socket.join(roomName)` est appelé
- `reset()` → vérifie que `isAlive` et `pieceIndex` sont remis à leurs valeurs initiales
- `toIPlayerInfo()` → vérifie que socket et pieceIndex ne sont pas exposés

#### `Game.test.ts` — priorité haute (logique métier centrale)
- `addPlayer()` → premier joueur = hôte, second = pas hôte
- `addPlayer()` → refus si `status === 'playing'`
- `removePlayer()` → transfert d'hôte si l'hôte part
- `start()` → `status = 'playing'`, séquence générée, tous les joueurs reset
- `start()` → idempotent si déjà en cours
- `getNextPiece()` → incrémente `pieceIndex`, Alice et Bob à `pieceIndex = 0` reçoivent la même pièce
- `applyPenalty()` → 0 pénalité pour 1 ligne, 1 pour 2, 3 pour 4, source exclue, morts exclus
- `eliminatePlayer()` → `isAlive = false`, pas de doublon si appelé deux fois
- `checkWinCondition()` → fin de partie solo, fin de partie avec vainqueur, pas de fin si 2+ joueurs vivants
- `transferHost()` → le premier joueur restant devient hôte

#### `GameManager.test.ts` — priorité moyenne
- `getInstance()` → toujours la même instance
- `getOrCreateGame()` → crée si absente, retourne l'existante si présente
- `cleanupIfEmpty()` → supprime la room vide, ne supprime pas si des joueurs restent
- `resetForTests()` → remet à zéro le singleton entre les tests

#### `pieceGenerator.test.ts` — priorité moyenne
- Génère exactement N pièces
- Tous les types sont valides
- Tous les 7 types apparaissent dans une séquence de 200+ pièces
- Distribution équilibrée : dans 700 pièces, chaque type ≈ 100 fois (± 20%)
- Deux appels successifs génèrent des séquences différentes

---

## 15. Contraintes imposées par le sujet

### Côté Serveur — OBLIGATOIRE
- Classes `Player`, `Piece`, `Game` définies avec la syntaxe `class` et utilisant `this`
- Approche orientée objet avec prototypes/instances — pas de fonctions pures pour la logique serveur
- Node.js comme runtime
- Socket.IO pour la communication temps réel bidirectionnelle
- Tous les joueurs d'une room reçoivent les **mêmes pièces dans le même ordre**

### Général
- TypeScript autorisé (superset de JavaScript, compile vers JS standard)
- Couverture de tests ≥ 70% statements/functions/lines, ≥ 50% branches
- Pas de persistence de données — tout en mémoire
- **Ne jamais stocker** de credentials, clés API ou variables d'environnement dans le dépôt Git
- Utiliser un fichier `.env` avec `.gitignore`

### Récapitulatif des règles en tableau

| Règle | Statut | Détail |
|---|---|---|
| Classes Player, Piece, Game | ✅ Obligatoire | Avec `this`, méthodes d'instance |
| OOP côté serveur | ✅ Obligatoire | Contrairement au client (fonctions pures) |
| Node.js | ✅ Obligatoire | Runtime serveur |
| Socket.IO | ✅ Obligatoire | Communication temps réel |
| Pas de persistence | ✅ Obligatoire | Tout en mémoire |
| Même séquence de pièces | ✅ Obligatoire | Séquence partagée + pieceIndex personnel |
| Tests ≥ 70% | ✅ Obligatoire | Statements, Functions, Lines |
| Tests branches ≥ 50% | ✅ Obligatoire | — |
| `.env` gitignored | ✅ Obligatoire | Jamais de secrets en repo |
| Validation des payloads | ✅ Fortement recommandé | Défense contre les clients malveillants |
| Nettoyage des rooms vides | ✅ Fortement recommandé | Prévention des memory leaks |
