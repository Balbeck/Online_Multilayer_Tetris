# 🖥️ Red Tetris — Guide de Développement Backend

> Stack : **Node.js + TypeScript + Socket.IO + Express**
> Contrainte fondamentale : **Programmation Orientée Objet côté serveur — classes `Player`, `Piece`, `Game` obligatoires**

---

## 📋 Table des matières

1. [Structure des dossiers](#1-structure-des-dossiers)
2. [Types TypeScript partagés](#2-types-typescript-partagés)
3. [Configuration du projet](#3-configuration-du-projet)
4. [Point d'entrée — `index.ts`](#4-point-dentrée--indexts)
5. [Classe `Piece`](#5-classe-piece)
6. [Classe `Player`](#6-classe-player)
7. [Classe `Game`](#7-classe-game)
8. [Classe `GameManager`](#8-classe-gamemanager)
9. [Utilitaire — `pieceGenerator.ts`](#9-utilitaire--piecegeneratorts)
10. [Socket.IO — Handlers et Emitters](#10-socketio--handlers-et-emitters)
11. [Protocole Réseau complet](#11-protocole-réseau-complet)
12. [Tests Unitaires Backend](#12-tests-unitaires-backend)
13. [Contraintes et Pièges à éviter](#13-contraintes-et-pièges-à-éviter)

---

## 1. Structure des dossiers

```
backend/
│
├── node_app/
│   ├── src/
│   │   ├── index.ts                    # Point d'entrée : Express + HTTP + Socket.IO
│   │   │
│   │   ├── classes/                    # ⚠️  OOP OBLIGATOIRE — utiliser this, classes, prototypes
│   │   │   ├── Player.ts               # Représente un joueur connecté dans une room
│   │   │   ├── Piece.ts                # Représente un tetrimino (type + position de spawn)
│   │   │   └── Game.ts                 # Représente une partie en cours dans une room
│   │   │
│   │   ├── managers/
│   │   │   └── GameManager.ts          # Singleton : gère toutes les rooms actives en mémoire
│   │   │
│   │   ├── socket/
│   │   │   ├── handlers.ts             # Enregistrement des listeners socket (events entrants)
│   │   │   └── emitters.ts             # Fonctions d'émission typées (events sortants)
│   │   │
│   │   ├── utils/
│   │   │   └── pieceGenerator.ts       # Génère la séquence de pièces partagée pour une room
│   │   │
│   │   └── types/
│   │       └── index.ts                # Interfaces TypeScript côté serveur
│   │
│   ├── tsconfig.json
│   └── package.json
│
├── shared/                             # Partagé entre client et serveur (symlink ou copie)
│   ├── events.ts                       # Noms d'événements socket (source de vérité unique)
│   ├── types.ts                        # Interfaces communes (IPiece, IPlayerInfo...)
│   └── constants.ts                    # Constantes du jeu (BOARD_WIDTH, BOARD_HEIGHT...)
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

---

## 2. Types TypeScript partagés

### 2.1 `shared/constants.ts` — Constantes du jeu

Ce fichier est la **source de vérité unique** pour toutes les constantes numériques.
Il est importé aussi bien par le serveur que par le client pour éviter toute désynchronisation.

```typescript
// shared/constants.ts

export const BOARD_WIDTH  = 10;   // Nombre de colonnes du plateau
export const BOARD_HEIGHT = 20;   // Nombre de lignes du plateau

// Nombre de pièces pré-générées par partie (largement suffisant pour une session)
export const PIECE_SEQUENCE_LENGTH = 2000;

// Valeur numérique représentant une ligne de pénalité indestructible
export const PENALTY_CELL_VALUE = 8;

// Types de tetriminos disponibles
export const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;

// Statuts possibles d'une partie
export const GAME_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  ENDED:   'ended',
} as const;
```

### 2.2 `shared/events.ts` — Noms des événements Socket.IO

Ce fichier évite les fautes de frappe en centralisant tous les noms d'événements.
**Toute modification ici se répercute immédiatement côté client ET serveur.**

```typescript
// shared/events.ts

export const SOCKET_EVENTS = {
  // ──────────────────────────────────────
  // Événements Client → Serveur
  // ──────────────────────────────────────
  JOIN_ROOM:          'JOIN_ROOM',       // Rejoindre ou créer une room
  START_GAME:         'START_GAME',      // L'hôte démarre la partie
  REQUEST_PIECE:      'REQUEST_PIECE',   // Demander la prochaine pièce de la séquence
  UPDATE_SPECTRUM:    'UPDATE_SPECTRUM', // Envoyer l'état compressé de son plateau
  LINES_CLEARED:      'LINES_CLEARED',   // Notifier qu'on a effacé N lignes
  GAME_OVER_PLAYER:   'GAME_OVER_PLAYER',// Ce joueur est éliminé (pile trop haute)
  RESTART_GAME:       'RESTART_GAME',    // L'hôte relance une nouvelle partie

  // ──────────────────────────────────────
  // Événements Serveur → Client
  // ──────────────────────────────────────
  ROOM_STATE:         'ROOM_STATE',      // État complet de la room (envoyé à la connexion)
  PLAYER_JOINED:      'PLAYER_JOINED',   // Un nouveau joueur a rejoint la room
  PLAYER_LEFT:        'PLAYER_LEFT',     // Un joueur a quitté la room
  HOST_CHANGED:       'HOST_CHANGED',    // Le rôle d'hôte a changé
  GAME_STARTED:       'GAME_STARTED',    // La partie vient de démarrer
  NEW_PIECE:          'NEW_PIECE',       // Réponse à REQUEST_PIECE : voici ta prochaine pièce
  SPECTRUM_UPDATE:    'SPECTRUM_UPDATE', // Spectre mis à jour d'un adversaire
  PENALTY_LINES:      'PENALTY_LINES',   // Recevoir des lignes de pénalité
  PLAYER_ELIMINATED:  'PLAYER_ELIMINATED',// Un joueur a été éliminé
  GAME_OVER:          'GAME_OVER',       // La partie est terminée (avec le vainqueur)
} as const;

// Type union de tous les noms d'événements (utile pour le typage des fonctions)
export type SocketEvent = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];
```

### 2.3 `shared/types.ts` — Interfaces communes

```typescript
// shared/types.ts

// Les 7 types de tetriminos
export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

// Position d'une pièce sur le plateau (en nombre de cellules)
export interface Position {
  x: number;  // colonne, 0 = bord gauche
  y: number;  // ligne,   0 = haut du plateau
}

// Représentation minimale d'une pièce telle qu'envoyée au client
export interface IPiece {
  type: PieceType;
  position: Position;
}

// Info d'un joueur telle qu'envoyée au client
export interface IPlayerInfo {
  name:    string;
  isHost:  boolean;
  isAlive: boolean;
}

// Payload de l'événement ROOM_STATE
export interface RoomStatePayload {
  players:    IPlayerInfo[];
  gameStatus: 'waiting' | 'playing' | 'ended';
  isHost:     boolean;
}

// Payload de l'événement SPECTRUM_UPDATE
export interface SpectrumUpdatePayload {
  playerName: string;
  spectrum:   number[];  // Tableau de 10 valeurs (hauteur de chaque colonne)
}

// Payload de l'événement PENALTY_LINES
export interface PenaltyLinesPayload {
  count: number;
}

// Payload de l'événement GAME_OVER
export interface GameOverPayload {
  winner: string;
}
```

### 2.4 `node_app/src/types/index.ts` — Types internes au serveur

```typescript
// node_app/src/types/index.ts
// Types utilisés uniquement côté serveur (non partagés avec le client)

import { Socket } from 'socket.io';
import { PieceType } from '../../../shared/types';

// Payload reçu lors de l'événement JOIN_ROOM
export interface JoinRoomPayload {
  room:       string;
  playerName: string;
}

// Payload reçu lors de l'événement START_GAME
export interface StartGamePayload {
  room: string;
}

// Payload reçu lors de l'événement REQUEST_PIECE
export interface RequestPiecePayload {
  room: string;
}

// Payload reçu lors de l'événement UPDATE_SPECTRUM
export interface UpdateSpectrumPayload {
  room:     string;
  spectrum: number[];
}

// Payload reçu lors de l'événement LINES_CLEARED
export interface LinesClearedPayload {
  room:  string;
  count: number;
}

// Payload reçu lors de l'événement GAME_OVER_PLAYER
export interface GameOverPlayerPayload {
  room: string;
}

// Payload reçu lors de l'événement RESTART_GAME
export interface RestartGamePayload {
  room: string;
}

// Type de la socket serveur Socket.IO (pour éviter d'importer Socket partout)
export type ServerSocket = Socket;
```

---

## 3. Configuration du projet

### 3.1 Installation des dépendances

```bash
# Dans node_app/
npm install express
npm install socket.io
npm install cors
npm install dotenv

npm install --save-dev typescript ts-node nodemon
npm install --save-dev @types/express @types/node @types/cors
npm install --save-dev jest @types/jest ts-jest
```

### 3.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "paths": {
      "@shared/*": ["../../shared/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 3.3 `package.json` — Scripts importants

```json
{
  "name": "red-tetris-backend",
  "version": "1.0.0",
  "scripts": {
    "dev":    "nodemon --exec ts-node src/index.ts",
    "build":  "tsc",
    "start":  "node dist/index.js",
    "test":   "jest --coverage",
    "test:watch": "jest --watch"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "roots": ["<rootDir>/../tests/server"],
    "moduleNameMapper": {
      "^@shared/(.*)$": "<rootDir>/../../shared/$1"
    },
    "collectCoverageFrom": [
      "src/**/*.ts",
      "!src/index.ts",
      "!src/types/**"
    ],
    "coverageThreshold": {
      "global": {
        "statements": 70,
        "functions":  70,
        "lines":      70,
        "branches":   50
      }
    }
  }
}
```

### 3.4 `.env`

```bash
# Port d'écoute du serveur HTTP
PORT=3001

# Origine autorisée pour le CORS (URL du frontend Next.js)
CLIENT_ORIGIN=http://localhost:3000

# ⚠️  Ce fichier est dans .gitignore — ne jamais le commiter
```

### 3.5 `.gitignore`

```
node_modules/
dist/
.env
*.log
coverage/
```

---

## 4. Point d'entrée — `index.ts`

Ce fichier est la **racine du serveur**. Il orchestre :
- La création du serveur HTTP avec Express
- L'attachement de Socket.IO sur ce serveur HTTP
- La configuration CORS pour autoriser le client Next.js
- L'enregistrement des handlers Socket.IO
- Le démarrage de l'écoute sur le port configuré

```typescript
// node_app/src/index.ts
import 'dotenv/config';
import express      from 'express';
import http         from 'http';
import cors         from 'cors';
import { Server }   from 'socket.io';
import { GameManager } from './managers/GameManager';
import { registerSocketHandlers } from './socket/handlers';

// ──────────────────────────────────────────────────────
// 1. Création de l'application Express
// ──────────────────────────────────────────────────────
const app = express();

// Middlewares Express de base
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// Route de santé : utile pour vérifier que le serveur est up
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ──────────────────────────────────────────────────────
// 2. Création du serveur HTTP (Node.js natif)
// ──────────────────────────────────────────────────────
// Socket.IO doit être attaché à un serveur HTTP, pas directement à Express.
// C'est pourquoi on crée explicitement le serveur HTTP.
const httpServer = http.createServer(app);

// ──────────────────────────────────────────────────────
// 3. Initialisation de Socket.IO
// ──────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
  // Timeout de ping : détecter les clients déconnectés rapidement
  pingTimeout:  10000,
  pingInterval: 5000,
});

// ──────────────────────────────────────────────────────
// 4. Initialisation du GameManager (singleton global)
// ──────────────────────────────────────────────────────
// Une seule instance gère toutes les rooms en mémoire.
const gameManager = GameManager.getInstance();

// ──────────────────────────────────────────────────────
// 5. Enregistrement des handlers Socket.IO
// ──────────────────────────────────────────────────────
// À chaque nouvelle connexion socket, on enregistre les listeners
// pour tous les événements du protocole.
io.on('connection', (socket) => {
  console.log(`[Socket] Nouveau client connecté : ${socket.id}`);

  // Passer io, socket et gameManager aux handlers
  registerSocketHandlers(io, socket, gameManager);

  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Client déconnecté : ${socket.id} — raison : ${reason}`);
  });
});

// ──────────────────────────────────────────────────────
// 6. Démarrage du serveur HTTP
// ──────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);

httpServer.listen(PORT, () => {
  console.log(`✅ Serveur Red Tetris démarré sur le port ${PORT}`);
  console.log(`   Health check : http://localhost:${PORT}/health`);
});

// ──────────────────────────────────────────────────────
// 7. Export pour les tests d'intégration
// ──────────────────────────────────────────────────────
export { httpServer, io };
```

---

## 5. Classe `Piece`

La classe `Piece` représente un **tetrimino individuel** dans la séquence de pièces d'une partie.
Elle est instanciée uniquement côté serveur et sa représentation minimale (`IPiece`) est envoyée aux clients.

**Rôle** :
- Stocker le type du tetrimino (`I`, `O`, `T`...)
- Stocker la position de spawn (point d'apparition sur le plateau)
- Fournir des méthodes statiques pour générer des pièces aléatoires

```typescript
// node_app/src/classes/Piece.ts
import { PieceType, IPiece, Position } from '../../../shared/types';
import { PIECE_TYPES, BOARD_WIDTH } from '../../../shared/constants';

export class Piece {
  // ──────────────────────────────────────────────
  // Propriétés de l'instance
  // ──────────────────────────────────────────────
  public readonly type: PieceType;
  public readonly position: Position;

  // ──────────────────────────────────────────────
  // Constructeur
  // ──────────────────────────────────────────────
  // Le type est optionnel : si non fourni, un type aléatoire est choisi.
  // Utile pour les tests (on peut forcer un type précis).
  constructor(type?: PieceType) {
    this.type     = type ?? Piece.randomType();
    this.position = Piece.spawnPosition();
  }

  // ──────────────────────────────────────────────
  // Méthode statique : choisit un type aléatoire
  // ──────────────────────────────────────────────
  // Utilise Math.random() pour une distribution uniforme sur les 7 types.
  public static randomType(): PieceType {
    const index = Math.floor(Math.random() * PIECE_TYPES.length);
    return PIECE_TYPES[index];
  }

  // ──────────────────────────────────────────────
  // Méthode statique : position de spawn (centre haut)
  // ──────────────────────────────────────────────
  // Les pièces apparaissent au centre en haut du plateau.
  // x = 3 centre une pièce de largeur 4 sur un plateau de 10 colonnes.
  // y = -1 place la pièce légèrement au-dessus du plateau visible,
  //        ce qui permet de détecter le game over avant qu'elle soit visible.
  public static spawnPosition(): Position {
    return {
      x: Math.floor(BOARD_WIDTH / 2) - 2, // = 3 pour un plateau de 10
      y: -1,
    };
  }

  // ──────────────────────────────────────────────
  // Sérialisation : convertit en IPiece pour l'envoi au client
  // ──────────────────────────────────────────────
  // Le client n'a besoin que du type et de la position.
  // La forme et les rotations sont calculées côté client à partir du type.
  public toIPiece(): IPiece {
    return {
      type:     this.type,
      position: { ...this.position },
    };
  }
}
```

---

## 6. Classe `Player`

La classe `Player` représente **un joueur humain connecté** à une room.
Elle associe une socket réseau à des données de jeu (nom, statut, index de pièce).

**Rôle** :
- Stocker les informations du joueur (nom, room, statut)
- Encapsuler la socket pour émettre des événements directement à ce joueur
- Maintenir `pieceIndex` pour que chaque joueur reçoive les pièces dans l'ordre

```typescript
// node_app/src/classes/Player.ts
import { Socket } from 'socket.io';
import { IPlayerInfo } from '../../../shared/types';

export class Player {
  // ──────────────────────────────────────────────
  // Propriétés de l'instance
  // ──────────────────────────────────────────────
  public readonly id:       string;    // socket.id — identifiant unique de connexion
  public readonly name:     string;    // Pseudo choisi par le joueur
  public readonly roomName: string;    // Nom de la room à laquelle il appartient
  public isHost:            boolean;   // Premier joueur connecté dans la room
  public isAlive:           boolean;   // False quand le joueur est éliminé
  public pieceIndex:        number;    // Index dans la séquence partagée de pièces
  private readonly socket:  Socket;    // Référence à la socket pour émettre

  // ──────────────────────────────────────────────
  // Constructeur
  // ──────────────────────────────────────────────
  constructor(socket: Socket, name: string, roomName: string) {
    this.id         = socket.id;
    this.name       = name;
    this.roomName   = roomName;
    this.socket     = socket;
    this.isHost     = false;   // Sera défini à true par Game.addPlayer() si premier joueur
    this.isAlive    = true;
    this.pieceIndex = 0;       // Commence à la première pièce de la séquence
  }

  // ──────────────────────────────────────────────
  // emit : envoie un événement Socket.IO à CE joueur uniquement
  // ──────────────────────────────────────────────
  // Encapsule socket.emit pour ne pas exposer la socket directement.
  // Typage générique pour garantir la cohérence event/données.
  public emit<T>(event: string, data?: T): void {
    this.socket.emit(event, data);
  }

  // ──────────────────────────────────────────────
  // joinRoom : abonne ce joueur aux événements d'une room Socket.IO
  // ──────────────────────────────────────────────
  // Les rooms Socket.IO permettent de broadcaster à un groupe de sockets.
  // Quand on fait io.to(roomName).emit(...), seuls les membres de la room reçoivent.
  public joinSocketRoom(): void {
    this.socket.join(this.roomName);
  }

  // ──────────────────────────────────────────────
  // leaveSocketRoom : quitte la room Socket.IO
  // ──────────────────────────────────────────────
  public leaveSocketRoom(): void {
    this.socket.leave(this.roomName);
  }

  // ──────────────────────────────────────────────
  // toIPlayerInfo : sérialise pour l'envoi au client
  // ──────────────────────────────────────────────
  // Le client n'a pas besoin du socket ni du pieceIndex.
  public toIPlayerInfo(): IPlayerInfo {
    return {
      name:    this.name,
      isHost:  this.isHost,
      isAlive: this.isAlive,
    };
  }

  // ──────────────────────────────────────────────
  // reset : réinitialise le joueur pour une nouvelle partie
  // ──────────────────────────────────────────────
  public reset(): void {
    this.isAlive    = true;
    this.pieceIndex = 0;
  }
}
```

---

## 7. Classe `Game`

La classe `Game` est le **cœur du serveur**. Elle gère l'intégralité d'une partie dans une room :
les joueurs, la séquence de pièces partagée, la distribution des pénalités, et la détection de fin de partie.

```typescript
// node_app/src/classes/Game.ts
import { Server } from 'socket.io';
import { Player }        from './Player';
import { Piece }         from './Piece';
import { generatePieceSequence } from '../utils/pieceGenerator';
import { SOCKET_EVENTS } from '../../../shared/events';
import { GAME_STATUS, PIECE_SEQUENCE_LENGTH } from '../../../shared/constants';
import {
  IPlayerInfo,
  RoomStatePayload,
  SpectrumUpdatePayload,
  PenaltyLinesPayload,
  GameOverPayload,
} from '../../../shared/types';

export class Game {
  // ──────────────────────────────────────────────
  // Propriétés de l'instance
  // ──────────────────────────────────────────────
  public readonly roomName: string;
  public status: 'waiting' | 'playing' | 'ended';

  // Map des joueurs : clé = socket.id, valeur = instance Player
  // Map est préféré à un tableau pour les lookups O(1) par socket.id
  private players: Map<string, Player>;

  // Séquence de pièces partagée par tous les joueurs de cette room.
  // Générée une seule fois au démarrage de la partie.
  private pieces: Piece[];

  // Référence à l'instance Socket.IO pour broadcaster aux rooms
  private io: Server;

  // ──────────────────────────────────────────────
  // Constructeur
  // ──────────────────────────────────────────────
  constructor(roomName: string, io: Server) {
    this.roomName = roomName;
    this.status   = GAME_STATUS.WAITING;
    this.players  = new Map();
    this.pieces   = [];
    this.io       = io;
  }

  // ══════════════════════════════════════════════════════════
  // GESTION DES JOUEURS
  // ══════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────
  // addPlayer : ajoute un joueur à la room
  // ──────────────────────────────────────────────
  // Règles :
  //   - Si la partie est déjà lancée (status = 'playing'), refuser l'entrée
  //   - Le premier joueur qui rejoint devient automatiquement l'hôte
  //   - Abonner le joueur à la room Socket.IO pour les broadcasts
  public addPlayer(player: Player): boolean {
    // Refuser les nouveaux joueurs si la partie est en cours
    if (this.status === GAME_STATUS.PLAYING) {
      player.emit(SOCKET_EVENTS.ROOM_STATE, {
        players:    this.getPlayersInfo(),
        gameStatus: this.status,
        isHost:     false,
      } as RoomStatePayload);
      return false;
    }

    // Premier joueur = hôte
    if (this.players.size === 0) {
      player.isHost = true;
    }

    // Enregistrer le joueur
    this.players.set(player.id, player);

    // Abonner le socket du joueur à la room Socket.IO
    // → permet d'utiliser io.to(roomName).emit(...)
    player.joinSocketRoom();

    // Envoyer l'état actuel de la room AU NOUVEAU JOUEUR UNIQUEMENT
    player.emit<RoomStatePayload>(SOCKET_EVENTS.ROOM_STATE, {
      players:    this.getPlayersInfo(),
      gameStatus: this.status,
      isHost:     player.isHost,
    });

    // Notifier TOUS LES AUTRES joueurs de la room de l'arrivée du nouveau
    // (on exclut le nouveau joueur avec socket.to() pour ne pas qu'il reçoive deux fois)
    this.broadcastToOthers(player.id, SOCKET_EVENTS.PLAYER_JOINED, {
      playerName: player.name,
      isHost:     player.isHost,
      isAlive:    player.isAlive,
    } as IPlayerInfo);

    console.log(`[Game:${this.roomName}] ${player.name} a rejoint (${this.players.size} joueur(s))`);
    return true;
  }

  // ──────────────────────────────────────────────
  // removePlayer : retire un joueur de la room
  // ──────────────────────────────────────────────
  // Règles :
  //   - Si le joueur qui part est l'hôte, transférer le rôle
  //   - Si la partie est en cours et qu'il ne reste qu'un joueur → victoire
  //   - Si la room est vide → sera nettoyée par le GameManager
  public removePlayer(socketId: string): void {
    const player = this.players.get(socketId);
    if (!player) return;

    this.players.delete(socketId);
    player.leaveSocketRoom();

    console.log(`[Game:${this.roomName}] ${player.name} a quitté (${this.players.size} joueur(s) restant(s))`);

    // Notifier les autres joueurs
    this.broadcast(SOCKET_EVENTS.PLAYER_LEFT, { playerName: player.name });

    // Si la room est vide, pas besoin de faire autre chose
    // (le GameManager la supprimera)
    if (this.players.size === 0) return;

    // Si le joueur qui part était l'hôte, transférer le rôle
    if (player.isHost) {
      this.transferHost();
    }

    // Si la partie était en cours, vérifier la condition de victoire
    if (this.status === GAME_STATUS.PLAYING) {
      this.checkWinCondition();
    }
  }

  // ──────────────────────────────────────────────
  // getPlayer : récupère un joueur par son socket.id
  // ──────────────────────────────────────────────
  public getPlayer(socketId: string): Player | undefined {
    return this.players.get(socketId);
  }

  // ──────────────────────────────────────────────
  // getPlayersInfo : sérialise tous les joueurs pour les clients
  // ──────────────────────────────────────────────
  public getPlayersInfo(): IPlayerInfo[] {
    return Array.from(this.players.values()).map(p => p.toIPlayerInfo());
  }

  // ──────────────────────────────────────────────
  // isEmpty : vérifie si la room est vide
  // ──────────────────────────────────────────────
  public isEmpty(): boolean {
    return this.players.size === 0;
  }

  // ══════════════════════════════════════════════════════════
  // GESTION DE LA PARTIE
  // ══════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────
  // start : démarre la partie
  // ──────────────────────────────────────────────
  // Uniquement accessible par l'hôte (vérification dans le handler).
  // Actions :
  //   1. Changer le statut de la room
  //   2. Générer la séquence de pièces partagée
  //   3. Réinitialiser tous les joueurs (isAlive, pieceIndex)
  //   4. Broadcaster GAME_STARTED à tous les joueurs
  public start(): void {
    if (this.status !== GAME_STATUS.WAITING) {
      console.warn(`[Game:${this.roomName}] Tentative de démarrage d'une partie déjà en cours`);
      return;
    }

    this.status = GAME_STATUS.PLAYING;

    // Générer la séquence partagée AVANT de notifier les clients
    // → garantit que tous ont la même séquence dès le départ
    this.pieces = generatePieceSequence(PIECE_SEQUENCE_LENGTH);

    // Réinitialiser les joueurs pour une nouvelle partie
    this.players.forEach(player => player.reset());

    // Notifier tous les joueurs : la partie commence !
    this.broadcast(SOCKET_EVENTS.GAME_STARTED, {});

    console.log(`[Game:${this.roomName}] Partie démarrée avec ${this.players.size} joueur(s) et ${this.pieces.length} pièces générées`);
  }

  // ──────────────────────────────────────────────
  // restart : relance une nouvelle partie
  // ──────────────────────────────────────────────
  // Remet la room à l'état WAITING puis démarre directement.
  public restart(): void {
    this.status = GAME_STATUS.WAITING;
    this.start();
  }

  // ──────────────────────────────────────────────
  // getNextPiece : donne la prochaine pièce à un joueur
  // ──────────────────────────────────────────────
  // Chaque joueur maintient son propre pieceIndex dans la séquence partagée.
  // Ainsi, tous les joueurs reçoivent les mêmes pièces dans le même ordre,
  // mais chacun à son propre rythme (selon sa vitesse de jeu).
  //
  // Exemple :
  //   Séquence : [I, T, O, L, S, ...]
  //   Alice (rapide) : pieceIndex=3 → reçoit L
  //   Bob   (lent)   : pieceIndex=1 → reçoit T
  //   → Ils recevront la même pièce au même index, juste à des moments différents
  public getNextPiece(player: Player): void {
    if (this.status !== GAME_STATUS.PLAYING) return;

    // Vérifier qu'on ne dépasse pas la fin de la séquence
    if (player.pieceIndex >= this.pieces.length) {
      console.error(`[Game:${this.roomName}] Séquence de pièces épuisée pour ${player.name} !`);
      // En pratique cela ne devrait jamais arriver avec 2000 pièces
      return;
    }

    // Récupérer la pièce à l'index courant du joueur
    const piece = this.pieces[player.pieceIndex];

    // Incrémenter l'index AVANT d'envoyer (pour la prochaine demande)
    player.pieceIndex += 1;

    // Envoyer la pièce sérialisée (type + position) à CE joueur uniquement
    player.emit(SOCKET_EVENTS.NEW_PIECE, { piece: piece.toIPiece() });
  }

  // ──────────────────────────────────────────────
  // applyPenalty : distribue des lignes de pénalité aux adversaires
  // ──────────────────────────────────────────────
  // Règle du sujet : n lignes effacées → (n-1) lignes de pénalité aux autres
  // - 1 effacée → 0 pénalité
  // - 2 effacées → 1 pénalité
  // - 3 effacées → 2 pénalités
  // - 4 effacées (Tetris) → 3 pénalités
  public applyPenalty(sourcePlayer: Player, linesCleared: number): void {
    const penaltyCount = Math.max(0, linesCleared - 1);

    // Aucune pénalité si 0 ou 1 ligne effacée
    if (penaltyCount === 0) return;

    // Envoyer la pénalité à tous les joueurs SAUF celui qui a effacé les lignes
    this.players.forEach(player => {
      if (player.id !== sourcePlayer.id && player.isAlive) {
        player.emit<PenaltyLinesPayload>(SOCKET_EVENTS.PENALTY_LINES, {
          count: penaltyCount,
        });
      }
    });

    console.log(`[Game:${this.roomName}] ${sourcePlayer.name} a effacé ${linesCleared} ligne(s) → ${penaltyCount} ligne(s) de pénalité distribuée(s)`);
  }

  // ──────────────────────────────────────────────
  // updateSpectrum : rebroadcast le spectre d'un joueur aux autres
  // ──────────────────────────────────────────────
  // Le spectre (tableau de 10 hauteurs de colonnes) est calculé côté client
  // et envoyé au serveur qui le redistribue aux adversaires.
  public updateSpectrum(player: Player, spectrum: number[]): void {
    // Broadcast aux AUTRES joueurs uniquement (pas besoin d'afficher son propre spectre)
    this.broadcastToOthers(player.id, SOCKET_EVENTS.SPECTRUM_UPDATE, {
      playerName: player.name,
      spectrum,
    } as SpectrumUpdatePayload);
  }

  // ──────────────────────────────────────────────
  // eliminatePlayer : marque un joueur comme éliminé
  // ──────────────────────────────────────────────
  // Déclenché quand le joueur envoie GAME_OVER_PLAYER (sa pile est trop haute).
  // Après élimination, vérifier si la partie est terminée.
  public eliminatePlayer(player: Player): void {
    if (!player.isAlive) return; // Déjà éliminé (éviter les doublons)

    player.isAlive = false;

    // Notifier tous les joueurs de l'élimination
    this.broadcast(SOCKET_EVENTS.PLAYER_ELIMINATED, { playerName: player.name });

    console.log(`[Game:${this.roomName}] ${player.name} a été éliminé`);

    // Vérifier si la partie est terminée
    this.checkWinCondition();
  }

  // ──────────────────────────────────────────────
  // checkWinCondition : vérifie s'il reste un seul joueur vivant
  // ──────────────────────────────────────────────
  // Cas 1 — Multijoueur : un seul joueur en vie → il gagne
  // Cas 2 — Solo :        le joueur est éliminé  → partie terminée (pas de vainqueur)
  public checkWinCondition(): void {
    if (this.status !== GAME_STATUS.PLAYING) return;

    const alivePlayers = Array.from(this.players.values()).filter(p => p.isAlive);
    const totalPlayers = this.players.size;

    if (totalPlayers === 1 && alivePlayers.length === 0) {
      // Mode solo : le seul joueur est éliminé
      this.endGame(null);
    } else if (alivePlayers.length <= 1) {
      // Un seul survivant (ou aucun si tout le monde s'est éliminé en même temps)
      const winner = alivePlayers.length === 1 ? alivePlayers[0].name : null;
      this.endGame(winner);
    }
  }

  // ──────────────────────────────────────────────
  // endGame : termine officiellement la partie
  // ──────────────────────────────────────────────
  private endGame(winner: string | null): void {
    this.status = GAME_STATUS.ENDED;

    this.broadcast<GameOverPayload>(SOCKET_EVENTS.GAME_OVER, {
      winner: winner ?? '',
    });

    console.log(`[Game:${this.roomName}] Partie terminée — Vainqueur : ${winner ?? 'aucun'}`);
  }

  // ──────────────────────────────────────────────
  // transferHost : donne le rôle d'hôte au prochain joueur disponible
  // ──────────────────────────────────────────────
  // Appelé quand l'hôte actuel se déconnecte.
  // Le "prochain" est le premier joueur dans l'itération de la Map.
  private transferHost(): void {
    const nextPlayer = this.players.values().next().value as Player | undefined;
    if (!nextPlayer) return;

    nextPlayer.isHost = true;
    this.broadcast(SOCKET_EVENTS.HOST_CHANGED, { newHost: nextPlayer.name });

    console.log(`[Game:${this.roomName}] Nouveau hôte : ${nextPlayer.name}`);
  }

  // ══════════════════════════════════════════════════════════
  // UTILITAIRES DE BROADCAST
  // ══════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────
  // broadcast : émet un événement à TOUS les joueurs de la room
  // ──────────────────────────────────────────────
  // Utilise les rooms Socket.IO : io.to(roomName) cible tous les sockets
  // qui ont rejoint cette room via socket.join(roomName).
  public broadcast<T>(event: string, data: T): void {
    this.io.to(this.roomName).emit(event, data);
  }

  // ──────────────────────────────────────────────
  // broadcastToOthers : émet à tous SAUF un joueur spécifique
  // ──────────────────────────────────────────────
  // Utilisé quand un joueur envoie une mise à jour qui ne doit pas
  // lui revenir (ex: son propre spectre).
  public broadcastToOthers<T>(excludeSocketId: string, event: string, data: T): void {
    this.players.forEach(player => {
      if (player.id !== excludeSocketId) {
        player.emit(event, data);
      }
    });
  }
}
```

---

## 8. Classe `GameManager`

Le `GameManager` est un **singleton** qui maintient en mémoire **toutes les rooms actives**.
Il fait le lien entre les événements socket et les instances de `Game`.

```typescript
// node_app/src/managers/GameManager.ts
import { Server } from 'socket.io';
import { Game }   from '../classes/Game';

export class GameManager {
  // ──────────────────────────────────────────────
  // Singleton : une seule instance dans tout le processus
  // ──────────────────────────────────────────────
  private static instance: GameManager | null = null;

  // Map de toutes les rooms actives : clé = roomName, valeur = instance Game
  private games: Map<string, Game>;

  // Référence à Socket.IO Server pour passer aux nouvelles Game
  private io: Server | null;

  // ──────────────────────────────────────────────
  // Constructeur privé (pattern Singleton)
  // ──────────────────────────────────────────────
  private constructor() {
    this.games = new Map();
    this.io    = null;
  }

  // ──────────────────────────────────────────────
  // getInstance : retourne l'instance unique
  // ──────────────────────────────────────────────
  public static getInstance(): GameManager {
    if (!GameManager.instance) {
      GameManager.instance = new GameManager();
    }
    return GameManager.instance;
  }

  // ──────────────────────────────────────────────
  // setIO : injecte la référence Socket.IO Server
  // ──────────────────────────────────────────────
  // Appelé une fois au démarrage depuis index.ts.
  // Nécessaire pour que les Game puissent broadcaster.
  public setIO(io: Server): void {
    this.io = io;
  }

  // ──────────────────────────────────────────────
  // getOrCreateGame : retourne la game existante ou en crée une
  // ──────────────────────────────────────────────
  // C'est la méthode principale : appelée à chaque JOIN_ROOM.
  // Si la room n'existe pas encore, elle est créée à la volée.
  public getOrCreateGame(roomName: string): Game {
    if (!this.io) {
      throw new Error('[GameManager] setIO() doit être appelé avant getOrCreateGame()');
    }

    if (!this.games.has(roomName)) {
      const newGame = new Game(roomName, this.io);
      this.games.set(roomName, newGame);
      console.log(`[GameManager] Nouvelle room créée : "${roomName}" (total : ${this.games.size})`);
    }

    return this.games.get(roomName)!;
  }

  // ──────────────────────────────────────────────
  // getGame : retourne une game si elle existe
  // ──────────────────────────────────────────────
  public getGame(roomName: string): Game | undefined {
    return this.games.get(roomName);
  }

  // ──────────────────────────────────────────────
  // removeGame : supprime une room terminée ou vide
  // ──────────────────────────────────────────────
  // Appelé automatiquement quand une room est vide.
  public removeGame(roomName: string): void {
    this.games.delete(roomName);
    console.log(`[GameManager] Room supprimée : "${roomName}" (total : ${this.games.size})`);
  }

  // ──────────────────────────────────────────────
  // cleanupIfEmpty : supprime la room si elle est vide
  // ──────────────────────────────────────────────
  // Appelé après chaque déconnexion pour éviter les rooms fantômes.
  public cleanupIfEmpty(roomName: string): void {
    const game = this.games.get(roomName);
    if (game && game.isEmpty()) {
      this.removeGame(roomName);
    }
  }

  // ──────────────────────────────────────────────
  // getActiveGamesCount : retourne le nombre de rooms actives
  // ──────────────────────────────────────────────
  // Utile pour le monitoring et les tests.
  public getActiveGamesCount(): number {
    return this.games.size;
  }

  // ──────────────────────────────────────────────
  // resetForTests : réinitialise le singleton pour les tests
  // ──────────────────────────────────────────────
  // ⚠️  À utiliser UNIQUEMENT dans les tests unitaires.
  public static resetForTests(): void {
    GameManager.instance = null;
  }
}
```

---

## 9. Utilitaire — `pieceGenerator.ts`

Ce fichier génère la **séquence de pièces partagée** par tous les joueurs d'une room.
C'est l'un des points les plus importants du sujet : **tous les joueurs reçoivent exactement les mêmes pièces dans le même ordre**.

```typescript
// node_app/src/utils/pieceGenerator.ts
import { Piece } from '../classes/Piece';
import { PIECE_TYPES } from '../../../shared/constants';
import { PieceType } from '../../../shared/types';

// ──────────────────────────────────────────────────────────
// generatePieceSequence : génère un tableau de N pièces aléatoires
// ──────────────────────────────────────────────────────────
// Cette fonction est appelée UNE SEULE FOIS par partie, lors de Game.start().
// Tous les joueurs de la room parcourent ce même tableau, chacun avec son
// propre pieceIndex, garantissant qu'ils reçoivent les mêmes pièces.
//
// Algorithme : utilise le "bag system" pour une distribution équilibrée.
// Le bag system est la méthode officielle du Tetris moderne :
//   - On place les 7 pièces dans un "sac"
//   - On les tire dans un ordre aléatoire (Fisher-Yates shuffle)
//   - Quand le sac est vide, on le remplit à nouveau
// → Garantit qu'on ne verra jamais plus de 12 pièces sans voir toutes les 7
export const generatePieceSequence = (count: number): Piece[] => {
  const sequence: Piece[] = [];

  while (sequence.length < count) {
    // Créer un "sac" avec les 7 types
    const bag: PieceType[] = [...PIECE_TYPES] as PieceType[];

    // Mélanger le sac avec l'algorithme Fisher-Yates
    shuffleArray(bag);

    // Ajouter les pièces du sac à la séquence
    for (const type of bag) {
      sequence.push(new Piece(type));
      if (sequence.length >= count) break;
    }
  }

  return sequence;
};

// ──────────────────────────────────────────────────────────
// shuffleArray : mélange un tableau en place (Fisher-Yates)
// ──────────────────────────────────────────────────────────
// L'algorithme de Fisher-Yates garantit une permutation uniforme.
// Complexité : O(n)
const shuffleArray = <T>(arr: T[]): void => {
  for (let i = arr.length - 1; i > 0; i--) {
    // Choisir un index aléatoire entre 0 et i (inclus)
    const j = Math.floor(Math.random() * (i + 1));
    // Échanger arr[i] et arr[j]
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
};
```

---

## 10. Socket.IO — Handlers et Emitters

### 10.1 `socket/handlers.ts` — Enregistrement des événements entrants

Ce fichier enregistre **tous les listeners** pour les événements reçus des clients.
Chaque handler : valide le payload, récupère la game/player, délègue à la bonne méthode.

```typescript
// node_app/src/socket/handlers.ts
import { Server, Socket } from 'socket.io';
import { GameManager }    from '../managers/GameManager';
import { Player }         from '../classes/Player';
import { SOCKET_EVENTS }  from '../../../shared/events';
import {
  JoinRoomPayload,
  StartGamePayload,
  RequestPiecePayload,
  UpdateSpectrumPayload,
  LinesClearedPayload,
  GameOverPlayerPayload,
  RestartGamePayload,
} from '../types';

// ──────────────────────────────────────────────────────────
// registerSocketHandlers : enregistre tous les listeners pour une socket
// ──────────────────────────────────────────────────────────
// Appelé dans index.ts à chaque nouvelle connexion.
// La socket représente la connexion d'UN client spécifique.
export const registerSocketHandlers = (
  io:          Server,
  socket:      Socket,
  gameManager: GameManager,
): void => {

  // Injecter io dans le GameManager s'il ne l'a pas encore
  gameManager.setIO(io);

  // ──────────────────────────────────────────────
  // JOIN_ROOM : un joueur rejoint une room
  // ──────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.JOIN_ROOM, (payload: JoinRoomPayload) => {
    // Validation du payload
    if (!payload?.room || !payload?.playerName) {
      console.warn(`[Handler:JOIN_ROOM] Payload invalide depuis ${socket.id}:`, payload);
      return;
    }

    const { room, playerName } = payload;

    // Sanitiser les noms pour éviter les injections ou les noms vides
    const sanitizedName = playerName.trim().slice(0, 20);
    const sanitizedRoom = room.trim().slice(0, 30);

    if (!sanitizedName || !sanitizedRoom) return;

    // Récupérer ou créer la room
    const game = gameManager.getOrCreateGame(sanitizedRoom);

    // Créer le joueur avec sa socket
    const player = new Player(socket, sanitizedName, sanitizedRoom);

    // Tenter d'ajouter le joueur à la game
    const joined = game.addPlayer(player);

    if (joined) {
      // Stocker l'association socket.id → roomName dans les données du socket
      // (utile pour retrouver la room lors de la déconnexion)
      (socket as any).currentRoom = sanitizedRoom;
      console.log(`[Handler:JOIN_ROOM] ${sanitizedName} → room "${sanitizedRoom}"`);
    }
  });

  // ──────────────────────────────────────────────
  // START_GAME : l'hôte démarre la partie
  // ──────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.START_GAME, (payload: StartGamePayload) => {
    if (!payload?.room) return;

    const game = gameManager.getGame(payload.room);
    if (!game) return;

    const player = game.getPlayer(socket.id);
    if (!player) return;

    // Vérification : seul l'hôte peut démarrer
    if (!player.isHost) {
      console.warn(`[Handler:START_GAME] ${player.name} n'est pas l'hôte de "${payload.room}"`);
      return;
    }

    game.start();
  });

  // ──────────────────────────────────────────────
  // REQUEST_PIECE : le client demande la prochaine pièce
  // ──────────────────────────────────────────────
  // Appelé immédiatement après GAME_STARTED, puis après chaque lockPiece.
  socket.on(SOCKET_EVENTS.REQUEST_PIECE, (payload: RequestPiecePayload) => {
    if (!payload?.room) return;

    const game = gameManager.getGame(payload.room);
    if (!game) return;

    const player = game.getPlayer(socket.id);
    if (!player || !player.isAlive) return;

    game.getNextPiece(player);
  });

  // ──────────────────────────────────────────────
  // UPDATE_SPECTRUM : le client envoie son spectre
  // ──────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.UPDATE_SPECTRUM, (payload: UpdateSpectrumPayload) => {
    if (!payload?.room || !Array.isArray(payload?.spectrum)) return;
    if (payload.spectrum.length !== 10) return; // Validation : exactement 10 valeurs

    const game = gameManager.getGame(payload.room);
    if (!game) return;

    const player = game.getPlayer(socket.id);
    if (!player || !player.isAlive) return;

    game.updateSpectrum(player, payload.spectrum);
  });

  // ──────────────────────────────────────────────
  // LINES_CLEARED : le client a effacé des lignes → calculer les pénalités
  // ──────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.LINES_CLEARED, (payload: LinesClearedPayload) => {
    if (!payload?.room || typeof payload?.count !== 'number') return;
    if (payload.count < 1 || payload.count > 4) return; // Validation : 1 à 4 lignes max

    const game = gameManager.getGame(payload.room);
    if (!game) return;

    const player = game.getPlayer(socket.id);
    if (!player || !player.isAlive) return;

    game.applyPenalty(player, payload.count);
  });

  // ──────────────────────────────────────────────
  // GAME_OVER_PLAYER : ce joueur est éliminé
  // ──────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.GAME_OVER_PLAYER, (payload: GameOverPlayerPayload) => {
    if (!payload?.room) return;

    const game = gameManager.getGame(payload.room);
    if (!game) return;

    const player = game.getPlayer(socket.id);
    if (!player) return;

    game.eliminatePlayer(player);
  });

  // ──────────────────────────────────────────────
  // RESTART_GAME : l'hôte relance une partie
  // ──────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.RESTART_GAME, (payload: RestartGamePayload) => {
    if (!payload?.room) return;

    const game = gameManager.getGame(payload.room);
    if (!game) return;

    const player = game.getPlayer(socket.id);
    if (!player) return;

    if (!player.isHost) {
      console.warn(`[Handler:RESTART_GAME] ${player.name} n'est pas l'hôte`);
      return;
    }

    game.restart();
  });

  // ──────────────────────────────────────────────
  // disconnect : gestion de la déconnexion du client
  // ──────────────────────────────────────────────
  // Événement natif Socket.IO. Déclenché automatiquement quand
  // le navigateur se ferme, le réseau coupe, etc.
  socket.on('disconnect', () => {
    // Retrouver la room du joueur via la donnée stockée dans la socket
    const roomName = (socket as any).currentRoom as string | undefined;
    if (!roomName) return;

    const game = gameManager.getGame(roomName);
    if (!game) return;

    // Retirer le joueur de la game
    game.removePlayer(socket.id);

    // Si la room est vide, la supprimer pour libérer la mémoire
    gameManager.cleanupIfEmpty(roomName);
  });
};
```

### 10.2 `socket/emitters.ts` — Fonctions d'émission typées

Ce fichier regroupe des **fonctions utilitaires** pour émettre des événements de manière typée.
Bien que certains broadcasts soient déjà dans la classe `Game`, ce fichier peut être utilisé pour des cas spéciaux nécessitant un accès direct à `io`.

```typescript
// node_app/src/socket/emitters.ts
import { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS }  from '../../../shared/events';
import {
  RoomStatePayload,
  IPlayerInfo,
  GameOverPayload,
  PenaltyLinesPayload,
  SpectrumUpdatePayload,
} from '../../../shared/types';
import { IPiece } from '../../../shared/types';

