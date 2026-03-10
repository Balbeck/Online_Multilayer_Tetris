## Vue d'ensemble du projet

### Objectif
Développer un **Tetris multijoueur en réseau**, full stack JavaScript/TypeScript, avec :
- Un client **Single Page Application** (SPA) tournant dans le navigateur (Next.js/React)
- Un serveur **Node.js** gérant la logique de jeu, les rooms, et la distribution des pièces
- Une communication **temps réel bidirectionnelle** via **Socket.IO**

### Principes architecturaux imposés
- **Client** : programmation **fonctionnelle** (pas de `this`, fonctions pures pour la logique de jeu)
- **Serveur** : programmation **orientée objet** avec prototypes/classes (`Player`, `Piece`, `Game`)
- **Pas de persistence** de données (tout en mémoire)
- **Pas de jQuery, Canvas, ni SVG**
- **Layouts CSS** uniquement avec `grid` ou `flexbox`

---

## 1. Structure des dossiers

```
frontend/
│
├── nextjs_app/                        # Application Next.js (frontend)
│   ├── src/
│   │   ├── app/                   # App Router Next.js (pages et layouts)
│   │   │   ├── layout.tsx         # Layout global (providers Redux, Socket)
│   │   │   ├── page.tsx           # Page d'accueil / lobby
│   │   │   └── [room]/
│   │   │       └── [player]/
│   │   │           └── page.tsx   # Page de jeu (ex: /myroom/Alice)
│   │   │
│   │   ├── components/            # Composants React (fonctionnels, pas de `this`)
│   │   │   ├── Board/             # Plateau de jeu principal
│   │   │   │   ├── Board_Display.tsx
│   │   │   │   └── Board.module.css
│   │   │   ├── Cell/              # Cellule individuelle du plateau
│   │   │   │   └── Cell.tsx
│   │   │   ├── Piece/             # Affichage de la pièce suivante
│   │   │   │   └── NextPiece.tsx
│   │   │   ├── Spectrum/          # Vue spectre des adversaires
│   │   │   │   └── Spectrum.tsx
│   │   │   ├── GameInfo/          # Informations de jeu (score, niveau)
│   │   │   │   └── GameInfo.tsx
│   │   │   ├── Lobby/             # Interface de salle d'attente
│   │   │   │   └── Lobby.tsx
│   │   │   └── Overlay/           # Écrans de fin / victoire
│   │   │       └── GameOverlay.tsx
│   │   │
│   │   ├── store/                 # Redux store
│   │   │   ├── index.ts           # Configuration du store
│   │   │   ├── slices/
│   │   │   │   ├── gameSlice.ts   # État du plateau, pièce courante
│   │   │   │   ├── roomSlice.ts   # État de la room, joueurs
│   │   │   │   └── uiSlice.ts     # État UI (écrans, messages)
│   │   │   └── middleware/
│   │   │       └── socketMiddleware.ts  # Middleware Redux pour socket.io
│   │   │
│   │   ├── game/                  # Logique de jeu PURE (fonctions pures uniquement)
│   │   │   ├── board.ts           # Création et manipulation du plateau
│   │   │   ├── pieces.ts          # Définition des tetriminos et rotations
│   │   │   ├── movement.ts        # Déplacements, collisions, rotations
│   │   │   ├── lines.ts           # Détection et suppression des lignes complètes
│   │   │   └── gravity.ts         # Logique de chute automatique
│   │   │
│   │   ├── hooks/                 # React Hooks personnalisés
│   │   │   ├── useSocket.ts       # Hook de connexion Socket.IO
│   │   │   ├── useGameLoop.ts     # Hook de la boucle de jeu (requestAnimationFrame)
│   │   │   └── useKeyboard.ts     # Hook de capture des entrées clavier
│   │   │
│   │   ├── socket/                # Configuration et événements socket client
│   │   │   ├── socket.ts          # Instance socket.io-client
│   │   │   └── events.ts          # Constantes des événements socket
│   │   │
│   │   └── types/                 # Types TypeScript partagés côté client
│   │       └── index.ts
│   │
│   ├── public/                    # Assets statiques
│   ├── next.config.ts             # Configuration Next.js
│   ├── tsconfig.json
│   └── package.json
│
├── tests/                         # Tests unitaires
│   ├── client/
│   │   └── game/                  # Tests des fonctions pures du client
│
├── .env                           # Variables d'environnement (gitignored !)
├── .gitignore
└── README.md
```

---

## 2. Architecture Client (Next.js + TypeScript)

### 2.1 Routing — Gestion de l'URL de jeu

Le sujet impose un accès via `http://<host>:<port>/<room>/<player_name>`.

