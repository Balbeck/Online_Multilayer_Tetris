# 📡 Red Tetris — Documentation Contrat Socket.IO

> Équivalent AsyncAPI / Swagger pour les événements WebSocket
> Standard de référence : **AsyncAPI 2.x** (équivalent OpenAPI pour les protocoles événementiels)
> Ce document est la **source de vérité unique** entre le Backend Node.js et le Frontend Next.js

---

## ℹ️ Pourquoi AsyncAPI et pas OpenAPI ?

OpenAPI (Swagger) est conçu pour les API **requête/réponse HTTP** (REST) : un client envoie une requête, le serveur répond une fois.

Socket.IO fonctionne sur un modèle **événementiel bidirectionnel** :
- Les deux parties (client ET serveur) peuvent émettre à tout moment
- Un événement client peut déclencher **zéro, un ou plusieurs** événements serveur en retour
- Certains événements sont **broadcastés** à d'autres clients (pas à l'émetteur)
- Il n'y a pas de concept de "réponse" — seulement des flux d'événements

**AsyncAPI** est le standard qui comble ce manque. Ce document en adopte la structure et la terminologie, adaptées au format Markdown lisible par tous.

---

## 📋 Table des matières

1. [Informations générales](#1-informations-générales)
2. [Modèles de données partagés](#2-modèles-de-données-partagés)
3. [Événements Client → Serveur](#3-événements-client--serveur)
   - [JOIN_ROOM](#31-join_room)
   - [START_GAME](#32-start_game)
   - [REQUEST_PIECE](#33-request_piece)
   - [UPDATE_SPECTRUM](#34-update_spectrum)
   - [LINES_CLEARED](#35-lines_cleared)
   - [GAME_OVER_PLAYER](#36-game_over_player)
   - [RESTART_GAME](#37-restart_game)
4. [Événements Serveur → Client](#4-événements-serveur--client)
   - [ROOM_STATE](#41-room_state)
   - [PLAYER_JOINED](#42-player_joined)
   - [PLAYER_LEFT](#43-player_left)
   - [HOST_CHANGED](#44-host_changed)
   - [GAME_STARTED](#45-game_started)
   - [NEW_PIECE](#46-new_piece)
   - [SPECTRUM_UPDATE](#47-spectrum_update)
   - [PENALTY_LINES](#48-penalty_lines)
   - [PLAYER_ELIMINATED](#49-player_eliminated)
   - [GAME_OVER](#410-game_over)
5. [Diagrammes de séquence par scénario](#5-diagrammes-de-séquence-par-scénario)
6. [Machine à états — cycle de vie d'une Room](#6-machine-à-états--cycle-de-vie-dune-room)
7. [Machine à états — cycle de vie d'un Client](#7-machine-à-états--cycle-de-vie-dun-client)
8. [Règles de validation des payloads](#8-règles-de-validation-des-payloads)
9. [Gestion des erreurs et comportements limites](#9-gestion-des-erreurs-et-comportements-limites)
10. [Matrice de compatibilité — Qui reçoit quoi ?](#10-matrice-de-compatibilité--qui-reçoit-quoi-)
11. [Checklist d'implémentation Backend / Frontend](#11-checklist-dimplémentation-backend--frontend)

---

## 1. Informations générales

| Propriété | Valeur |
|---|---|
| **Protocole** | WebSocket (via Socket.IO 4.x) |
| **Transport principal** | WebSocket |
| **Transport de fallback** | HTTP long-polling |
| **URL du serveur (dev)** | `ws://localhost:3001` |
| **URL du serveur (prod)** | Définie par `NEXT_PUBLIC_SERVER_URL` |
| **Authentification** | Aucune — le nom et la room sont transmis dans le premier payload `JOIN_ROOM` |
| **Format des données** | JSON (sérialisé automatiquement par Socket.IO) |
| **Version Socket.IO** | 4.x (client et serveur doivent être sur la même version majeure) |
| **Reconnexion automatique** | Activée côté client — 5 tentatives, délai 1 000 ms |

### Conventions de nommage des événements

- Tous les événements sont en **SCREAMING_SNAKE_CASE** : `JOIN_ROOM`, `GAME_STARTED`...
- Les événements **Client → Serveur** sont des **verbes à l'infinitif** ou des **actions** : `JOIN_ROOM`, `REQUEST_PIECE`, `LINES_CLEARED`
- Les événements **Serveur → Client** sont des **faits accomplis** : `ROOM_STATE`, `GAME_STARTED`, `PLAYER_ELIMINATED`

### Identification d'un client

Un client est identifié par deux informations complémentaires :
- **`socket.id`** : identifiant technique unique attribué par Socket.IO à chaque connexion — change à chaque reconnexion
- **`playerName` + `roomName`** : identité logique transmise dans `JOIN_ROOM` — persiste tant que le joueur ne quitte pas la page

> ⚠️ Socket.IO ne fournit pas de mécanisme de session persistant. Si un joueur se déconnecte et se reconnecte, il est traité comme un **nouveau joueur** et doit renvoyer `JOIN_ROOM`.

---

## 2. Modèles de données partagés

> Ces modèles sont définis dans `shared/types.ts` et utilisés dans les payloads de tous les événements.

---

### `PieceType`

**Type** : string enum

**Valeurs possibles** :

| Valeur | Tetrimino | Description |
|---|---|---|
| `"I"` | I-piece | Barre horizontale de 4 blocs |
| `"O"` | O-piece | Carré 2×2 |
| `"T"` | T-piece | Forme en T |
| `"S"` | S-piece | Décalé vers la droite |
| `"Z"` | Z-piece | Décalé vers la gauche |
| `"J"` | J-piece | L inversé |
| `"L"` | L-piece | L normal |

---

### `Position`

**Type** : objet

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `x` | `number` (entier) | 0 ≤ x ≤ 9 à la pose | Colonne sur le plateau (0 = bord gauche) |
| `y` | `number` (entier) | -1 ≤ y ≤ 19 | Ligne sur le plateau (0 = haut, -1 = spawn hors plateau) |

> **Note sur `y = -1`** : la position de spawn initiale a intentionnellement `y = -1`. Cela permet au client de détecter un game over **avant** que la pièce soit visible : si `isValidPosition()` retourne `false` pour `y = -1`, le plateau est plein.

---

### `IPiece`

**Type** : objet — représentation minimale d'une pièce envoyée par le serveur

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `type` | `PieceType` | Voir ci-dessus | Le type du tetrimino |
| `position` | `Position` | x=3, y=-1 pour le spawn | Position initiale sur le plateau |

> **Ce que l'objet `IPiece` ne contient PAS** : la forme (matrice de rotation), l'index de rotation, la couleur. Ces données sont calculées côté client à partir du `type`.

**Exemple :**
```json
{
  "type": "T",
  "position": { "x": 3, "y": -1 }
}
```

---

### `IPlayerInfo`

**Type** : objet — représentation publique d'un joueur

| Champ | Type | Description |
|---|---|---|
| `name` | `string` | Pseudo du joueur |
| `isHost` | `boolean` | Ce joueur est-il l'hôte de la room ? |
| `isAlive` | `boolean` | Ce joueur est-il encore en vie dans la partie en cours ? |

> **Ce que l'objet `IPlayerInfo` ne contient PAS** : `socket.id`, `pieceIndex`, la socket elle-même. Ces données sont internes au serveur.

**Exemple :**
```json
{
  "name": "Alice",
  "isHost": true,
  "isAlive": true
}
```

---

### `CellValue`

**Type** : number enum

| Valeur | Signification | Couleur associée |
|---|---|---|
| `0` | Cellule vide | Transparent / fond |
| `1` | Pièce I posée | Cyan `#00f0f0` |
| `2` | Pièce O posée | Jaune `#f0f000` |
| `3` | Pièce T posée | Violet `#a000f0` |
| `4` | Pièce S posée | Vert `#00f000` |
| `5` | Pièce Z posée | Rouge `#f00000` |
| `6` | Pièce J posée | Bleu `#0000f0` |
| `7` | Pièce L posée | Orange `#f0a000` |
| `8` | Ligne de pénalité | Gris `#808080` — **indestructible** |

---

## 3. Événements Client → Serveur

---

### 3.1 `JOIN_ROOM`

**Direction** : Client → Serveur
**Description** : Un joueur demande à rejoindre une room existante ou à en créer une nouvelle. C'est le **premier événement** émis par le client, immédiatement après l'établissement de la connexion WebSocket.

**Quand l'émettre** (Frontend) :
- Dans le `useEffect` de montage de la page `[room]/[player]/page.tsx`
- Une seule fois par connexion — ne pas réémettre si déjà dans la room

**Payload :**

| Champ | Type | Obligatoire | Contraintes | Description |
|---|---|---|---|---|
| `room` | `string` | ✅ Oui | 1–30 caractères, alphanumérique + `-` + `_` | Nom de la room à rejoindre ou créer |
| `playerName` | `string` | ✅ Oui | 1–20 caractères, alphanumérique + `-` + `_` | Pseudo choisi par le joueur |

**Exemple de payload :**
```json
{
  "room": "arena-42",
  "playerName": "Alice"
}
```

**Réponses déclenchées par le serveur :**

| Événement | Destinataire | Condition |
|---|---|---|
| `ROOM_STATE` | Ce client uniquement | Toujours — état complet de la room à l'arrivée |
| `PLAYER_JOINED` | Tous les autres membres de la room | Si la partie n'est pas en cours |

**Comportement serveur selon le contexte :**
- Room inexistante → créée automatiquement, le joueur devient hôte
- Room en attente (`waiting`) → joueur ajouté, notifié avec `ROOM_STATE`, les autres reçoivent `PLAYER_JOINED`
- Room en cours de jeu (`playing`) → le joueur reçoit `ROOM_STATE` avec `gameStatus: 'playing'` mais ne peut pas jouer la partie en cours
- Room terminée (`ended`) → le joueur reçoit `ROOM_STATE` avec `gameStatus: 'ended'` et attend un restart

**Erreurs silencieuses (ignorées par le serveur) :**
- `room` ou `playerName` vides ou manquants → ignoré
- Caractères invalides après sanitisation → ignoré

---

### 3.2 `START_GAME`

**Direction** : Client → Serveur
**Description** : L'hôte de la room démarre officiellement la partie. Déclenche la génération de la séquence de pièces partagée et notifie tous les joueurs.

**Quand l'émettre** (Frontend) :
- Au clic sur le bouton "Démarrer" dans le composant `<Lobby />`
- Uniquement si `isHost === true` dans `roomSlice` (le bouton doit être masqué sinon)

**Payload :**

| Champ | Type | Obligatoire | Contraintes | Description |
|---|---|---|---|---|
| `room` | `string` | ✅ Oui | Room existante | Nom de la room à démarrer |

**Exemple de payload :**
```json
{
  "room": "arena-42"
}
```

**Réponses déclenchées par le serveur :**

| Événement | Destinataire | Condition |
|---|---|---|
| `GAME_STARTED` | Tous les membres de la room | Toujours si émetteur = hôte |

**Comportement serveur selon le contexte :**
- Émetteur = hôte, room en `waiting` → partie démarrée, séquence générée, `GAME_STARTED` broadcasté
- Émetteur ≠ hôte → ignoré silencieusement
- Room déjà en `playing` → ignoré silencieusement

---

### 3.3 `REQUEST_PIECE`

**Direction** : Client → Serveur
**Description** : Le client demande la prochaine pièce de la séquence partagée. Le serveur retourne la pièce correspondant au `pieceIndex` actuel du joueur, puis incrémente ce compteur.

**Quand l'émettre** (Frontend) :
- **2 fois** immédiatement après réception de `GAME_STARTED` (dans le `socketMiddleware`) — pour obtenir `activePiece` et `nextPiece` dès le début
- **1 fois** après chaque `lockPiece` (dans le `socketMiddleware`) — pour faire avancer la file de pièces

**Payload :**

| Champ | Type | Obligatoire | Contraintes | Description |
|---|---|---|---|---|
| `room` | `string` | ✅ Oui | Room existante, partie en cours | Nom de la room |

**Exemple de payload :**
```json
{
  "room": "arena-42"
}
```

**Réponses déclenchées par le serveur :**

| Événement | Destinataire | Condition |
|---|---|---|
| `NEW_PIECE` | Ce client uniquement | Toujours si joueur en vie et partie en cours |

**Comportement serveur selon le contexte :**
- Joueur vivant, partie en cours → `NEW_PIECE` envoyé avec la pièce à `pieces[player.pieceIndex]`, puis `pieceIndex++`
- Joueur éliminé (`isAlive = false`) → ignoré
- Partie pas en cours → ignoré

**Invariant critique :**
> Deux joueurs différents émettant `REQUEST_PIECE` au même `pieceIndex` **reçoivent exactement la même pièce**. C'est la garantie fondamentale du sujet.

---

### 3.4 `UPDATE_SPECTRUM`

**Direction** : Client → Serveur
**Description** : Le client envoie la représentation compressée de son plateau (le "spectre") après chaque modification significative. Le serveur ne fait que relayer ce spectre aux adversaires.

**Quand l'émettre** (Frontend) :
- Dans le `socketMiddleware`, après chaque `lockPiece` (après effacement des lignes)
- Calculé via `computeSpectrum(newBoard)` sur le plateau résultant du lock
- Ne pas émettre à chaque mouvement de pièce — uniquement après chaque pose

**Payload :**

| Champ | Type | Obligatoire | Contraintes | Description |
|---|---|---|---|---|
| `room` | `string` | ✅ Oui | Room existante | Nom de la room |
| `spectrum` | `number[]` | ✅ Oui | Tableau de **exactement 10** entiers, valeurs entre `0` et `20` | Hauteur occupée de chaque colonne (0 = vide, 20 = pleine) |

**Exemple de payload :**
```json
{
  "room": "arena-42",
  "spectrum": [3, 5, 5, 7, 6, 4, 4, 2, 1, 0]
}
```

**Interprétation du spectre :**
- Index `0` = colonne gauche du plateau
- Index `9` = colonne droite du plateau
- Valeur `0` = colonne vide
- Valeur `20` = colonne remplie jusqu'en haut (game over imminent)

**Réponses déclenchées par le serveur :**

| Événement | Destinataire | Condition |
|---|---|---|
| `SPECTRUM_UPDATE` | Tous les membres **sauf** l'émetteur | Toujours si validation OK |

**Comportement serveur selon le contexte :**
- Tableau de 10 valeurs valides → broadcast `SPECTRUM_UPDATE` aux autres
- Tableau de longueur ≠ 10 → ignoré silencieusement
- Valeurs hors bornes [0–20] → ignoré silencieusement

---

### 3.5 `LINES_CLEARED`

**Direction** : Client → Serveur
**Description** : Le client notifie qu'il vient d'effacer des lignes complètes. Le serveur calcule le nombre de lignes de pénalité (`count - 1`) et les distribue à tous les autres joueurs vivants.

**Quand l'émettre** (Frontend) :
- Dans le `socketMiddleware`, après `lockPiece`, si `linesJustCleared > 0`
- Toujours après `UPDATE_SPECTRUM` (même émission groupée après lock)

**Payload :**

| Champ | Type | Obligatoire | Contraintes | Description |
|---|---|---|---|---|
| `room` | `string` | ✅ Oui | Room existante | Nom de la room |
| `count` | `number` (entier) | ✅ Oui | Entier entre **1** et **4** inclus | Nombre de lignes effacées |

**Valeurs valides de `count` et pénalités résultantes :**

| `count` envoyé | Lignes de pénalité distribuées | Nom commun |
|---|---|---|
| `1` | 0 | Single |
| `2` | 1 | Double |
| `3` | 2 | Triple |
| `4` | 3 | Tetris |

**Exemple de payload :**
```json
{
  "room": "arena-42",
  "count": 4
}
```

**Réponses déclenchées par le serveur :**

| Événement | Destinataire | Condition |
|---|---|---|
| `PENALTY_LINES` | Tous les joueurs **vivants sauf** l'émetteur | Si `count >= 2` uniquement |

**Comportement serveur selon le contexte :**
- `count = 1` → aucune pénalité distribuée, événement ignoré après réception (logique correcte)
- `count` entre 2 et 4 → `PENALTY_LINES` envoyé avec `{ count: count - 1 }`
- `count` hors de [1–4] → ignoré silencieusement (sécurité anti-triche)

---

### 3.6 `GAME_OVER_PLAYER`

**Direction** : Client → Serveur
**Description** : Le client se déclare éliminé — sa pile est trop haute et la nouvelle pièce de spawn ne peut pas être placée. Le serveur marque ce joueur comme mort et vérifie si la partie est terminée.

**Quand l'émettre** (Frontend) :
- Dans le `socketMiddleware`, quand `setGameStatus('lost')` est dispatché
- `setGameStatus('lost')` est lui-même déclenché dans `setActivePiece()` quand `isValidPosition()` retourne `false` pour la position de spawn

**Payload :**

| Champ | Type | Obligatoire | Contraintes | Description |
|---|---|---|---|---|
| `room` | `string` | ✅ Oui | Room existante | Nom de la room |

**Exemple de payload :**
```json
{
  "room": "arena-42"
}
```

**Réponses déclenchées par le serveur :**

| Événement | Destinataire | Condition |
|---|---|---|
| `PLAYER_ELIMINATED` | Tous les membres de la room | Toujours |
| `GAME_OVER` | Tous les membres de la room | Si condition de victoire remplie après élimination |

**Comportement serveur selon le contexte :**
- Joueur encore vivant → marqué `isAlive = false`, `PLAYER_ELIMINATED` broadcasté, `checkWinCondition()` appelée
- Joueur déjà éliminé → ignoré (idempotent)
- Dernier joueur vivant éliminé → `GAME_OVER` broadcasté avec `winner: ""`
- Avant-dernier joueur éliminé → `GAME_OVER` broadcasté avec le nom du survivant

---

### 3.7 `RESTART_GAME`

**Direction** : Client → Serveur
**Description** : L'hôte demande le relancement d'une nouvelle partie dans la même room. Tous les joueurs actuellement dans la room participent à la nouvelle partie.

**Quand l'émettre** (Frontend) :
- Au clic sur le bouton "Rejouer" dans le composant `<GameOverlay />`
- Uniquement si `isHost === true` (le bouton est masqué pour les non-hôtes)

**Payload :**

| Champ | Type | Obligatoire | Contraintes | Description |
|---|---|---|---|---|
| `room` | `string` | ✅ Oui | Room existante, partie terminée | Nom de la room |

**Exemple de payload :**
```json
{
  "room": "arena-42"
}
```

**Réponses déclenchées par le serveur :**

| Événement | Destinataire | Condition |
|---|---|---|
| `GAME_STARTED` | Tous les membres de la room | Si émetteur = hôte |

**Comportement serveur selon le contexte :**
- Émetteur = hôte → `status` repasse à `'waiting'` puis `'playing'`, nouvelle séquence générée, tous les joueurs remis `isAlive = true` et `pieceIndex = 0`, `GAME_STARTED` broadcasté
- Émetteur ≠ hôte → ignoré silencieusement

---

## 4. Événements Serveur → Client

---

### 4.1 `ROOM_STATE`

**Direction** : Serveur → Client
**Description** : État complet de la room envoyé à un joueur **dès qu'il rejoint**. C'est l'événement d'hydratation initiale — il permet au client de construire son état Redux depuis zéro.

**Destinataires** : Le joueur qui vient de rejoindre **uniquement**

**Payload :**

| Champ | Type | Description |
|---|---|---|
| `players` | `IPlayerInfo[]` | Liste complète de tous les joueurs dans la room au moment de la jointure |
| `gameStatus` | `"waiting" \| "playing" \| "ended"` | Statut actuel de la room |
| `isHost` | `boolean` | Ce joueur spécifique est-il l'hôte ? (personnalisé par joueur) |

**Exemple de payload :**
```json
{
  "players": [
    { "name": "Alice", "isHost": true,  "isAlive": true },
    { "name": "Bob",   "isHost": false, "isAlive": true }
  ],
  "gameStatus": "waiting",
  "isHost": false
}
```

**Traitement Frontend (`socketMiddleware`) :**
- Dispatche `setRoomState(payload)` → hydrate `roomSlice` complet
- Si `gameStatus === 'playing'` → afficher une notice "Partie en cours" (pas de participation possible)
- Si `gameStatus === 'ended'` → afficher le lobby avec le résultat de la dernière partie

> ⚠️ **Attention** : le champ `isHost` dans le payload racine est le flag **pour ce joueur spécifique**. Il peut différer du flag `isHost` de l'élément correspondant dans la liste `players`. Toujours utiliser le champ racine pour déterminer si CE joueur est hôte.

---

### 4.2 `PLAYER_JOINED`

**Direction** : Serveur → Client
**Description** : Notifie les membres existants d'une room qu'un nouveau joueur vient d'arriver.

**Destinataires** : Tous les membres de la room **sauf** le joueur qui vient de rejoindre

**Payload :**

| Champ | Type | Description |
|---|---|---|
| `name` | `string` | Pseudo du nouveau joueur |
| `isHost` | `boolean` | Ce nouveau joueur est-il l'hôte ? (normalement `false` sauf si room vide) |
| `isAlive` | `boolean` | Toujours `true` à la jointure |

**Exemple de payload :**
```json
{
  "name": "Charlie",
  "isHost": false,
  "isAlive": true
}
```

**Traitement Frontend (`socketMiddleware`) :**
- Dispatche `playerJoined(player)` → ajoute à la liste des joueurs dans `roomSlice`
- Le composant `<Lobby />` se re-render automatiquement

---

### 4.3 `PLAYER_LEFT`

**Direction** : Serveur → Client
**Description** : Notifie tous les membres qu'un joueur a quitté la room (déconnexion volontaire ou réseau).

**Destinataires** : Tous les membres restants dans la room

**Payload :**

| Champ | Type | Description |
|---|---|---|
| `playerName` | `string` | Pseudo du joueur qui a quitté |

**Exemple de payload :**
```json
{
  "playerName": "Bob"
}
```

**Traitement Frontend (`socketMiddleware`) :**
- Dispatche `playerLeft({ playerName })` → retire de la liste + supprime son entrée dans `spectrums`
- Si la partie était en cours et que ce joueur était le dernier adversaire → le serveur aura déjà envoyé `GAME_OVER` avant `PLAYER_LEFT`

---

### 4.4 `HOST_CHANGED`

**Direction** : Serveur → Client
**Description** : Notifie que le rôle d'hôte a été transféré à un autre joueur (l'hôte précédent s'est déconnecté).

**Destinataires** : Tous les membres de la room

**Payload :**

| Champ | Type | Description |
|---|---|---|
| `newHost` | `string` | Pseudo du nouveau joueur hôte |

**Exemple de payload :**
```json
{
  "newHost": "Charlie"
}
```

**Traitement Frontend (`socketMiddleware`) :**
- Dispatche `hostChanged({ newHost })` dans `roomSlice`
- Le reducer met à jour `isHost` dans la liste `players`
- Recalcule le flag `isHost` local : `isHost = (playerName === newHost)`
- Les boutons "Démarrer" / "Rejouer" apparaissent ou disparaissent selon le nouveau statut

---

### 4.5 `GAME_STARTED`

**Direction** : Serveur → Client
**Description** : La partie commence. Tous les clients doivent immédiatement réinitialiser leur état et demander leurs premières pièces.

**Destinataires** : Tous les membres de la room

**Payload :**
- Aucun (objet vide `{}`)

**Traitement Frontend (`socketMiddleware`) — dans cet ordre :**
1. Dispatche `gameStarted()` → `roomSlice.gameStatus = 'playing'`, tous les joueurs remis `isAlive = true`, spectres réinitialisés
2. Dispatche `setGameStatus('playing')` → `gameSlice.status = 'playing'`
3. Dispatche `hideOverlay()` → cache l'overlay de la partie précédente si visible
4. Dispatche `resetGame()` → réinitialise le plateau à un état vide
5. Émet **2 × `REQUEST_PIECE`** vers le serveur — les deux `NEW_PIECE` en réponse alimenteront `activePiece` puis `nextPiece`

> ⚠️ **Le double `REQUEST_PIECE` est obligatoire**. Sans lui, `nextPiece` reste `null` et l'aperçu de la pièce suivante n't'affichera jamais pendant toute la partie.

---

### 4.6 `NEW_PIECE`

**Direction** : Serveur → Client
**Description** : Réponse à `REQUEST_PIECE`. Fournit la prochaine pièce de la séquence partagée pour ce joueur.

**Destinataires** : Le joueur ayant émis `REQUEST_PIECE` **uniquement**

**Payload :**

| Champ | Type | Description |
|---|---|---|
| `piece` | `IPiece` | La pièce à jouer : type + position de spawn |

**Exemple de payload :**
```json
{
  "piece": {
    "type": "T",
    "position": { "x": 3, "y": -1 }
  }
}
```

**Traitement Frontend (`socketMiddleware`) — logique de routage :**

| Condition | Action |
|---|---|
| `gameSlice.activePiece === null` | Dispatche `setActivePiece(piece)` → devient la pièce qui tombe |
| `gameSlice.activePiece !== null` | Dispatche `setNextPiece(piece)` → stocké pour l'aperçu |

**Pourquoi cette logique de routage ?**
- Au démarrage, deux `REQUEST_PIECE` sont émis consécutivement
- La première réponse arrive quand `activePiece === null` → devient la pièce active
- La deuxième réponse arrive quand `activePiece !== null` → devient `nextPiece`
- Pour les pièces suivantes (après chaque lock), `activePiece` est remis à `null` par `setActivePiece`, et le cycle recommence

**Invariant de séquence :**
> Alice et Bob reçoivent chacun la même `IPiece` pour le même index. Si Alice est à l'index 42 et Bob à l'index 42, ils reçoivent la même pièce. Leurs rythmes peuvent diverger.

---

### 4.7 `SPECTRUM_UPDATE`

**Direction** : Serveur → Client
**Description** : Le serveur relaie le spectre d'un adversaire à tous les autres membres de la room. Permet l'affichage des plateaux compressés des adversaires en temps réel.

**Destinataires** : Tous les membres de la room **sauf** le joueur dont le spectre a été mis à jour

**Payload :**

| Champ | Type | Description |
|---|---|---|
| `playerName` | `string` | Pseudo du joueur dont le spectre a changé |
| `spectrum` | `number[]` | Tableau de 10 valeurs (hauteur de chaque colonne, 0–20) |

**Exemple de payload :**
```json
{
  "playerName": "Bob",
  "spectrum": [0, 2, 4, 8, 10, 9, 6, 3, 1, 0]
}
```

**Traitement Frontend (`socketMiddleware`) :**
- Dispatche `updateSpectrum({ playerName, spectrum })` → met à jour `roomSlice.spectrums[playerName]`
- Le composant `<Spectrum />` se re-render automatiquement via `useAppSelector`

---

### 4.8 `PENALTY_LINES`

**Direction** : Serveur → Client
**Description** : Un adversaire a effacé suffisamment de lignes pour déclencher des pénalités. Ce client doit ajouter des lignes indestructibles à son plateau lors de sa prochaine pose de pièce.

**Destinataires** : Tous les joueurs **vivants sauf** le joueur qui a effacé les lignes

**Payload :**

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `count` | `number` (entier) | 1 ≤ count ≤ 3 | Nombre de lignes de pénalité à ajouter |

**Valeurs possibles de `count` :**

| `count` reçu | Cause côté adversaire |
|---|---|
| `1` | Adversaire a effacé 2 lignes |
| `2` | Adversaire a effacé 3 lignes |
| `3` | Adversaire a effacé 4 lignes (Tetris) |

**Exemple de payload :**
```json
{
  "count": 3
}
```

**Traitement Frontend (`socketMiddleware`) :**
- Dispatche `addPenaltyLines(count)` → incrémente `gameSlice.penaltyQueue`
- Les pénalités sont **accumulées** dans `penaltyQueue` et appliquées lors du prochain `lockPiece`
- Ce comportement est intentionnel : éviter les sauts visuels du plateau pendant qu'une pièce est en train de tomber

**Caractéristiques des lignes de pénalité (traitement côté client) :**
- Toutes les cellules à la valeur `8` (couleur grise)
- **Sauf une cellule aléatoire** laissée à `0` — le "trou" qui permet théoriquement d'survivre
- Ajoutées en **bas** du plateau — les lignes existantes remontent vers le haut

---

### 4.9 `PLAYER_ELIMINATED`

**Direction** : Serveur → Client
**Description** : Un joueur vient d'être éliminé (il a envoyé `GAME_OVER_PLAYER`). Tous les joueurs sont informés.

**Destinataires** : Tous les membres de la room

**Payload :**

| Champ | Type | Description |
|---|---|---|
| `playerName` | `string` | Pseudo du joueur éliminé |

**Exemple de payload :**
```json
{
  "playerName": "Alice"
}
```

**Traitement Frontend (`socketMiddleware`) :**
- Dispatche `playerEliminated({ playerName })` → `isAlive = false` dans `roomSlice.players`
- Si `playerName === playerName local` → le middleware dispatche également `setGameStatus('lost')` et `showOverlay({ message: 'Game Over', isWinner: false })`
- Le composant `<Spectrum />` affiche le joueur éliminé en style "rayé" avec indicateur visuel

> ⚠️ **Ce joueur peut recevoir `PLAYER_ELIMINATED` avec son propre nom**. Le frontend doit détecter ce cas et afficher son overlay de game over. Le middleware doit comparer `playerName` avec `rootState.room.playerName`.

---

### 4.10 `GAME_OVER`

**Direction** : Serveur → Client
**Description** : La partie est terminée. Indique le vainqueur (ou l'absence de vainqueur en mode solo). Toujours précédé de `PLAYER_ELIMINATED`.

**Destinataires** : Tous les membres de la room

**Payload :**

| Champ | Type | Description |
|---|---|---|
| `winner` | `string` | Pseudo du vainqueur, ou `""` (chaîne vide) si aucun vainqueur (solo, tous éliminés simultanément) |

**Exemple de payload (victoire) :**
```json
{
  "winner": "Bob"
}
```

**Exemple de payload (mode solo / tous éliminés) :**
```json
{
  "winner": ""
}
```

**Traitement Frontend (`socketMiddleware`) :**
- Dispatche `gameEnded({ winner })` → `roomSlice.gameStatus = 'ended'`, `roomSlice.winner` mis à jour
- Si `winner === playerName local` → dispatche `showOverlay({ message: 'You Win! 🏆', isWinner: true })`
- Si `winner !== playerName local` et `winner !== ""` → dispatche `showOverlay({ message: 'Bob a gagné !', isWinner: false })`
- Si `winner === ""` → dispatche `showOverlay({ message: 'Game Over', isWinner: false })`
- `useGameLoop` et `useKeyboard` s'arrêtent automatiquement car `gameStatus !== 'playing'`

---

## 5. Diagrammes de séquence par scénario

### 5.1 — Création de room et démarrage à 2 joueurs

```
[Alice]                     [Serveur]                    [Bob]
  │                              │                          │
  │─── (1) JOIN_ROOM ───────────>│                          │
  │    {room:"arena",            │  Crée Game("arena")      │
  │     playerName:"Alice"}      │  Ajoute Alice (isHost)   │
  │                              │                          │
  │<── (2) ROOM_STATE ───────────│                          │
  │    {players:[Alice],         │                          │
  │     gameStatus:"waiting",    │                          │
  │     isHost:true}             │                          │
  │                              │                          │
  │                              │<─── (3) JOIN_ROOM ───────│
  │                              │     {room:"arena",       │
  │                              │      playerName:"Bob"}   │
  │                              │  Ajoute Bob              │
  │                              │                          │
  │<── (4) PLAYER_JOINED ────────│                          │
  │    {name:"Bob",              │──── (5) ROOM_STATE ─────>│
  │     isHost:false,            │     {players:[Alice,Bob],│
  │     isAlive:true}            │      gameStatus:"waiting"│
  │                              │      isHost:false}       │
  │                              │                          │
  │─── (6) START_GAME ──────────>│                          │
  │    {room:"arena"}            │  Génère 2000 pièces      │
  │                              │  Reset tous les joueurs  │
  │                              │                          │
  │<── (7) GAME_STARTED ─────────│──── (7) GAME_STARTED ───>│
  │    {}                        │    {}                    │
  │                              │                          │
  │─── (8a) REQUEST_PIECE ──────>│                          │
  │─── (8b) REQUEST_PIECE ──────>│                          │
  │                              │<── (9a) REQUEST_PIECE ───│
  │                              │<── (9b) REQUEST_PIECE ───│
  │                              │                          │
  │<── (10a) NEW_PIECE ──────────│──── (10a) NEW_PIECE ────>│
  │     {piece:{type:"T",..}}    │     {piece:{type:"T",..}}│  ← Même pièce (index 0)
  │                              │                          │
  │<── (10b) NEW_PIECE ──────────│──── (10b) NEW_PIECE ────>│
  │     {piece:{type:"I",..}}    │     {piece:{type:"I",..}}│  ← Même pièce (index 1)
  │                              │                          │
```

### 5.2 — Boucle de jeu normale (un joueur efface 2 lignes)

```
[Alice]                     [Serveur]                    [Bob]
  │                              │                          │
  │  [jeu local : mouvements,    │                          │
  │   rotations, gravité...]     │                          │
  │                              │                          │
  │─── LINES_CLEARED(2) ────────>│                          │
  │    {room:"arena", count:2}   │  penaltyCount = 2-1 = 1  │
  │                              │──── PENALTY_LINES ──────>│
  │                              │     {count: 1}           │
  │                              │                          │
  │─── UPDATE_SPECTRUM ─────────>│                          │
  │    {room:"arena",            │──── SPECTRUM_UPDATE ────>│
  │     spectrum:[3,4,5,6,...]}  │     {playerName:"Alice", │
  │                              │      spectrum:[3,4,5...]}│
  │                              │                          │
  │─── REQUEST_PIECE ───────────>│                          │
  │    {room:"arena"}            │  pieces[2] → Alice       │
  │                              │  pieceIndex Alice: 2→3   │
  │<── NEW_PIECE ────────────────│                          │
  │    {piece:{type:"O",...}}    │                          │
```

### 5.3 — Élimination d'un joueur et fin de partie

```
[Alice]                     [Serveur]                    [Bob]
  │                              │                          │
  │  [spawn invalide détecté     │                          │
  │   → isValidPosition=false]   │                          │
  │                              │                          │
  │─── GAME_OVER_PLAYER ────────>│                          │
  │    {room:"arena"}            │  Alice.isAlive = false   │
  │                              │  checkWinCondition()     │
  │                              │  → 1 joueur vivant (Bob) │
  │                              │                          │
  │<── PLAYER_ELIMINATED ────────│──── PLAYER_ELIMINATED ──>│
  │    {playerName:"Alice"}      │     {playerName:"Alice"} │
  │                              │                          │
  │<── GAME_OVER ────────────────│──── GAME_OVER ──────────>│
  │    {winner:"Bob"}            │     {winner:"Bob"}       │
  │                              │                          │
  │  [Overlay "Game Over"]       │                          │  [Overlay "You Win! 🏆"]
```

### 5.4 — Déconnexion de l'hôte pendant le lobby

```
[Alice (hôte)]              [Serveur]                    [Bob]
  │                              │                          │
  │─── (disconnect) ────────────>│                          │
  │                              │  removePlayer(Alice)     │
  │                              │  Alice était hôte        │
  │                              │  → transferHost() → Bob  │
  │                              │                          │
  │                              │──── PLAYER_LEFT ────────>│
  │                              │     {playerName:"Alice"} │
  │                              │                          │
  │                              │──── HOST_CHANGED ───────>│
  │                              │     {newHost:"Bob"}      │
  │                              │                          │
  │                              │  [Bob voit apparaître    │
  │                              │   le bouton "Démarrer"]  │
```

### 5.5 — Joueur qui arrive sur une partie en cours

```
[Charlie]                   [Serveur]                [Alice+Bob]
  │                              │                          │
  │─── JOIN_ROOM ───────────────>│                          │
  │    {room:"arena",            │  game.status = 'playing' │
  │     playerName:"Charlie"}    │  addPlayer → return false│
  │                              │                          │
  │<── ROOM_STATE ───────────────│                          │
  │    {players:[Alice,Bob],     │  [Alice et Bob ne        │
  │     gameStatus:"playing",    │   reçoivent RIEN]        │
  │     isHost:false}            │                          │
  │                              │                          │
  │  [Affiche "Partie en cours,  │                          │
  │   attendez la prochaine"]    │                          │
```

---

## 6. Machine à états — cycle de vie d'une Room

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
         ┌──────────────────┐                             │
         │                  │                             │
         │    [INEXISTANTE] │                             │
         │                  │                             │
         └────────┬─────────┘                             │
                  │                                       │
                  │  Premier JOIN_ROOM reçu               │
                  ▼                                       │
         ┌──────────────────┐                             │
         │                  │◄── JOIN_ROOM (autres)       │
         │    [WAITING]     │◄── PLAYER_LEFT              │
         │                  │◄── HOST_CHANGED             │
         └────────┬─────────┘                             │
                  │                                       │
                  │  START_GAME (hôte)                    │
                  ▼                                       │
         ┌──────────────────┐                             │
         │                  │◄── REQUEST_PIECE            │
         │    [PLAYING]     │◄── UPDATE_SPECTRUM          │
         │                  │◄── LINES_CLEARED            │
         └────────┬─────────┘◄── GAME_OVER_PLAYER        │
                  │                                       │
                  │  Tous les joueurs éliminés sauf 1     │
                  │  (ou le seul joueur éliminé en solo)  │
                  ▼                                       │
         ┌──────────────────┐                             │
         │                  │──── RESTART_GAME (hôte) ───►│
         │    [ENDED]       │                             │
         │                  │                             │
         └────────┬─────────┘                             │
                  │                                       │
                  │  Dernier joueur se déconnecte         │
                  ▼                                       │
         ┌──────────────────┐
         │                  │
         │   [SUPPRIMÉE]    │
         │  (GameManager)   │
         └──────────────────┘
```

**Transitions d'état :**

| De | Vers | Déclencheur | Événement émis |
|---|---|---|---|
| INEXISTANTE | WAITING | `JOIN_ROOM` (premier joueur) | `ROOM_STATE` |
| WAITING | WAITING | `JOIN_ROOM` (autres joueurs) | `ROOM_STATE` + `PLAYER_JOINED` |
| WAITING | PLAYING | `START_GAME` (hôte) | `GAME_STARTED` |
| PLAYING | ENDED | Dernier joueur survivant détecté | `PLAYER_ELIMINATED` + `GAME_OVER` |
| ENDED | PLAYING | `RESTART_GAME` (hôte) | `GAME_STARTED` |
| Any | SUPPRIMÉE | Dernier `disconnect` | *(aucun — room détruite)* |

---

## 7. Machine à états — cycle de vie d'un Client

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
         ┌──────────────────┐                             │
         │                  │                             │
         │   [DÉCONNECTÉ]   │◄── disconnect               │
         │                  │                             │
         └────────┬─────────┘                             │
                  │                                       │
                  │  Connexion WebSocket établie          │
                  │  + JOIN_ROOM émis                     │
                  │  + ROOM_STATE reçu                    │
                  ▼                                       │
         ┌──────────────────┐                             │
         │                  │◄── PLAYER_JOINED            │
         │    [LOBBY]       │◄── PLAYER_LEFT              │
         │                  │◄── HOST_CHANGED             │
         └────────┬─────────┘                             │
                  │                                       │
                  │  GAME_STARTED reçu                    │
                  ▼                                       │
         ┌──────────────────┐                             │
         │                  │◄── NEW_PIECE                │
         │    [PLAYING]     │◄── SPECTRUM_UPDATE          │
         │                  │◄── PENALTY_LINES            │
         └───┬──────────┬───┘◄── PLAYER_ELIMINATED        │
             │          │                                 │
             │          │  PLAYER_ELIMINATED              │
             │          │  (nom = ce joueur)              │
             │          ▼                                 │
             │   ┌──────────────────┐                    │
             │   │                  │                     │
             │   │  [ÉLIMINÉ]      │                     │
             │   │                  │                     │
             │   └──────┬───────────┘                    │
             │          │                                 │
             │          │ GAME_OVER reçu                  │
             │          │                                 │
             ▼          ▼                                 │
         ┌──────────────────┐                             │
         │                  │──── RESTART_GAME ──────────►│
         │   [GAME OVER /   │    (hôte uniquement)        │
         │    VICTOIRE]     │                             │
         │                  │                             │
         └──────────────────┘
```

**États du client et leurs propriétés :**

| État | `gameSlice.status` | `roomSlice.gameStatus` | Hooks actifs |
|---|---|---|---|
| DÉCONNECTÉ | `'idle'` | — | Aucun |
| LOBBY | `'idle'` | `'waiting'` | Aucun |
| PLAYING | `'playing'` | `'playing'` | `useGameLoop` + `useKeyboard` |
| ÉLIMINÉ | `'lost'` | `'playing'` | Aucun (désactivés) |
| GAME OVER / VICTOIRE | `'lost'` ou `'won'` | `'ended'` | Aucun |

---

## 8. Règles de validation des payloads

### Côté Serveur — validation des événements entrants

| Événement | Règles de validation | Comportement si invalide |
|---|---|---|
| `JOIN_ROOM` | `room` et `playerName` non vides, strings, longueur 1–30 et 1–20, alphanumérique + `-_` | Ignoré silencieusement |
| `START_GAME` | `room` existante, émetteur = hôte vérifié via `socket.id` | Ignoré silencieusement |
| `REQUEST_PIECE` | `room` existante, joueur dans la room, `isAlive === true`, partie en cours | Ignoré silencieusement |
| `UPDATE_SPECTRUM` | `room` existante, `spectrum` est un Array, longueur exactement 10, toutes valeurs ∈ [0, 20] entiers | Ignoré silencieusement |
| `LINES_CLEARED` | `room` existante, `count` est un Number, `count` ∈ {1, 2, 3, 4} | Ignoré silencieusement |
| `GAME_OVER_PLAYER` | `room` existante, joueur dans la room | Ignoré silencieusement (idempotent si déjà éliminé) |
| `RESTART_GAME` | `room` existante, émetteur = hôte | Ignoré silencieusement |

### Côté Client — validation des événements entrants

Le client fait **confiance** au serveur — il ne valide pas les payloads entrants aussi strictement. Cependant, des **gardes défensives** sont recommandées :

| Événement | Garde recommandée |
|---|---|
| `NEW_PIECE` | Vérifier que `piece.type` est dans `PIECE_TYPES` avant de dispatcher |
| `PENALTY_LINES` | Vérifier que `count` est ≥ 1 avant de dispatcher `addPenaltyLines` |
| `SPECTRUM_UPDATE` | Vérifier que `spectrum.length === 10` avant de dispatcher |
| `ROOM_STATE` | Vérifier que `players` est un Array avant de dispatcher |

---

## 9. Gestion des erreurs et comportements limites

### Déconnexion et reconnexion

| Scénario | Comportement Serveur | Comportement Client |
|---|---|---|
| Client ferme le navigateur | `disconnect` reçu → `removePlayer` → transfert hôte si nécessaire → `PLAYER_LEFT` broadcasté | N/A |
| Coupure réseau temporaire | Socket.IO tente une reconnexion automatique (5 tentatives) | Afficher un indicateur "Reconnexion..." |
| Reconnexion réussie | Socket.IO émet un nouvel événement `connect` avec un **nouveau `socket.id`** | Réémettre `JOIN_ROOM` dans le handler `connect` — le joueur est traité comme un nouveau venu |
| Reconnexion échouée | Room nettoyée si vide après timeout | Afficher "Connexion perdue" et rediriger vers `/` |

> ⚠️ **Cas critique — reconnexion pendant une partie** : si un joueur se reconnecte pendant que la partie est en cours, il reçoit `ROOM_STATE` avec `gameStatus: 'playing'` mais ne peut pas rejoindre la partie. Il est traité comme spectateur jusqu'au prochain restart.

### Race conditions possibles

| Scénario | Risque | Solution |
|---|---|---|
| Alice et Bob envoient `REQUEST_PIECE` simultanément | Aucun — chaque joueur a son propre `pieceIndex` indépendant | Géré nativement |
| Deux joueurs envoient `GAME_OVER_PLAYER` simultanément | Double appel de `eliminatePlayer` et `checkWinCondition` | `eliminatePlayer` est idempotent — vérifie `isAlive` avant d'agir |
| L'hôte clique "Démarrer" et se déconnecte simultanément | `START_GAME` traité avant `disconnect` → partie démarrée sans hôte → `transferHost` | Géré nativement dans cet ordre |
| `PENALTY_LINES` reçu juste après `GAME_OVER` | Client reçoit une pénalité pour une partie terminée | Sans conséquence — le state est `ended`, `addPenaltyLines` est sans effet sur le rendu |

### Timeout et keep-alive

- **`pingInterval: 5000ms`** : le serveur envoie un ping toutes les 5 secondes
- **`pingTimeout: 10000ms`** : si aucun pong n'est reçu en 10 secondes, la socket est considérée morte → `disconnect` déclenché
- Ces valeurs sont configurées côté serveur dans `index.ts`

---

## 10. Matrice de compatibilité — Qui reçoit quoi ?

> `✅` = reçoit cet événement | `—` = ne reçoit pas

### Événements de room (lobby et transitions)

| Événement | Joueur qui vient de joindre | Joueurs déjà présents | Joueurs en cours de jeu |
|---|---|---|---|
| `ROOM_STATE` | ✅ (lui seul) | — | — |
| `PLAYER_JOINED` | — | ✅ | ✅ |
| `PLAYER_LEFT` | — | ✅ | ✅ |
| `HOST_CHANGED` | ✅ | ✅ | ✅ |
| `GAME_STARTED` | — | ✅ | ✅ |

### Événements de jeu (partie en cours)

| Événement | Joueur émetteur | Adversaires vivants | Adversaires éliminés |
|---|---|---|---|
| `NEW_PIECE` | ✅ (lui seul) | — | — |
| `SPECTRUM_UPDATE` | — | ✅ | ✅ |
| `PENALTY_LINES` | — | ✅ | — |
| `PLAYER_ELIMINATED` | ✅ | ✅ | ✅ |
| `GAME_OVER` | ✅ | ✅ | ✅ |

---

## 11. Checklist d'implémentation Backend / Frontend

### ✅ Backend — à implémenter et vérifier

**Connexion & Room**
- [ ] Handler `JOIN_ROOM` : crée la room si absente, ajoute le joueur, envoie `ROOM_STATE` au nouvel arrivant, envoie `PLAYER_JOINED` aux autres
- [ ] Le premier joueur reçoit `isHost: true` dans `ROOM_STATE`
- [ ] Handler `disconnect` : retire le joueur, transfère l'hôte si nécessaire, nettoie la room si vide
- [ ] `HOST_CHANGED` broadcasté quand l'hôte se déconnecte

**Démarrage & Pièces**
- [ ] Handler `START_GAME` : vérifie `isHost`, génère 2000 pièces, reset tous les `pieceIndex`, broadcaste `GAME_STARTED`
- [ ] Handler `REQUEST_PIECE` : retourne `pieces[player.pieceIndex]`, incrémente `pieceIndex`, envoie uniquement à ce joueur
- [ ] Deux joueurs au même `pieceIndex` reçoivent la même pièce (test unitaire obligatoire)

**Jeu en cours**
- [ ] Handler `UPDATE_SPECTRUM` : valide longueur=10 et bornes, broadcaste `SPECTRUM_UPDATE` aux autres
- [ ] Handler `LINES_CLEARED` : valide `count ∈ [1,4]`, calcule `penaltyCount = count-1`, envoie `PENALTY_LINES` aux joueurs vivants sauf source
- [ ] Handler `GAME_OVER_PLAYER` : marque `isAlive=false`, broadcaste `PLAYER_ELIMINATED`, appelle `checkWinCondition`
- [ ] `GAME_OVER` broadcasté avec le bon vainqueur (ou `""` en solo/draw)

**Restart**
- [ ] Handler `RESTART_GAME` : vérifie `isHost`, remet `status='waiting'`, démarre immédiatement, broadcaste `GAME_STARTED`
- [ ] Tous les `isAlive` remis à `true` et `pieceIndex` remis à `0` au restart

---

### ✅ Frontend — à implémenter et vérifier

**Connexion & Routing**
- [ ] `getSocket()` retourne toujours la même instance (singleton)
- [ ] `JOIN_ROOM` émis au montage de `[room]/[player]/page.tsx`
- [ ] `socket.disconnect()` + `resetSocket()` appelés au démontage
- [ ] Redirection vers `/` si URL incomplète

**socketMiddleware — événements entrants**
- [ ] `ROOM_STATE` → dispatche `setRoomState`
- [ ] `PLAYER_JOINED` → dispatche `playerJoined`
- [ ] `PLAYER_LEFT` → dispatche `playerLeft` + supprime le spectre
- [ ] `HOST_CHANGED` → dispatche `hostChanged`, recalcule `isHost` local
- [ ] `GAME_STARTED` → dispatche dans l'ordre, puis émet **2×** `REQUEST_PIECE`
- [ ] `NEW_PIECE` → route vers `setActivePiece` ou `setNextPiece` selon `activePiece === null`
- [ ] `SPECTRUM_UPDATE` → dispatche `updateSpectrum`
- [ ] `PENALTY_LINES` → dispatche `addPenaltyLines` (accumulation dans `penaltyQueue`)
- [ ] `PLAYER_ELIMINATED` → dispatche `playerEliminated` + overlay si c'est ce joueur
- [ ] `GAME_OVER` → dispatche `gameEnded` + overlay avec message correct

**socketMiddleware — actions interceptées**
- [ ] Après `lockPiece` : émet `UPDATE_SPECTRUM` avec le nouveau spectre calculé
- [ ] Après `lockPiece` si `linesJustCleared > 0` : émet `LINES_CLEARED`
- [ ] Après `lockPiece` : émet `REQUEST_PIECE`
- [ ] Après `setGameStatus('lost')` : émet `GAME_OVER_PLAYER`

**Logique de jeu (fonctions pures)**
- [ ] `isValidPosition` autorise `y < 0` (spawn)
- [ ] `lockPiece` applique `penaltyQueue` avant de fusionner la pièce
- [ ] `rotatePiece` implémente le wall kick (4 tentatives de décalage)
- [ ] `computeSpectrum` retourne exactement 10 valeurs entre 0 et 20
- [ ] Lignes de pénalité (`addPenaltyLines`) : toutes les cellules à `8` sauf un trou aléatoire

**Composants**
- [ ] `Board_Display` affiche ghost piece + pièce active par-dessus le plateau figé
- [ ] `Spectrum` filtre le joueur local (n'affiche pas son propre spectre)
- [ ] `Lobby` : bouton "Démarrer" visible uniquement si `isHost === true`
- [ ] `GameOverlay` : bouton "Rejouer" visible uniquement si `isHost === true`
- [ ] Aucun composant n'utilise `this`

**Contraintes CSS**
- [ ] Aucune balise `<table>` dans le rendu
- [ ] Plateau affiché avec `display: grid`
- [ ] `overflow: hidden` sur `body` (pas de scroll avec les flèches)