// ──────────────────────────────────────────────────────────
// emitToSocket : émet un événement à une socket spécifique
// ──────────────────────────────────────────────────────────
export const emitToSocket = <T>(
  socket: Socket,
  event:  string,
  data?:  T
): void => {
  socket.emit(event, data);
};

// ──────────────────────────────────────────────────────────
// emitToRoom : émet à tous les membres d'une room Socket.IO
// ──────────────────────────────────────────────────────────
export const emitToRoom = <T>(
  io:       Server,
  roomName: string,
  event:    string,
  data?:    T
): void => {
  io.to(roomName).emit(event, data);
};

// ──────────────────────────────────────────────────────────
// emitRoomState : envoie l'état de la room à un joueur
// ──────────────────────────────────────────────────────────
export const emitRoomState = (
  socket:  Socket,
  payload: RoomStatePayload
): void => {
  socket.emit(SOCKET_EVENTS.ROOM_STATE, payload);
};

// ──────────────────────────────────────────────────────────
// emitNewPiece : envoie la prochaine pièce à un joueur
// ──────────────────────────────────────────────────────────
export const emitNewPiece = (
  socket: Socket,
  piece:  IPiece
): void => {
  socket.emit(SOCKET_EVENTS.NEW_PIECE, { piece });
};

// ──────────────────────────────────────────────────────────
// emitPenaltyLines : envoie des lignes de pénalité à un joueur
// ──────────────────────────────────────────────────────────
export const emitPenaltyLines = (
  socket:  Socket,
  payload: PenaltyLinesPayload
): void => {
  socket.emit(SOCKET_EVENTS.PENALTY_LINES, payload);
};