- **Next.js App Router** permet de créer la route dynamique `app/[room]/[player]/page.tsx`
- Au chargement de cette page, les paramètres `room` et `player` sont extraits automatiquement
- Le composant déclenche immédiatement la connexion socket et l'événement `JOIN_ROOM`
- Si l'URL est incomplète (pas de room/player), redirection vers la page d'accueil `/`

```typescript
// app/[room]/[player]/page.tsx
// Extrait les paramètres d'URL et initialise la connexion
export default function GamePage({ params }: { params: { room: string; player: string } }) {
  // Connexion socket et join room au montage du composant
}
```

### 2.2 Composants React — Règles fonctionnelles

**RÈGLE IMPÉRATIVE** : Aucun composant ne doit utiliser le mot-clé `this`. Tous les composants sont des **fonctions** (React functional components + Hooks).

#### Board_Display.tsx — Plateau principal
- Affiche une grille de **10 colonnes × 20 lignes**
- Reçoit depuis Redux l'état du plateau (tableau 2D de cellules)
- Fusionne visuellement la pièce active avec le plateau figé
- Utilise CSS `grid` pour le layout de la grille
- Ne contient **aucune logique de jeu** (uniquement de l'affichage)

#### Cell.tsx — Cellule unitaire
- Composant minimal représentant une case de la grille
- Reçoit une couleur/type de bloc en prop
- Stylisée avec CSS modules (pas de `style` inline, pas de Canvas)

#### Spectrum.tsx — Vue adversaires
- Affiche pour chaque adversaire une colonne compressée représentant la hauteur de son tableau
- Mise à jour en temps réel via socket (événement `SPECTRUM_UPDATE`)
- Affiche le nom du joueur et son statut (vivant / éliminé)

#### NextPiece.tsx — Pièce suivante
- Affiche la prochaine pièce dans une mini-grille 4×4
- Permet au joueur d'anticiper

#### Lobby.tsx — Salle d'attente
- Affiché avant le démarrage de la partie
- Liste les joueurs connectés dans la room
- Affiche un bouton "Démarrer" uniquement pour le **host** (premier joueur connecté)
- Se met à jour en temps réel quand des joueurs rejoignent/quittent

#### GameOverlay.tsx — Écrans de fin
- Affiché par-dessus le plateau en cas de fin de partie
- Variantes : "Game Over" (joueur éliminé), "You Win!" (dernier survivant)
- Bouton "Rejouer" visible uniquement pour le host

### 2.3 Hooks personnalisés

#### useSocket.ts
- Initialise une connexion `socket.io-client` unique (singleton)
- Gère la connexion / déconnexion automatique selon le cycle de vie du composant
- Expose des méthodes `emit` wrappées pour typer les événements

#### useGameLoop.ts
- Implémente la boucle de jeu avec `requestAnimationFrame` ou `setInterval`
- Gère la **vitesse de chute** des pièces (intervalle de gravité)
- À chaque tick, déclenche la descente automatique de la pièce courante
- Ne démarre que quand la partie est en cours (`gameStatus === 'playing'`)

#### useKeyboard.ts
- Écoute les événements `keydown` sur `window`
- Mappe les touches aux actions de jeu :
  - `ArrowLeft` → `MOVE_LEFT`
  - `ArrowRight` → `MOVE_RIGHT`
  - `ArrowUp` → `ROTATE`
  - `ArrowDown` → `SOFT_DROP`
  - `Space` → `HARD_DROP`
- Empêche le comportement par défaut du navigateur (scroll sur flèches)
- Désactivé quand le joueur est éliminé ou en lobby

### 2.4 Logique de jeu — Fonctions Pures (client/game/)

**RÈGLE IMPÉRATIVE** : Toutes ces fonctions doivent être **pures** (pas d'effets de bord, pas de `this`, résultat déterministe pour les mêmes entrées). Elles sont facilement testables unitairement.

#### board.ts
```typescript
// Crée un plateau vide (tableau 2D de 0)
const createBoard = (): BoardType => ...

// Fusionne une pièce dans le plateau (retourne un nouveau tableau)
const mergePiece = (board: BoardType, piece: ActivePiece): BoardType => ...

// Vérifie si une position est valide (pas de collision, dans les limites)
const isValidPosition = (board: BoardType, piece: ActivePiece): boolean => ...

// Ajoute des lignes de pénalité indestructibles en bas
const addPenaltyLines = (board: BoardType, count: number): BoardType => ...
```

#### pieces.ts
```typescript
// Définition statique des 7 tetriminos (I, O, T, S, Z, J, L) et leurs couleurs
const TETRIMINOS: Record<PieceType, PieceShape[]> = { ... }

// Retourne la forme d'une pièce selon son type et sa rotation courante
const getPieceShape = (type: PieceType, rotation: number): PieceShape => ...
```

#### movement.ts
```typescript
// Déplace la pièce horizontalement (retourne nouvelle position ou position initiale si invalide)
const moveLeft = (board: BoardType, piece: ActivePiece): ActivePiece => ...
const moveRight = (board: BoardType, piece: ActivePiece): ActivePiece => ...

// Fait descendre la pièce d'une ligne
const moveDown = (board: BoardType, piece: ActivePiece): ActivePiece => ...

// Rotation de la pièce (avec wall kick basique)
const rotatePiece = (board: BoardType, piece: ActivePiece): ActivePiece => ...

// Hard drop : descend la pièce jusqu'en bas immédiatement
const hardDrop = (board: BoardType, piece: ActivePiece): ActivePiece => ...
```

#### lines.ts
```typescript
// Détecte les lignes complètes
const getCompletedLines = (board: BoardType): number[] => ...

// Supprime les lignes complètes et retourne le nouveau plateau + nombre de lignes supprimées
const clearLines = (board: BoardType): { board: BoardType; linesCleared: number } => ...
```

---

## 3 Protocole Réseau & Socket.IO

### 3.1 Événements Client → Serveur

| Événement | Données | Description |
|---|---|---|
| `JOIN_ROOM` | `{ room, playerName }` | Joueur rejoint une room |
| `START_GAME` | `{ room }` | L'hôte démarre la partie |
| `REQUEST_PIECE` | `{ room }` | Joueur demande la prochaine pièce |
| `UPDATE_SPECTRUM` | `{ room, spectrum: number[] }` | Mise à jour du spectre du joueur |
| `LINES_CLEARED` | `{ room, count }` | Le joueur a effacé `count` lignes |
| `GAME_OVER_PLAYER` | `{ room }` | Le joueur est éliminé (pile trop haute) |
| `RESTART_GAME` | `{ room }` | L'hôte relance une nouvelle partie |

---

### 3.2 Flux de jeu typique

```
[Client Alice]               [Serveur]                [Client Bob]
     │                           │                           │
     │── JOIN_ROOM ─────────────>│                           │
     │<── ROOM_STATE ────────────│                           │
     │                           │<─────────────── JOIN_ROOM ┤
     │<── PLAYER_JOINED ─────────│──── PLAYER_JOINED ───────>│
     │                           │<─── ROOM_STATE ───────────│
     │── START_GAME ────────────>│                           │
     │<── GAME_STARTED ──────────│──── GAME_STARTED ────────>│
     │── REQUEST_PIECE ─────────>│<─────────────── REQUEST_PIECE
     │<── NEW_PIECE(pièce #0) ───│──── NEW_PIECE(pièce #0) ─>│
     │                           │                           │
     │── UPDATE_SPECTRUM ───────>│──── SPECTRUM_UPDATE ─────>│
     │                           │                           │
     │── LINES_CLEARED(2) ──────>│──── PENALTY_LINES(1) ────>│
     │                           │                           │
     │── GAME_OVER_PLAYER ──────>│──── PLAYER_ELIMINATED ───>│
     │                           │──── GAME_OVER(winner=Bob)>│
```

---

## 4 Contraintes techniques imposées par le sujet

### 4.1 Côté Client (OBLIGATOIRE)
- ❌ **Interdit** : mot-clé `this` (sauf dans les sous-classes de `Error`)
- ❌ **Interdit** : jQuery ou toute bibliothèque de manipulation DOM
- ❌ **Interdit** : Canvas
- ❌ **Interdit** : SVG
- ❌ **Interdit** : balises `<TABLE />`
- ✅ **Obligatoire** : layout avec `grid` ou `flexbox` uniquement
- ✅ **Obligatoire** : logique de jeu (plateau, pièces) avec des **fonctions pures**
- ✅ **Obligatoire** : SPA (Single Page Application)
- ✅ **Recommandé** : React + Redux

### 4.2 Général
- ✅ **TypeScript autorisé** (superset de JS, compile vers JS standard)
- ✅ **Tests** : couverture ≥ 70% statements/functions/lines, ≥ 50% branches
- ❌ **Interdit** : stocker des credentials/API keys dans le dépôt (utiliser `.env` gitignored)
- ✅ **Obligatoire** : tous les joueurs d'une room reçoivent les **mêmes pièces dans le même ordre**

---

## 5 Logique de jeu — Règles & Algorithmes

### 5.1 Plateau de jeu
- Grille de **10 colonnes × 20 lignes**
- Représentation interne : tableau 2D de nombres (0 = vide, 1-7 = type de pièce)
- Les lignes de pénalité sont représentées par un type spécial (ex: 8) et **ne peuvent pas être effacées**

### 5.2 Pièces — Les 7 Tetriminos
| Pièce | Forme | Couleur |
|---|---|---|
| I | Barre de 4 | Cyan |
| O | Carré 2×2 | Jaune |
| T | T majuscule | Violet |
| S | S décalé | Vert |
| Z | Z décalé | Rouge |
| J | L inversé | Bleu |
| L | L normal | Orange |

Chaque pièce possède **4 états de rotation** définis statiquement.

### 5.3 Chute et gravité
- Les pièces descendent automatiquement à **intervalle régulier** (ex: 800ms)
- Quand une pièce touche le bas ou une autre pièce, elle attend **un frame** avant d'être figée (last-moment adjustment)
- Après avoir figé une pièce : vérifier les lignes, générer la pièce suivante

### 5.4 Détection de collision
Avant chaque mouvement, vérifier pour chaque bloc de la pièce :
- Le bloc ne sort pas de la grille (gauche, droite, bas)
- La cellule cible dans le plateau est vide (valeur 0)

### 5.5 Effacement de lignes et pénalités
- Après chaque pose de pièce, scanner toutes les lignes de haut en bas
- Une ligne est **complète** si toutes ses cellules sont non-nulles
- Effacer les lignes complètes et faire descendre les lignes supérieures
- Si `n` lignes effacées : envoyer `n - 1` lignes de pénalité aux adversaires
  - `1 ligne effacée` → 0 pénalité
  - `2 lignes effacées` → 1 ligne de pénalité
  - `3 lignes effacées` → 2 lignes de pénalité
  - `4 lignes effacées (Tetris)` → 3 lignes de pénalité

### 5.6 Condition de Game Over
- Un joueur est **éliminé** quand la nouvelle pièce ne peut pas être placée à sa position de spawn (plateau plein)
- La partie se termine quand il ne reste **qu'un seul joueur** (ou zéro en solo)
- En solo : la partie se termine quand le joueur est éliminé

### 5.7 Spectre (Spectrum)
- Le spectre d'un joueur est un tableau de **10 valeurs** (une par colonne)
- Chaque valeur = hauteur de la colonne la plus haute de cette colonne (0 si vide)
- Calculé côté client à chaque changement du plateau
- Envoyé au serveur via `UPDATE_SPECTRUM`
- Le serveur le broadcast aux autres joueurs de la room

---

## 6 Gestion de l'état (Redux)

### 6.1 gameSlice — État du plateau local

```typescript
interface GameState {
  board: BoardType;              // Plateau figé (sans la pièce active)
  activePiece: ActivePiece | null;  // Pièce en train de tomber
  nextPiece: IPiece | null;     // Prochaine pièce
  status: 'idle' | 'playing' | 'lost' | 'won';
  penaltyQueue: number;         // Lignes de pénalité en attente
}
```

Actions :
- `setPiece(piece)` — Définit la pièce active
- `setNextPiece(piece)` — Stocke la prochaine pièce
- `moveLeft / moveRight / rotate / softDrop / hardDrop` — Mouvements
- `lockPiece` — Fige la pièce sur le plateau
- `clearLines` — Supprime les lignes complètes
- `addPenaltyLines(count)` — Ajoute des lignes de pénalité
- `setGameStatus(status)` — Change le statut de la partie

### 6.2 roomSlice — État de la room

```typescript
interface RoomState {
  roomName: string;
  playerName: string;
  players: IPlayerInfo[];        // Liste des joueurs dans la room
  isHost: boolean;               // Ce joueur est-il l'hôte ?
  spectrums: Record<string, number[]>;  // Spectres des adversaires
  gameStatus: 'waiting' | 'playing' | 'ended';
  winner: string | null;
}
```

Actions :
- `setRoomState(state)` — Initialisation à la connexion
- `playerJoined(player)` / `playerLeft(player)`
- `updateSpectrum({ player, spectrum })`
- `playerEliminated(playerName)`
- `gameStarted / gameEnded(winner)`
- `hostChanged(newHost)`

### 6.3 socketMiddleware — Pont Redux ↔ Socket.IO

Un middleware Redux qui intercepte certaines actions Redux et les traduit en émissions socket, et inversement, abonne aux événements socket pour dispatcher des actions Redux.

```typescript
// Exemple de mapping :
// Action Redux MOVE_LEFT → emit socket ACTION au serveur (ou traitement local uniquement)
// Événement socket NEW_PIECE → dispatch setPiece(piece)
// Événement socket PENALTY_LINES → dispatch addPenaltyLines(count)
```

> **Note** : La logique de mouvement est traitée **entièrement côté client** (fonctions pures). Le serveur n'est pas notifié à chaque mouvement — seulement lors de la pose d'une pièce, des lignes effacées, et des mises à jour du spectre.

---
