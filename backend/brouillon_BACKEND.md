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
backend/
│
├── node_app/                        # Serveur Node.js
│   ├── src/
│   │   ├── index.ts               # Point d'entrée : HTTP + Socket.IO
│   │   ├── classes/               # Classes OOP (obligatoires selon le sujet)
│   │   │   ├── Player.ts          # Classe Player
│   │   │   ├── Piece.ts           # Classe Piece
│   │   │   └── Game.ts            # Classe Game
│   │   │
│   │   ├── managers/              # Gestion des rooms et joueurs en mémoire
│   │   │   └── GameManager.ts     # Gestionnaire global de toutes les parties
│   │   │
│   │   ├── socket/                # Gestion des événements socket
│   │   │   ├── handlers.ts        # Handlers des événements entrants
│   │   │   └── emitters.ts        # Fonctions d'émission d'événements
│   │   │
│   │   ├── utils/                 # Utilitaires serveur
│   │   │   └── pieceGenerator.ts  # Générateur de séquences de pièces
│   │   │
│   │   └── types/                 # Types TypeScript côté serveur
│   │       └── index.ts
│   │
│   ├── tsconfig.json
│   └── package.json
│
├── shared/                        # Types et constantes partagés client/serveur
│   ├── events.ts                  # Noms des événements socket (source de vérité unique)
│   ├── types.ts                   # Interfaces communes (IPlayer, IGame, IPiece...)
│   └── constants.ts               # Constantes du jeu (BOARD_WIDTH, BOARD_HEIGHT...)
│
├── tests/                         # Tests unitaires
│   └── server/
│       └── classes/               # Tests des classes serveur
│
├── .env                           # Variables d'environnement (gitignored !)
├── .gitignore
└── README.md
```

---
## 2. Architecture Serveur (Node.js + TypeScript)

### 2.1 Point d'entrée (index.ts)

- Crée un serveur **HTTP** avec `http.createServer()`
- Attache **Socket.IO** au serveur HTTP
- Sert les fichiers statiques (`index.html`, `bundle.js`) via `express` ou `http`
- Lance le serveur sur le port défini dans `.env`
- Initialise le `GameManager` (gestionnaire global des parties)

### 2.2 Classe Player

Représente un joueur connecté dans une room.

```typescript
class Player {
  id: string;           // socket.id du joueur
  name: string;         // Nom choisi
  roomName: string;     // Room dans laquelle il joue
  isHost: boolean;      // Est-il le premier joueur (hôte) ?
  isAlive: boolean;     // Est-il encore en jeu ?
  socket: Socket;       // Référence au socket pour émettre des événements
  pieceIndex: number;   // Index de la prochaine pièce à récupérer dans la séquence

  constructor(socket, name, room) { ... }

  // Envoie un événement uniquement à ce joueur
  emit(event: string, data: unknown): void { ... }
}
```

### 2.3 Classe Piece

Représente un tetrimino généré côté serveur.

```typescript
class Piece {
  type: PieceType;      // 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
  position: Position;   // Position de spawn (colonne centrale, ligne 0)

  constructor(type?: PieceType) {
    this.type = type ?? Piece.randomType();
    this.position = Piece.spawnPosition();
  }

  static randomType(): PieceType { ... }
  static spawnPosition(): Position { ... }
}
```

### 2.4 Classe Game

Représente une partie en cours dans une room.

```typescript
class Game {
  roomName: string;
  players: Map<string, Player>;    // Joueurs dans la room (clé = socket.id)
  status: 'waiting' | 'playing' | 'ended';
  pieces: Piece[];                 // Séquence de pièces partagée (générée à l'avance)
  host: Player | null;             // Joueur hôte actuel

  constructor(roomName: string) { ... }

  addPlayer(player: Player): void { ... }
  removePlayer(socketId: string): void { ... }

  // Démarre la partie : génère la séquence de pièces, notifie tous les joueurs
  start(): void { ... }

  // Appelé quand un joueur demande la prochaine pièce
  getNextPiece(player: Player): Piece { ... }

  // Appelé quand un joueur supprime des lignes → envoie des pénalités aux autres
  applyPenalty(sourcePlayer: Player, linesCleared: number): void { ... }

  // Met à jour le spectre d'un joueur et le broadcast aux autres
  updateSpectrum(player: Player, spectrum: number[]): void { ... }

  // Élimine un joueur, vérifie si la partie est terminée
  eliminatePlayer(player: Player): void { ... }

  // Vérifie s'il reste un seul joueur (condition de victoire)
  checkWinCondition(): void { ... }

  // Transfère le rôle d'hôte à un autre joueur
  transferHost(): void { ... }
}
```

### 2.5 GameManager

Gestionnaire singleton de toutes les parties en cours.

```typescript
class GameManager {
  private games: Map<string, Game>;   // Toutes les rooms actives

  // Retourne la game existante ou en crée une nouvelle
  getOrCreateGame(roomName: string): Game { ... }

  // Supprime une game terminée
  removeGame(roomName: string): void { ... }

  // Retourne une game par son nom
  getGame(roomName: string): Game | undefined { ... }
}
```

### 2.6 Générateur de pièces (pieceGenerator.ts)

- Génère une séquence de pièces **à l'avance** (ex. 1000 pièces) au démarrage de la partie
- Tous les joueurs de la même room **partagent la même séquence** (même seed)
- Les joueurs récupèrent les pièces dans l'ordre via leur `pieceIndex` personnel
- Garantit que chaque joueur reçoit les **mêmes pièces dans le même ordre**

```typescript
// Génère N pièces aléatoires pour une room
const generatePieceSequence = (count: number): Piece[] => ...
```

---

## 3 Protocole Réseau & Socket.IO

### 3.1 Événements Serveur → Client

| Événement | Données | Description |
|---|---|---|
| `ROOM_STATE` | `{ players, status, isHost }` | État complet de la room (à la connexion) |
| `PLAYER_JOINED` | `{ playerName }` | Un joueur rejoint la room |
| `PLAYER_LEFT` | `{ playerName }` | Un joueur quitte la room |
| `HOST_CHANGED` | `{ newHost }` | Nouveau host désigné |
| `GAME_STARTED` | `{}` | La partie démarre |
| `NEW_PIECE` | `{ piece: IPiece }` | Envoi de la prochaine pièce |
| `SPECTRUM_UPDATE` | `{ playerName, spectrum }` | Spectre mis à jour d'un adversaire |
| `PENALTY_LINES` | `{ count }` | Lignes de pénalité reçues |
| `PLAYER_ELIMINATED` | `{ playerName }` | Un joueur a perdu |
| `GAME_OVER` | `{ winner }` | Fin de partie, annonce du vainqueur |

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

### 4.1 Côté Serveur (OBLIGATOIRE)
- ✅ **Obligatoire** : approche **orientée objet** (classes/prototypes)
- ✅ **Obligatoire** : classes `Player`, `Piece`, `Game` au minimum
- ✅ **Obligatoire** : Node.js
- ✅ **Obligatoire** : Socket.IO

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