// ──────────────────────────────────────────────────────────
// emitSpectrumUpdate : broadcast le spectre d'un joueur à une room
// ──────────────────────────────────────────────────────────
export const emitSpectrumUpdate = (
  io:       Server,
  roomName: string,
  payload:  SpectrumUpdatePayload
): void => {
  io.to(roomName).emit(SOCKET_EVENTS.SPECTRUM_UPDATE, payload);
};

// ──────────────────────────────────────────────────────────
// emitGameOver : notifie une room de la fin de partie
// ──────────────────────────────────────────────────────────
export const emitGameOver = (
  io:       Server,
  roomName: string,
  payload:  GameOverPayload
): void => {
  io.to(roomName).emit(SOCKET_EVENTS.GAME_OVER, payload);
};
```

---

## 11. Protocole Réseau complet

### 11.1 Événements Client → Serveur

| Événement | Payload | Validation | Description |
|---|---|---|---|
| `JOIN_ROOM` | `{ room: string, playerName: string }` | Champs non vides, max 20/30 chars | Rejoindre ou créer une room |
| `START_GAME` | `{ room: string }` | Émetteur = hôte, room existante | L'hôte démarre la partie |
| `REQUEST_PIECE` | `{ room: string }` | Joueur en vie, partie en cours | Demande la prochaine pièce |
| `UPDATE_SPECTRUM` | `{ room: string, spectrum: number[] }` | Tableau de 10 valeurs | Envoyer l'état compressé du plateau |
| `LINES_CLEARED` | `{ room: string, count: number }` | count entre 1 et 4 | N lignes effacées → distribuer pénalités |
| `GAME_OVER_PLAYER` | `{ room: string }` | Joueur encore vivant | Ce joueur est éliminé |
| `RESTART_GAME` | `{ room: string }` | Émetteur = hôte | Relancer une nouvelle partie |

### 11.2 Événements Serveur → Client

| Événement | Payload | Destinataire | Description |
|---|---|---|---|
| `ROOM_STATE` | `{ players, gameStatus, isHost }` | Joueur qui vient de joindre | État complet de la room |
| `PLAYER_JOINED` | `{ name, isHost, isAlive }` | Tous sauf le nouveau | Un joueur a rejoint |
| `PLAYER_LEFT` | `{ playerName }` | Tous | Un joueur a quitté |
| `HOST_CHANGED` | `{ newHost }` | Tous | Nouveau hôte désigné |
| `GAME_STARTED` | `{}` | Tous | La partie commence |
| `NEW_PIECE` | `{ piece: { type, position } }` | Joueur demandeur uniquement | Réponse à REQUEST_PIECE |
| `SPECTRUM_UPDATE` | `{ playerName, spectrum }` | Tous sauf l'émetteur | Spectre d'un adversaire |
| `PENALTY_LINES` | `{ count }` | Tous sauf la source | Lignes de pénalité |
| `PLAYER_ELIMINATED` | `{ playerName }` | Tous | Un joueur a perdu |
| `GAME_OVER` | `{ winner }` | Tous | Fin de partie |

### 11.3 Flux de jeu complet annoté

```
[Client Alice]               [Serveur]                [Client Bob]
     │                           │                           │
     │── JOIN_ROOM ─────────────>│                           │
     │   {room:"arena",          │  → getOrCreateGame("arena")
     │    playerName:"Alice"}    │  → new Player(socket, "Alice", "arena")
     │                           │  → game.addPlayer(player) → isHost=true
     │<── ROOM_STATE ────────────│  → emit ROOM_STATE à Alice uniquement
     │   {players:[Alice],       │
     │    gameStatus:"waiting",  │
     │    isHost:true}           │
     │                           │
     │                           │<────────────── JOIN_ROOM ─┤
     │                           │   {room:"arena",          │
     │                           │    playerName:"Bob"}      │
     │                           │  → game.addPlayer(Bob) → isHost=false
     │<── PLAYER_JOINED ─────────│  → broadcast PLAYER_JOINED (Alice reçoit)
     │   {name:"Bob",...}        │──── ROOM_STATE ──────────>│
     │                           │                           │ (Bob reçoit l'état complet)
     │                           │                           │
     │── START_GAME ────────────>│                           │
     │   {room:"arena"}          │  → vérif isHost=true
     │                           │  → game.start()
     │                           │  → generatePieceSequence(2000)
     │                           │  → reset tous les joueurs
     │<── GAME_STARTED ──────────│──── GAME_STARTED ────────>│
     │                           │                           │
     │── REQUEST_PIECE ─────────>│                           │
     │   {room:"arena"}          │  → player.pieceIndex=0    │
     │                           │  → piece = pieces[0] (T)  │
     │                           │  → pieceIndex = 1         │
     │<── NEW_PIECE ─────────────│                           │
     │   {piece:{type:"T",...}}  │           REQUEST_PIECE ──┤
     │                           │  → player.pieceIndex=0    │
     │                           │  → piece = pieces[0] (T)  │  ← Même pièce !
     │                           │  → pieceIndex = 1         │
     │                           │──────────── NEW_PIECE ───>│
     │                           │                           │
     │── UPDATE_SPECTRUM ───────>│                           │
     │   {room, spectrum:[...]}  │  → game.updateSpectrum()  │
     │                           │──── SPECTRUM_UPDATE ─────>│
     │                           │   {playerName:"Alice",...}│
     │                           │                           │
     │── LINES_CLEARED ─────────>│                           │
     │   {room, count:2}         │  → penaltyCount = 2-1 = 1 │
     │                           │──── PENALTY_LINES ───────>│
     │                           │   {count:1}               │
     │                           │                           │
     │── GAME_OVER_PLAYER ──────>│                           │
     │   {room:"arena"}          │  → player.isAlive = false │
     │                           │  → checkWinCondition()    │
     │<── PLAYER_ELIMINATED ─────│──── PLAYER_ELIMINATED ───>│
     │<── GAME_OVER ─────────────│──── GAME_OVER ───────────>│
     │   {winner:"Bob"}          │   {winner:"Bob"}          │
```

---

## 12. Tests Unitaires Backend

### 12.1 Configuration Jest (`package.json`)

Les tests sont dans `tests/server/` et importent directement les classes depuis `node_app/src/`.

```typescript
// jest.config.js (à la racine de backend/)
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/server'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^../../../shared/(.*)$': '<rootDir>/shared/$1',
  },
  collectCoverageFrom: [
    'node_app/src/**/*.ts',
    '!node_app/src/index.ts',
    '!node_app/src/types/**',
  ],
  coverageThreshold: {
    global: { statements: 70, functions: 70, lines: 70, branches: 50 }
  },
};
```

### 12.2 Tests de `Piece`

```typescript
// tests/server/classes/Piece.test.ts
import { Piece } from '../../../node_app/src/classes/Piece';
import { PIECE_TYPES, BOARD_WIDTH } from '../../../shared/constants';

describe('Piece', () => {
  describe('constructor', () => {
    it('crée une pièce avec un type aléatoire si non fourni', () => {
      const piece = new Piece();
      expect(PIECE_TYPES).toContain(piece.type);
    });

    it('crée une pièce avec le type fourni', () => {
      const piece = new Piece('I');
      expect(piece.type).toBe('I');
    });

    it('assigne une position de spawn valide', () => {
      const piece = new Piece('O');
      expect(piece.position.x).toBeGreaterThanOrEqual(0);
      expect(piece.position.x).toBeLessThan(BOARD_WIDTH);
      expect(piece.position.y).toBe(-1); // Légèrement au-dessus
    });
  });

  describe('Piece.randomType()', () => {
    it('retourne toujours un type valide', () => {
      for (let i = 0; i < 100; i++) {
        expect(PIECE_TYPES).toContain(Piece.randomType());
      }
    });

    it('génère tous les types sur un grand échantillon', () => {
      const generated = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        generated.add(Piece.randomType());
      }
      // Tous les 7 types doivent apparaître
      expect(generated.size).toBe(7);
    });
  });

  describe('toIPiece()', () => {
    it('retourne uniquement type et position', () => {
      const piece = new Piece('T');
      const iPiece = piece.toIPiece();
      expect(iPiece).toHaveProperty('type', 'T');
      expect(iPiece).toHaveProperty('position');
      expect(iPiece).not.toHaveProperty('socket');
    });

    it('retourne une copie de la position (pas de référence)', () => {
      const piece = new Piece('I');
      const iPiece = piece.toIPiece();
      // Modifier la copie ne doit pas affecter l'original
      (iPiece.position as any).x = 999;
      expect(piece.position.x).not.toBe(999);
    });
  });
});
```

### 12.3 Tests de `Player`

```typescript
// tests/server/classes/Player.test.ts
import { Player } from '../../../node_app/src/classes/Player';

// Mock de Socket.IO Socket
const createMockSocket = (id: string = 'socket-123') => ({
  id,
  emit:  jest.fn(),
  join:  jest.fn(),
  leave: jest.fn(),
});

describe('Player', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let player: Player;

  beforeEach(() => {
    mockSocket = createMockSocket();
    player = new Player(mockSocket as any, 'Alice', 'myroom');
  });

  describe('constructor', () => {
    it('assigne l\'id depuis socket.id', () => {
      expect(player.id).toBe('socket-123');
    });

    it('stocke le nom et la room', () => {
      expect(player.name).toBe('Alice');
      expect(player.roomName).toBe('myroom');
    });

    it('initialise isHost à false', () => {
      expect(player.isHost).toBe(false);
    });

    it('initialise isAlive à true', () => {
      expect(player.isAlive).toBe(true);
    });

    it('initialise pieceIndex à 0', () => {
      expect(player.pieceIndex).toBe(0);
    });
  });

  describe('emit()', () => {
    it('appelle socket.emit avec le bon event et data', () => {
      player.emit('TEST_EVENT', { foo: 'bar' });
      expect(mockSocket.emit).toHaveBeenCalledWith('TEST_EVENT', { foo: 'bar' });
    });

    it('fonctionne sans data', () => {
      player.emit('NO_DATA');
      expect(mockSocket.emit).toHaveBeenCalledWith('NO_DATA', undefined);
    });
  });

  describe('joinSocketRoom() / leaveSocketRoom()', () => {
    it('appelle socket.join avec le nom de la room', () => {
      player.joinSocketRoom();
      expect(mockSocket.join).toHaveBeenCalledWith('myroom');
    });

    it('appelle socket.leave avec le nom de la room', () => {
      player.leaveSocketRoom();
      expect(mockSocket.leave).toHaveBeenCalledWith('myroom');
    });
  });

  describe('reset()', () => {
    it('remet isAlive à true', () => {
      player.isAlive = false;
      player.reset();
      expect(player.isAlive).toBe(true);
    });

    it('remet pieceIndex à 0', () => {
      player.pieceIndex = 42;
      player.reset();
      expect(player.pieceIndex).toBe(0);
    });
  });

  describe('toIPlayerInfo()', () => {
    it('retourne les infos publiques sans la socket', () => {
      player.isHost = true;
      const info = player.toIPlayerInfo();
      expect(info).toEqual({ name: 'Alice', isHost: true, isAlive: true });
      expect(info).not.toHaveProperty('socket');
      expect(info).not.toHaveProperty('pieceIndex');
    });
  });
});
```

### 12.4 Tests de `Game`

```typescript
// tests/server/classes/Game.test.ts
import { Game }   from '../../../node_app/src/classes/Game';
import { Player } from '../../../node_app/src/classes/Player';
import { SOCKET_EVENTS } from '../../../shared/events';

// Mock de l'instance Socket.IO Server
const createMockIO = () => ({
  to: jest.fn().mockReturnValue({ emit: jest.fn() }),
});

const createMockSocket = (id: string) => ({
  id,
  emit:  jest.fn(),
  join:  jest.fn(),
  leave: jest.fn(),
});

// Helper : crée un joueur avec un socket mocké
const createPlayer = (name: string, socketId: string) => {
  const socket = createMockSocket(socketId);
  return new Player(socket as any, name, 'testroom');
};

describe('Game', () => {
  let mockIO: ReturnType<typeof createMockIO>;
  let game: Game;

  beforeEach(() => {
    mockIO = createMockIO();
    game = new Game('testroom', mockIO as any);
  });

  // ──────────────────────────────────────────────
  // addPlayer
  // ──────────────────────────────────────────────
  describe('addPlayer()', () => {
    it('ajoute un joueur et le rend hôte s\'il est le premier', () => {
      const alice = createPlayer('Alice', 'id-1');
      game.addPlayer(alice);
      expect(alice.isHost).toBe(true);
    });

    it('n\'est pas hôte si pas le premier', () => {
      game.addPlayer(createPlayer('Alice', 'id-1'));
      const bob = createPlayer('Bob', 'id-2');
      game.addPlayer(bob);
      expect(bob.isHost).toBe(false);
    });

    it('rejette le joueur si la partie est en cours', () => {
      const alice = createPlayer('Alice', 'id-1');
      game.addPlayer(alice);
      game.start(); // Démarre la partie

      const bob = createPlayer('Bob', 'id-2');
      const result = game.addPlayer(bob);
      expect(result).toBe(false);
    });

    it('retourne true pour un ajout réussi', () => {
      const alice = createPlayer('Alice', 'id-1');
      expect(game.addPlayer(alice)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // removePlayer
  // ──────────────────────────────────────────────
  describe('removePlayer()', () => {
    it('supprime le joueur de la Map', () => {
      const alice = createPlayer('Alice', 'id-1');
      game.addPlayer(alice);
      game.removePlayer('id-1');
      expect(game.isEmpty()).toBe(true);
    });

    it('transfère le rôle d\'hôte si l\'hôte part', () => {
      const alice = createPlayer('Alice', 'id-1');
      const bob   = createPlayer('Bob',   'id-2');
      game.addPlayer(alice); // Alice = hôte
      game.addPlayer(bob);
      game.removePlayer('id-1'); // Alice part
      expect(bob.isHost).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // start
  // ──────────────────────────────────────────────
  describe('start()', () => {
    it('change le statut à "playing"', () => {
      game.addPlayer(createPlayer('Alice', 'id-1'));
      game.start();
      expect(game.status).toBe('playing');
    });

    it('broadcast GAME_STARTED à tous', () => {
      game.addPlayer(createPlayer('Alice', 'id-1'));
      game.start();
      expect(mockIO.to).toHaveBeenCalledWith('testroom');
    });

    it('ne redémarre pas si déjà en cours', () => {
      game.addPlayer(createPlayer('Alice', 'id-1'));
      game.start();
      const firstStartCall = (mockIO.to as jest.Mock).mock.calls.length;
      game.start(); // Deuxième appel
      expect((mockIO.to as jest.Mock).mock.calls.length).toBe(firstStartCall);
    });
  });

  // ──────────────────────────────────────────────
  // getNextPiece
  // ──────────────────────────────────────────────
  describe('getNextPiece()', () => {
    it('incrémente le pieceIndex du joueur', () => {
      const alice = createPlayer('Alice', 'id-1');
      game.addPlayer(alice);
      game.start();
      game.getNextPiece(alice);
      expect(alice.pieceIndex).toBe(1);
    });

    it('deux joueurs à pieceIndex=0 reçoivent la même pièce', () => {
      const alice  = createPlayer('Alice', 'id-1');
      const bob    = createPlayer('Bob',   'id-2');
      game.addPlayer(alice);
      game.addPlayer(bob);
      game.start();

      // Espionner les émissions
      const aliceEmitSpy = jest.spyOn(alice as any, 'emit');
      const bobEmitSpy   = jest.spyOn(bob as any,   'emit');

      game.getNextPiece(alice);
      game.getNextPiece(bob);

      const alicePiece = (aliceEmitSpy.mock.calls[0][1] as any).piece;
      const bobPiece   = (bobEmitSpy.mock.calls[0][1] as any).piece;

      // Même type de pièce (même index dans la séquence partagée)
      expect(alicePiece.type).toBe(bobPiece.type);
    });
  });

  // ──────────────────────────────────────────────
  // applyPenalty
  // ──────────────────────────────────────────────
  describe('applyPenalty()', () => {
    it('n\'envoie pas de pénalité pour 1 ligne effacée', () => {
      const alice  = createPlayer('Alice', 'id-1');
      const bob    = createPlayer('Bob',   'id-2');
      game.addPlayer(alice);
      game.addPlayer(bob);
      game.start();

      const bobSocket = (bob as any).socket;
      game.applyPenalty(alice, 1);
      const penaltyCalls = bobSocket.emit.mock.calls.filter(
        (c: any[]) => c[0] === SOCKET_EVENTS.PENALTY_LINES
      );
      expect(penaltyCalls.length).toBe(0);
    });

    it('envoie 1 pénalité pour 2 lignes effacées', () => {
      const alice  = createPlayer('Alice', 'id-1');
      const bob    = createPlayer('Bob',   'id-2');
      game.addPlayer(alice);
      game.addPlayer(bob);
      game.start();

      const bobSocket = (bob as any).socket;
      game.applyPenalty(alice, 2);
      const penaltyCalls = bobSocket.emit.mock.calls.filter(
        (c: any[]) => c[0] === SOCKET_EVENTS.PENALTY_LINES
      );
      expect(penaltyCalls[0][1].count).toBe(1);
    });

    it('envoie 3 pénalités pour un Tetris (4 lignes)', () => {
      const alice  = createPlayer('Alice', 'id-1');
      const bob    = createPlayer('Bob',   'id-2');
      game.addPlayer(alice);
      game.addPlayer(bob);
      game.start();

      const bobSocket = (bob as any).socket;
      game.applyPenalty(alice, 4);
      const penaltyCalls = bobSocket.emit.mock.calls.filter(
        (c: any[]) => c[0] === SOCKET_EVENTS.PENALTY_LINES
      );
      expect(penaltyCalls[0][1].count).toBe(3);
    });
  });

  // ──────────────────────────────────────────────
  // eliminatePlayer & checkWinCondition
  // ──────────────────────────────────────────────
  describe('eliminatePlayer()', () => {
    it('marque le joueur comme mort', () => {
      const alice  = createPlayer('Alice', 'id-1');
      game.addPlayer(alice);
      game.start();
      game.eliminatePlayer(alice);
      expect(alice.isAlive).toBe(false);
    });

    it('déclenche GAME_OVER en mode solo', () => {
      const alice = createPlayer('Alice', 'id-1');
      game.addPlayer(alice);
      game.start();
      game.eliminatePlayer(alice);
      expect(game.status).toBe('ended');
    });

    it('déclenche GAME_OVER quand un seul joueur reste en vie', () => {
      const alice  = createPlayer('Alice', 'id-1');
      const bob    = createPlayer('Bob',   'id-2');
      game.addPlayer(alice);
      game.addPlayer(bob);
      game.start();
      game.eliminatePlayer(alice);
      expect(game.status).toBe('ended');
    });
  });
});
```

### 12.5 Tests de `pieceGenerator`

```typescript
// tests/server/utils/pieceGenerator.test.ts
import { generatePieceSequence } from '../../../node_app/src/utils/pieceGenerator';
import { PIECE_TYPES } from '../../../shared/constants';

describe('generatePieceSequence()', () => {
  it('génère exactement N pièces', () => {
    const seq = generatePieceSequence(100);
    expect(seq.length).toBe(100);
  });

  it('toutes les pièces ont un type valide', () => {
    const seq = generatePieceSequence(200);
    seq.forEach(piece => {
      expect(PIECE_TYPES).toContain(piece.type);
    });
  });

  it('génère tous les 7 types', () => {
    const seq = generatePieceSequence(200);
    const types = new Set(seq.map(p => p.type));
    expect(types.size).toBe(7);
  });

  it('deux appels génèrent des séquences différentes', () => {
    const seq1 = generatePieceSequence(50);
    const seq2 = generatePieceSequence(50);
    // Il est astronomiquement improbable que deux séquences soient identiques
    const types1 = seq1.map(p => p.type).join(',');
    const types2 = seq2.map(p => p.type).join(',');
    expect(types1).not.toBe(types2);
  });

  it('respecte la distribution équilibrée du bag system', () => {
    // Dans 700 pièces, chaque type devrait apparaître ~100 fois
    const seq = generatePieceSequence(700);
    const counts: Record<string, number> = {};
    seq.forEach(p => { counts[p.type] = (counts[p.type] ?? 0) + 1; });

    // Chaque type devrait être entre 80 et 120 (tolérance de ±20%)
    PIECE_TYPES.forEach(type => {
      expect(counts[type]).toBeGreaterThan(80);
      expect(counts[type]).toBeLessThan(120);
    });
  });
});
```

---

## 13. Contraintes et Pièges à éviter

### 13.1 ✅ Obligatoire : OOP avec `this` côté serveur

```typescript
// ✅ CORRECT : côté serveur, utiliser des classes avec this
class Game {
  private players: Map<string, Player>;

  constructor() {
    this.players = new Map(); // ✅ this obligatoire
  }

  addPlayer(player: Player): void {
    this.players.set(player.id, player); // ✅ this
  }
}

// ❌ NE PAS faire côté serveur ce qui est fait côté client
const addPlayer = (players: Map<string, Player>, player: Player) => {
  // Fonction pure sans this → réservée au client
};
```

### 13.2 ⚠️ Piège : Rooms Socket.IO vs rooms de jeu

```typescript
// Les "rooms Socket.IO" et les "rooms de jeu" sont deux concepts distincts.

// Room Socket.IO = groupe de sockets pour le broadcast
socket.join('myroom');         // Abonne cette socket à la room "myroom"
io.to('myroom').emit(...);     // Envoie à toutes les sockets de "myroom"

// Room de jeu = instance de la classe Game avec ses joueurs
const game = new Game('myroom', io);   // Notre objet métier

// Les deux coexistent : la Game utilise io.to(roomName) pour broadcaster,
// et les Players appellent socket.join(roomName) à leur entrée.
```

### 13.3 ⚠️ Piège : Séquence de pièces partagée

```typescript
// ❌ ERREUR : générer une pièce différente à chaque demande
socket.on('REQUEST_PIECE', ({ room }) => {
  const piece = new Piece(); // ← Pièce aléatoire → chaque joueur reçoit une pièce DIFFÉRENTE !
  socket.emit('NEW_PIECE', { piece });
});

// ✅ CORRECT : tous partagent la même séquence pré-générée
// La séquence est générée UNE FOIS dans game.start()
// Chaque joueur a son propre pieceIndex qui avance dans cette séquence
socket.on('REQUEST_PIECE', ({ room }) => {
  const game = gameManager.getGame(room);
  const player = game.getPlayer(socket.id);
  game.getNextPiece(player); // Retourne pieces[player.pieceIndex++]
});
```

### 13.4 ⚠️ Piège : Memory leak — rooms fantômes

```typescript
// ❌ PROBLÈME : si une room n'est jamais supprimée, la mémoire augmente indéfiniment
socket.on('disconnect', () => {
  const game = gameManager.getGame(roomName);
  game.removePlayer(socket.id);
  // Oubli de nettoyer la room vide !
});

// ✅ SOLUTION : nettoyer après chaque déconnexion
socket.on('disconnect', () => {
  const game = gameManager.getGame(roomName);
  if (game) {
    game.removePlayer(socket.id);
    gameManager.cleanupIfEmpty(roomName); // ← Supprime si vide
  }
});
```

### 13.5 ⚠️ Piège : Singleton GameManager et tests

```typescript
// ❌ PROBLÈME : le Singleton persiste entre les tests Jest
// → les tests s'influencent mutuellement

// ✅ SOLUTION : réinitialiser le singleton dans beforeEach
beforeEach(() => {
  GameManager.resetForTests(); // Remet instance = null
});

// Et la méthode de reset dans le GameManager :
public static resetForTests(): void {
  GameManager.instance = null; // ⚠️ UNIQUEMENT POUR LES TESTS
}
```

### 13.6 ⚠️ Piège : Validation des payloads socket

```typescript
// ❌ DANGEREUX : faire confiance aveuglément aux données du client
socket.on('LINES_CLEARED', (payload) => {
  game.applyPenalty(player, payload.count); // Et si count = 999999 ?
});

// ✅ SÉCURISÉ : toujours valider les données entrantes
socket.on('LINES_CLEARED', (payload: LinesClearedPayload) => {
  // Vérifier la structure
  if (!payload?.room || typeof payload?.count !== 'number') return;
  // Vérifier les bornes métier
  if (payload.count < 1 || payload.count > 4) return;
  // Vérifier que le joueur est autorisé
  const player = game.getPlayer(socket.id);
  if (!player?.isAlive) return;

  game.applyPenalty(player, payload.count);
});
```

### 13.7 ⚠️ Piège : `io` vs `socket` pour les broadcasts

```typescript
// socket.emit()      → envoie UNIQUEMENT à CE client
// socket.to(room)    → envoie à tous les membres de la room SAUF ce socket
// io.to(room).emit() → envoie à TOUS les membres de la room (y compris ce socket)

// Cas d'usage :
player.emit('NEW_PIECE', piece);                      // À ce joueur uniquement ✅
socket.to(roomName).emit('PLAYER_JOINED', info);      // À tous sauf le nouveau ✅
io.to(roomName).emit('GAME_STARTED', {});             // À tout le monde ✅
```

---

## 📌 Récapitulatif des règles essentielles

| Règle | Statut | Détail |
|---|---|---|
| Classes `Player`, `Piece`, `Game` | ✅ Obligatoire | Avec `this`, méthodes d'instance |
| `this` côté serveur | ✅ Autorisé | Contrairement au client |
| Pas de persistence | ✅ Obligatoire | Tout en mémoire (`Map`, tableaux) |
| Pièces partagées par room | ✅ Obligatoire | Même séquence, mêmes indices |
| Socket.IO pour la communication | ✅ Obligatoire | Pas de polling HTTP |
| Couverture tests ≥ 70% | ✅ Obligatoire | Statements, Functions, Lines |
| Couverture branches ≥ 50% | ✅ Obligatoire | — |
| `.env` gitignored | ✅ Obligatoire | Ne jamais commit PORT, secrets |
| Validation des payloads | ✅ Fortement recommandé | Toujours vérifier les données entrantes |
| Nettoyage des rooms vides | ✅ Obligatoire | Éviter les memory leaks |
